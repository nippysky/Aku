/**
 * Statement parsing route
 * POST /api/statement/parse
 *   Body: { pdfBase64: string }
 *   Returns: { transactions: ParsedTransaction[] }
 *
 * Receives a base64-encoded PDF, extracts text via pdf-parse, then runs a
 * robust parser that:
 *  1. Auto-detects debit/credit columns from header keywords — works for any
 *     bank regardless of column label ("Withdrawals", "Debit", "Dr", etc.)
 *  2. Matches amounts as decimals OR large plain integers (e.g. 21000000)
 *  3. Returns type: 'credit' | 'debit' on every transaction
 *
 * Capped at 300 transactions per upload.
 */
import { Hono } from 'hono';
import pdfParse from 'pdf-parse';

const router = new Hono();

// ─── Types ────────────────────────────────────────────────────────────────────

export interface ParsedTransaction {
  date:        string;             // 'YYYY-MM-DD'
  description: string;
  amount:      number;             // positive integer in the currency's minor unit (kobo × 100)
  type:        'credit' | 'debit';
}

// ─── Date helpers ─────────────────────────────────────────────────────────────

const MONTHS: Record<string, string> = {
  jan:'01', feb:'02', mar:'03', apr:'04', may:'05', jun:'06',
  jul:'07', aug:'08', sep:'09', oct:'10', nov:'11', dec:'12',
};

function parseDate(raw: string): string | null {
  const s = raw.trim();

  // DD/MM/YYYY  or  DD-MM-YYYY
  let m = s.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})$/);
  if (m) return `${m[3]}-${m[2].padStart(2,'0')}-${m[1].padStart(2,'0')}`;

  // YYYY-MM-DD  or  YYYY/MM/DD
  m = s.match(/^(\d{4})[\/\-](\d{1,2})[\/\-](\d{1,2})$/);
  if (m) return `${m[1]}-${m[2].padStart(2,'0')}-${m[3].padStart(2,'0')}`;

  // DD Mon YYYY  e.g.  01 Jul 2026
  m = s.match(/^(\d{1,2})\s+([A-Za-z]{3})\s+(\d{4})$/);
  if (m) {
    const mo = MONTHS[m[2].toLowerCase()];
    if (mo) return `${m[3]}-${mo}-${m[1].padStart(2,'0')}`;
  }

  // Mon DD, YYYY  e.g.  Jul 01, 2026
  m = s.match(/^([A-Za-z]{3})\s+(\d{1,2}),?\s+(\d{4})$/);
  if (m) {
    const mo = MONTHS[m[1].toLowerCase()];
    if (mo) return `${m[3]}-${mo}-${m[2].padStart(2,'0')}`;
  }

  return null;
}

// ─── Amount pattern ───────────────────────────────────────────────────────────
// Matches:
//   - Numbers with decimals:        1,234.56 / 100.00 / 21,000,000.00
//   - Numbers with comma-thousands: 1,234,567
//   - Large plain integers:         21000000  (≥ 5 digits avoids matching 4-digit years)

const AMOUNT_PAT = /[\d,]+\.\d{1,2}|\d{1,3}(?:,\d{3})+|\d{5,}/g;

// ─── Noise-line filter ────────────────────────────────────────────────────────
// Lines that are definitely not transactions (bank charges meta-data, etc.)

const SKIP_LINE_RE = /^\s*(page|total|opening|closing|statement|period|account|sort code|iban|bic|swift|branch|vat|tax|fee\s+schedule|handling\s+charge|stamp\s+duty)/i;

// Lines where description itself is pure noise
const NOISE_DESC_RE = /^(vat|handling charge|sms|stamp duty|monthly fee|bank charges?|service charge)$/i;

// ─── Column detection ─────────────────────────────────────────────────────────
// Keyword groups for identifying debit and credit columns in header rows.
// Works for any bank — we look for the presence of BOTH a debit-family and a
// credit-family keyword in the same line to identify the header.

const DEBIT_KEYS  = ['debit', 'withdrawal', 'withdrawals', 'outflow', 'outgoing', 'dr ', ' dr', 'payment', 'paid out'];
const CREDIT_KEYS = ['credit', 'lodgement', 'lodgements', 'deposit', 'deposits', 'inflow', 'incoming', 'cr ', ' cr', 'receipts', 'paid in'];
const BALANCE_KEYS = ['balance', ' bal ', 'bal.'];

interface ColMap {
  debitPos:   number;
  creditPos:  number;
  balancePos: number;
  debitFirst: boolean;  // true if debit column appears left of credit column
}

