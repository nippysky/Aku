import { Redirect } from 'expo-router';

/**
 * Root index — immediately hands off to the navigation guard in _layout.tsx.
 * The guard redirects to (onboarding), (auth), or (tabs) based on session state.
 */
export default function RootIndex() {
  return <Redirect href="/(onboarding)" />;
}
