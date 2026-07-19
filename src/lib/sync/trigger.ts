/**
 * triggerPush — debounced post-write sync push.
 *
 * Call this from any store action that writes to SQLite (add/update/remove).
 * Multiple rapid writes within 400 ms are coalesced into a single network
 * request, so the server always has the latest data without hammering the API.
 *
 * Fire-and-forget — errors are silently swallowed (the next periodic sync
 * or foreground-trigger will catch any missed records).
 */

import { useSyncStore } from '../../store/sync.store';

type EntityType =
  | 'expense' | 'bill' | 'goal'
  | 'goal_contribution' | 'income'
  | 'recurring_expense' | 'recurring_income';

let timer: ReturnType<typeof setTimeout> | null = null;

export function triggerPush(): void {
  if (timer) clearTimeout(timer);
  timer = setTimeout(() => {
    timer = null;
    const { dek } = useSyncStore.getState();
    if (!dek) return; // local-only mode — nothing to push
    import('./engine').then(({ pushAll }) => pushAll().catch(() => {}));
  }, 400);
}

/**
 * triggerDelete — queue a delete tombstone, then schedule a push.
 * Ensures deletions propagate to the server and other devices instead of
 * silently disappearing only on this device.
 */
export function triggerDelete(entityType: EntityType, entityId: string): void {
  import('./engine')
    .then(({ queueDelete }) => queueDelete(entityType, entityId))
    .catch(() => {})
    .finally(() => triggerPush());
}
