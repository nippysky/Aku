import { Hono } from 'hono';
import Tesseract from 'tesseract.js';

const router = new Hono();

// ─── OCR helpers ──────────────────────────────────────────────────────────────

/**
 * Parse a total amount from raw OCR text scraped from a receipt.
 * Strategy:
 *  1. Look for lines with "total", "amount", "sum", etc. + a number → use that.
 *  2. Fall back to the largest plausible number found anywhere in the text.
 *
 * Returns the amount in the smallest currency unit (kobo/cents, ×100), or null.
 */
function parseReceiptAmount(text: string): number | null {
  const lines = text.split(/\n+/).map((l) => l.trim()).filter(Boolean);

  const totalRe =
    /(?:total|amount|grand\s*total|subtotal|to\s*pay|balance|sum)\b[^0-9]*?([\d,]+(?:\.\d{1,2})?)/i;

  for (const line of lines) {
    const m = line.match(totalRe);
    if (m) {
      const n = parseFloat(m[1].replace(/,/g, ''));
      if (!isNaN(n) && n > 0 && n < 100_000_000) return Math.round(n * 100);
    }
  }

  // Fallback: largest number on the receipt (cap at ₦1M = 100_000_000 kobo)
  const numRe = /[\d,]+(?:\.\d{1,2})?/g;
  let max = 0;
  let raw: RegExpExecArray | null;
  const allText = lines.join(' ');
  while ((raw = numRe.exec(allText)) !== null) {
    const n = parseFloat(raw[0].replace(/,/g, ''));
    if (!isNaN(n) && n > max && n < 1_000_000) max = n;
  }

  return max > 0 ? Math.round(max * 100) : null;
}

// ─── Route ────────────────────────────────────────────────────────────────────

/**
 * POST /api/receipt/scan
 * Body:    { imageBase64: string }  — base64-encoded JPEG or PNG receipt image
 * Returns: { amount: number | null } — kobo/cents (×100), null if undetected
 */
router.post('/scan', async (c) => {
  try {
    const body = await c.req.json<{ imageBase64?: string }>();
    if (!body?.imageBase64) {
      return c.json({ error: 'imageBase64 is required' }, 400);
    }

    const buffer = Buffer.from(body.imageBase64, 'base64');

    // tesseract.js downloads language data on first use (~20 MB for English).
    // Subsequent calls use the local cache — typically < 1 s per image.
    const { data } = await Tesseract.recognize(buffer, 'eng', {
      logger: () => {}, // silence progress events
    });

    const amount = parseReceiptAmount(data.text ?? '');
    return c.json({ amount });
  } catch (err) {
    console.error('[receipt/scan] OCR error:', err);
    return c.json({ error: 'OCR processing failed' }, 500);
  }
});

export default router;
