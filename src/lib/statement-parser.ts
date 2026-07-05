/**
 * Client-side bank statement parser.
 *
 * CSV — parsed on-device with papaparse.
 *       Tries to auto-detect columns by common header names used across
 *       Nigerian and international banks.
 *       Detects both debit and credit columns.
 *
 * PDF — text extraction happens server-side; this file provides the helper to
 *       convert the server's response into ImportRow objects.
 *
 * Auto-categorisation uses keyword matching on the description to assign the
 * most likely income or expense category. The user can always override.
 */
import Papa from 'papaparse';
import type { ExpenseCategory, IncomeCategory } from '../types';

// ─── Shared types ─────────────────────────────────────────────────────────────

export type TxnType = 'credit' | 'debit';

export interface ImportRow {
  id:          string;
  date:        string;           // 'YYYY-MM-DD'
  description: string;
  amount:      number;           // positive integer in minor unit (kobo × 100)
  type:        TxnType;
  category:    ExpenseCategory | IncomeCategory;
  selected:    boolean;
}

// ─── Auto-categorisation ──────────────────────────────────────────────────────

const INCOME_KW: Record<IncomeCategory, string[]> = {
  salary:     ['salary', 'wages', 'payroll', 'pay slip', 'staff pay'],
  freelance:  ['freelance', 'contract pay', 'consulting', 'service fee', 'invoice'],
  business:   ['business', 'sales', 'revenue', 'business income'],
  investment: ['dividend', 'interest', 'investment return', 'profit', 'returns'],
  rental:     ['rent received', 'rental', 'lease income', 'property income'],
  transfer:   ['transfer', 'nip', 'rtgs', 'eft', 'interbank', 'trf'],
  refund:     ['refund', 'reversal', 'reversed', 'chargeback', 'rebate', 'cashback'],
  other:      [],
};

const EXPENSE_KW: Record<ExpenseCategory, string[]> = {
  food:          ['restaurant', 'kfc', 'mcdonald', 'eatery', 'food', 'snack', 'grocery', 'supermarket', 'uber eats', 'jumia food', 'chicken republic', 'mr biggs', 'domino'],
  transport:     ['uber', 'bolt', 'taxi', 'fuel', 'petrol', 'diesel', 'transport', 'bus', 'train', 'toll', 'parking', 'flight', 'airfare'],
  shopping:      ['shop', 'mall', 'purchase', 'amazon', 'jumia', 'konga', 'shoprite', 'market'],
  entertainment: ['netflix', 'spotify', 'showmax', 'dstv', 'gotv', 'cinema', 'game', 'apple tv', 'youtube premium', 'streaming', 'subscription', 'canva', 'adobe', 'microsoft', 'apple one', 'google one'],
  housing:       ['rent', 'housing', 'mortgage', 'estate', 'agent fee', 'caution fee'],
  utilities:     ['electricity', 'nepa', 'ibedc', 'phcn', 'ekedc', 'water bill', 'gas', 'airtime', 'data', 'mtn', 'airtel', 'glo', 'insurance', 'premium', 'nhia'],
  health:        ['hospital', 'clinic', 'pharmacy', 'health', 'medical', 'doctor', 'drug', 'nhis', 'treatment'],
  family:        ['school fees', 'tuition', 'family', 'childcare'],
  education:     ['school', 'education', 'course', 'training', 'book', 'library', 'certification'],
  savings:       ['savings', 'piggybank', 'investment plan', 'save'],
  gifts:         ['gift', 'donation', 'charity', 'giving'],
  other:         [],
};

export function guessIncomeCategory(desc: string): IncomeCategory {
  const lower = desc.toLowerCase();
  for (const [cat, kws] of Object.entries(INCOME_KW) as [IncomeCategory, string[]][]) {
    if (cat === 'other') continue;
    if (kws.some(kw => lower.includes(kw))) return cat;
  }
  return 'other';
}

export function guessExpenseCategory(desc: string): ExpenseCategory {
  const lower = desc.toLowerCase();
  for (const [cat, kws] of Object.entries(EXPENSE_KW) as [ExpenseCategory, string[]][]) {
    if (cat === 'other') continue;
    if (kws.some(kw => lower.includes(kw))) return cat;
  }
  return 'other';
}

export function guessCategory(type: TxnType, desc: string): ExpenseCategory | IncomeCategory {
  return type === 'credit'
    ? guessIncomeCategory(desc)
    : guessExpenseCategory(desc);
}

// ─── Date normalisation ───────────────────────────────────────────────────────

const MONTHS: Record<string, string> = {
  jan:'01', feb:'02', mar:'03', apr:'04', may:'05', jun:'06',
  jul:'07', aug:'08', sep:'09', oct:'10', nov:'11', dec:'12',
};

