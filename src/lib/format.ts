/**
 * Akù — Amount formatting utilities.
 * All stored amounts are in kobo (integer). Display in naira.
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
  return `${symbol}${naira.toLocaleString('en-NG', { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`;
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
  return `${symbol}${naira.toLocaleString('en-NG', { maximumFractionDigits: 0 })}`;
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
