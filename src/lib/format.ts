/**
 * Akù — Amount formatting utilities.
 * All stored amounts are in the user's base currency minor unit (e.g. kobo for NGN,
 * pesewas for GHS, cents for USD). When the user switches display currency,
 * `convertKobo` applies the exchange-rate cross-rate before formatting.
 */

export interface FormatOptions {
  /** Currency symbol prefix. Reads from user preferences ideally; defaults to ₦. */
  symbol?: string;
}

/**
 * Full formatted amount. e.g. kobo=100000 → "₦1,000"
 */
export function formatAmount(kobo: number, symbol = '₦'): string {
  const naira = kobo / 100;
  return `${symbol}${naira.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`;
}

/**
 * Compact amount. e.g. kobo=10000000 → "₦100K", kobo=100000000 → "₦1M"
 * Max 2 decimal places, trailing zeros stripped.
 */
export function formatCompact(kobo: number, symbol = '₦'): string {
  const naira = kobo / 100;
  if (naira >= 1_000_000_000) {
    const v = naira / 1_000_000_000;
    return `${symbol}${trimDecimals(v, 2)}B`;
  }
  if (naira >= 1_000_000) {
    const v = naira / 1_000_000;
    return `${symbol}${trimDecimals(v, 2)}M`;
  }
  if (naira >= 1_000) {
    const v = naira / 1_000;
    return `${symbol}${trimDecimals(v, 1)}K`;
  }
  return `${symbol}${naira.toLocaleString('en-US', { maximumFractionDigits: 0 })}`;
}

function trimDecimals(n: number, places: number): string {
  return parseFloat(n.toFixed(places)).toString();
}

/**
 * Percentage string. e.g. 0.75 → "75%"
 */
export function formatPercent(ratio: number): string {
  return `${Math.round(ratio * 100)}%`;
}

/**
 * Convert a minor-unit amount (kobo/pesewas/cents) from one currency to another
 * using USD-based exchange rates (e.g. from exchangerate-api.com v4).
 *
 * fromCode / toCode must match the keys in `rates` (e.g. 'NGN', 'GHS').
 * Returns the original amount unchanged if either rate is missing.
 */
export function convertKobo(
  kobo: number,
  fromCode: string,
  toCode: string,
  rates: Record<string, number>,
): number {
  if (!fromCode || !toCode || fromCode === toCode) return kobo;
  const fromRate = rates[fromCode];
  const toRate   = rates[toCode];
  if (!fromRate || !toRate) return kobo;
  return Math.round(kobo * (toRate / fromRate));
}
