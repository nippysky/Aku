/**
 * Root index — returns null so the navigation guard in _layout.tsx drives all
 * routing decisions. A hard redirect here would race with auth initialisation
 * and send returning users back to onboarding every cold start.
 */
export default function RootIndex() {
  return null;
}
