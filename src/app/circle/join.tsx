/**
 * circle/join.tsx — backward-compat redirect
 *
 * Old deep link scheme was aku://circle/join?code=XXXX
 * Route was renamed to pool/join.tsx → aku://pool/join
 *
 * This file silently redirects any old link to the current route,
 * preserving the ?code= param so the join flow works end-to-end.
 */
import { Redirect, useLocalSearchParams } from 'expo-router';

export default function LegacyCircleJoin() {
  const { code } = useLocalSearchParams<{ code?: string }>();
  const href = code
    ? (`/pool/join?code=${encodeURIComponent(code)}` as const)
    : '/pool/join';
  return <Redirect href={href as never} />;
}