function detectColumns(lines: string[]): ColMap | null {
  for (const line of lines.slice(0, 40)) {
    const lower = line.toLowerCase();

    const hasDebit  = DEBIT_KEYS.some(k => lower.includes(k));
    const hasCredit = CREDIT_KEYS.some(k => lower.includes(k));
    if (!hasDebit || !hasCredit) continue;

    let debitPos  = -1;
    let creditPos = -1;
    let balancePos = -1;

    for (const k of DEBIT_KEYS) {
      const i = lower.indexOf(k);
      if (i !== -1) { debitPos  = i; break; }
    }
    for (const k of CREDIT_KEYS) {
      const i = lower.indexOf(k);
      if (i !== -1) { creditPos = i; break; }
    }
    for (const k of BALANCE_KEYS) {
      const i = lower.indexOf(k);
      if (i !== -1) { balancePos = i; break; }
    }

    if (debitPos === -1 || creditPos === -1) continue;

    return {
      debitPos,
      creditPos,
      balancePos: balancePos !== -1 ? balancePos : Math.max(debitPos, creditPos) + 10,
      debitFirst: debitPos < creditPos,
    };
  }
  return null;
}

// ─── Amount finder (returns position + value) ─────────────────────────────────

interface AmtMatch {
  pos:    number;  // start character index in the line
  amount: number;  // in the currency's smallest unit × 100 (kobo)
}

function findAmounts(line: string): AmtMatch[] {
  const out: AmtMatch[] = [];
  const re = new RegExp(AMOUNT_PAT.source, 'g');
  let m: RegExpExecArray | null;
  while ((m = re.exec(line)) !== null) {
    const n = parseFloat(m[0].replace(/,/g, ''));
    if (n > 0 && n < 1_000_000_000_000) {
      out.push({ pos: m.index, amount: Math.round(n * 100) });
    }
  }
  return out;
}

// ─── Transaction type resolver ────────────────────────────────────────────────

/**
 * Given the amount candidates on a line (in left-to-right order) and the
 * detected column map, decide which amount is the transaction and whether it
 * is a debit or credit.
 *
 * Rules (in priority order):
 *  1. If we have column position info: closest column wins.
 *  2. If debit_first and 3+ amounts: amounts[0]=debit, amounts[1]=credit, last=balance.
 *     Whichever of amounts[0]/[1] is > 0 is the transaction.
 *  3. If 2 amounts: last = balance, first = transaction → type based on description.
 *  4. Default: 'debit'.
 */
function resolveTransaction(
  amts:    AmtMatch[],
  colMap:  ColMap | null,
  desc:    string,
): { amount: number; type: 'credit' | 'debit' } | null {
  if (amts.length === 0) return null;

  // With column map — use position to classify amounts
  if (colMap) {
    // Identify balance: the amount closest to balancePos (or rightmost if no balancePos)
    const balIdx = amts.reduce((best, a, i) => {
      const distA    = Math.abs(a.pos - colMap.balancePos);
      const distBest = Math.abs(amts[best].pos - colMap.balancePos);
      return distA < distBest ? i : best;
    }, amts.length - 1);

    const txnAmts = amts.filter((_, i) => i !== balIdx);

    if (txnAmts.length === 0) return null;

    // Pick the transaction amount and its type from its position
    for (const a of txnAmts) {
      if (a.amount === 0) continue;
      const dDebit  = Math.abs(a.pos - colMap.debitPos);
      const dCredit = Math.abs(a.pos - colMap.creditPos);
      const type: 'credit' | 'debit' = dCredit < dDebit ? 'credit' : 'debit';
      return { amount: a.amount, type };
    }
    return null;
  }

  // No column map — use count-based heuristic
  if (amts.length === 1) {
    // Only one amount — likely just the balance row; skip
    return null;
  }

  if (amts.length >= 3) {
    // Typical 3-column: debit | credit | balance
    // Most banks: debit comes before credit (left-to-right)
    // One of amounts[0] or amounts[1] is the transaction amount
    const balance = amts[amts.length - 1].amount;
    const a0 = amts[0].amount;
    const a1 = amts[1].amount;

    // The real transaction amount is the smaller one (balance is the running total)
    if (a0 < balance && a1 < balance) {
      // Both candidates are non-zero — pick a0 as debit (conventional ordering)
      return { amount: a0, type: 'debit' };
    }
    if (a0 < balance) return { amount: a0, type: guessTypeFromDesc(desc) };
    if (a1 < balance) return { amount: a1, type: guessTypeFromDesc(desc) };
    return null;
  }

  // 2 amounts: first = transaction, second = balance
  const txn = amts[0];
  const bal = amts[1];
  if (txn.amount >= bal.amount) {
    // Unexpected — first amount is as large as balance, might be balance itself
    return null;
  }
  return { amount: txn.amount, type: guessTypeFromDesc(desc) };
}

