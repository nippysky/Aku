/**
 * useCurrencyFormat — formatting hook for Akù.
 *
 * Returns `fmt(kobo)` and `fmtCompact(kobo)` that:
 *  1. Convert kobo from the user's base currency to the selected display currency
 *     using live exchange rates (if available).
 *  2. Format with the correct currency symbol.
 *
 * Components that call this hook will re-render whenever the user changes
 * currency — so they always stay in sync.
 */
import { useCallback } from 'react';
import { useUIStore } from '../store/ui.store';
import { formatAmount, formatCompact, convertKobo } from '../lib/format';

export function useCurrencyFormat() {
  const currency         = useUIStore((s) => s.currency);
  const baseCurrencyCode = useUIStore((s) => s.baseCurrencyCode);
  const exchangeRates    = useUIStore((s) => s.exchangeRates);

  const convert = useCallback(
    (kobo: number): number => {
      // No-op when: rates not yet loaded, no base set, or already in display currency
      if (
        !exchangeRates ||
        !baseCurrencyCode ||
        baseCurrencyCode === currency.code
      ) {
        return kobo;
      }
      const converted = convertKobo(kobo, baseCurrencyCode, currency.code, exchangeRates);
      // convertKobo returns the original if either rate is missing — accept that gracefully
      return converted;
    },
    [currency.code, baseCurrencyCode, exchangeRates],
  );

  const fmt = useCallback(
    (kobo: number): string => formatAmount(convert(kobo), currency.symbol),
    [convert, currency.symbol],
  );

  const fmtCompact = useCallback(
    (kobo: number): string => formatCompact(convert(kobo), currency.symbol),
    [convert, currency.symbol],
  );

  return { fmt, fmtCompact, symbol: currency.symbol, convert };
}