export function normaliseDate(raw: string): string {
  const s = raw.trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;

  let m = s.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})$/);
  if (m) return `${m[3]}-${m[2].padStart(2,'0')}-${m[1].padStart(2,'0')}`;

  m = s.match(/^(\d{4})\/(\d{1,2})\/(\d{1,2})$/);
  if (m) return `${m[1]}-${m[2].padStart(2,'0')}-${m[3].padStart(2,'0')}`;

  m = s.match(/^(\d{1,2})\s+([A-Za-z]{3})\s+(\d{4})$/);
  if (m) {
    const mo = MONTHS[m[2].toLowerCase()];
    if (mo) return `${m[3]}-${mo}-${m[1].padStart(2,'0')}`;
  }

  m = s.match(/^([A-Za-z]{3})\s+(\d{1,2}),?\s+(\d{4})$/);
  if (m) {
    const mo = MONTHS[m[1].toLowerCase()];
    if (mo) return `${m[3]}-${mo}-${m[2].padStart(2,'0')}`;
  }

  return '';
}

// ─── Column-header matcher ────────────────────────────────────────────────────

function findCol(headers: string[], candidates: string[]): number {
  const norm = headers.map(h => h.toLowerCase().trim());
  for (const c of candidates) {
    const idx = norm.findIndex(h => h.includes(c));
    if (idx !== -1) return idx;
  }
  return -1;
}

// ─── CSV → ImportRow[] ────────────────────────────────────────────────────────

export function parseCSV(csvText: string): ImportRow[] {
  const result = Papa.parse<string[]>(csvText.trim(), {
    skipEmptyLines: true,
    header:         false,
  });

  if (!result.data || result.data.length < 2) return [];

  const rawHeaders = result.data[0] as string[];
  const rows       = result.data.slice(1) as string[][];

  const dateIdx = findCol(rawHeaders, [
    'date', 'trans date', 'transaction date', 'value date', 'posting date', 'txn date',
  ]);
  const descIdx = findCol(rawHeaders, [
    'description', 'narration', 'narrative', 'details', 'remarks',
    'particulars', 'transaction details', 'reference', 'memo',
  ]);

  // Try to find separate debit and credit columns
  const debitIdx = findCol(rawHeaders, [
    'debit', 'withdrawal', 'withdrawals', 'outflow', 'dr', 'debit amount', 'paid out',
  ]);
  const creditIdx = findCol(rawHeaders, [
    'credit', 'lodgement', 'lodgements', 'deposit', 'deposits', 'inflow', 'cr',
    'credit amount', 'paid in', 'receipts',
  ]);

  // Fall back to generic "amount" if no split columns
  const amtIdx = debitIdx !== -1 || creditIdx !== -1
    ? -1
    : findCol(rawHeaders, ['amount', 'transaction amount', 'value']);

  if (dateIdx === -1) return [];
  if (debitIdx === -1 && creditIdx === -1 && amtIdx === -1) return [];

  const parsed: ImportRow[] = [];
  let counter = 0;

  for (const row of rows) {
    if (row.length <= dateIdx) continue;

    const date = normaliseDate(row[dateIdx] ?? '');
    if (!date) continue;

    let amount = 0;
    let type: TxnType = 'debit';

    if (debitIdx !== -1 || creditIdx !== -1) {
      // Separate debit/credit columns
      const rawDebit  = debitIdx  !== -1 ? (row[debitIdx]  ?? '').replace(/[^0-9.]/g, '') : '';
      const rawCredit = creditIdx !== -1 ? (row[creditIdx] ?? '').replace(/[^0-9.]/g, '') : '';
      const nDebit  = rawDebit  ? parseFloat(rawDebit)  : 0;
      const nCredit = rawCredit ? parseFloat(rawCredit) : 0;

      if (nCredit > 0 && nDebit === 0) {
        amount = Math.round(nCredit * 100);
        type   = 'credit';
      } else if (nDebit > 0) {
        amount = Math.round(nDebit * 100);
        type   = 'debit';
      } else {
        continue; // no amount
      }
    } else {
      // Single amount column
      const rawAmt = (row[amtIdx] ?? '').replace(/[^0-9.]/g, '');
      const n = parseFloat(rawAmt);
      if (isNaN(n) || n <= 0) continue;
      amount = Math.round(n * 100);
      type   = 'debit'; // single-column CSVs are typically expense-only
    }

    const description = (
      descIdx !== -1 ? (row[descIdx] ?? '').trim() : ''
    ) || 'Imported transaction';

    parsed.push({
      id:          String(++counter),
      date,
      description,
      amount,
      type,
      category:    guessCategory(type, description),
      selected:    true,
    });
    if (parsed.length >= 300) break;
  }

  return parsed;
}

// ─── Server PDF response → ImportRow[] ───────────────────────────────────────

export function fromServerTransactions(
  txns: Array<{ date: string; description: string; amount: number; type: TxnType }>,
): ImportRow[] {
  return txns.map((t, i) => ({
    id:          String(i + 1),
    date:        t.date,
    description: t.description,
    amount:      t.amount,
    type:        t.type,
    category:    guessCategory(t.type, t.description),
    selected:    true,
  }));
}