// ─── Description-based type guess ─────────────────────────────────────────────

const CREDIT_DESC_WORDS = [
  'salary', 'wages', 'payroll', 'pay credit', 'lodgement', 'refund', 'reversal',
  'credit', 'deposit', 'dividend', 'interest', 'inflow', 'received', 'incoming',
  'transfer in', 'inward', 'nip inward', 'rtgs inward',
];

const DEBIT_DESC_WORDS = [
  'withdrawal', 'atm', 'pos', 'purchase', 'payment', 'charge', 'fee', 'debit',
  'transfer out', 'outward', 'nip outward', 'ussd', 'bill payment',
];

function guessTypeFromDesc(desc: string): 'credit' | 'debit' {
  const lower = desc.toLowerCase();
  if (CREDIT_DESC_WORDS.some(w => lower.includes(w))) return 'credit';
  if (DEBIT_DESC_WORDS.some(w => lower.includes(w))) return 'debit';
  return 'debit'; // safe default
}

// ─── Date patterns ────────────────────────────────────────────────────────────

const DATE_PATS: RegExp[] = [
  /\b(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})\b/,
  /\b(\d{4})[\/\-](\d{1,2})[\/\-](\d{1,2})\b/,
  /\b(\d{1,2})\s+(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\s+(\d{4})\b/i,
  /\b(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\s+(\d{1,2}),?\s+(\d{4})\b/i,
];

// ─── Main parser ──────────────────────────────────────────────────────────────

export function parseStatementText(text: string): ParsedTransaction[] {
  const lines = text.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
  const colMap = detectColumns(lines);
  const out: ParsedTransaction[] = [];

  for (const line of lines) {
    if (SKIP_LINE_RE.test(line)) continue;

    // ── 1. Find a date token ──────────────────────────────────────────────────
    let dateStr: string | null = null;
    let dateEnd = 0;

    for (const pat of DATE_PATS) {
      const m = line.match(pat);
      if (m && m.index !== undefined) {
        dateStr = parseDate(m[0]);
        if (dateStr) {
          dateEnd = m.index + m[0].length;
          break;
        }
      }
    }
    if (!dateStr) continue;

    // ── 2. Find amounts ───────────────────────────────────────────────────────
    // Look in the full line so we have positions for column detection
    const allAmts = findAmounts(line);
    if (allAmts.length === 0) continue;

    // ── 3. Extract description: text between date and first amount ────────────
    const afterDate = line.slice(dateEnd);
    const firstAmtInAfter = (() => {
      const re = new RegExp(AMOUNT_PAT.source, 'g');
      return re.exec(afterDate);
    })();

    let description = 'Imported transaction';
    if (firstAmtInAfter) {
      const raw = afterDate.slice(0, firstAmtInAfter.index ?? 0);
      const cleaned = raw
        .replace(/\d{1,2}[\/\-]\d{1,2}[\/\-]\d{4}/g, '')  // strip value dates
        .replace(/[|]/g, ' ')
        .replace(/\s{2,}/g, ' ')
        .trim();
      if (cleaned.length > 1) description = cleaned;
    }

    if (NOISE_DESC_RE.test(description)) continue;

    // ── 4. Resolve transaction type ───────────────────────────────────────────
    const resolved = resolveTransaction(allAmts, colMap, description);
    if (!resolved) continue;

    out.push({
      date: dateStr,
      description,
      amount: resolved.amount,
      type:   resolved.type,
    });

    if (out.length >= 300) break;
  }

  return out;
}

// ─── Route ────────────────────────────────────────────────────────────────────

router.post('/parse', async (c) => {
  let body: { pdfBase64?: string };
  try {
    body = await c.req.json();
  } catch {
    return c.json({ error: 'Invalid JSON body' }, 400);
  }

  if (!body.pdfBase64) return c.json({ error: 'pdfBase64 is required' }, 400);

  let transactions: ParsedTransaction[];
  try {
    const buffer = Buffer.from(body.pdfBase64, 'base64');
    const pdf    = await pdfParse(buffer, { max: 0 });
    transactions = parseStatementText(pdf.text);
  } catch (err) {
    console.error('[statement] parse error:', err);
    return c.json({ error: 'Failed to parse PDF' }, 500);
  }

  return c.json({ transactions });
});

export default router;
