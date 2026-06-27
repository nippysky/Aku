/**
 * Lightweight in-memory store for data collected during the onboarding flow.
 * Onboarding is a single linear session — no persistence across app restarts
 * is needed, and this avoids any native module dependency.
 */
const _store: Record<string, string> = {};

export const OnboardingStorage = {
  setName:  (v: string) => { _store['name']  = v; },
  getName:  ()          => _store['name']  ?? '',
  setEmail: (v: string) => { _store['email'] = v; },
  getEmail: ()          => _store['email'] ?? '',
  clear:    ()          => { Object.keys(_store).forEach((k) => { delete _store[k]; }); },
};
