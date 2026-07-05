/**
 * review.ts — App store review prompt
 *
 * Strategy:
 *   - Track a "review-eligible event" counter in SQLite appState.
 *   - After the 3rd eligible event (sync pull or contribution verified),
 *     call StoreReview.requestReview() once.
 *   - Never prompt again after the first prompt (set a `review_prompted` flag).
 *
 * This is best-effort — errors are silently swallowed so it never blocks callers.
 */
import * as StoreReview from 'expo-store-review';
import { getDatabase, schema } from './database/client';
import { eq } from 'drizzle-orm';

const KEY_COUNT    = 'review_event_count';
const KEY_PROMPTED = 'review_prompted';
const THRESHOLD    = 3;

// ─── Internal helpers ─────────────────────────────────────────────────────────

async function getAppStateValue(key: string): Promise<string | null> {
  try {
    const db  = getDatabase();
    const row = await db
      .select({ value: schema.appState.value })
      .from(schema.appState)
      .where(eq(schema.appState.key, key))
      .limit(1);
    return row[0]?.value ?? null;
  } catch {
    return null;
  }
}

async function setAppStateValue(key: string, value: string): Promise<void> {
  try {
    const db = getDatabase();
    await db
      .insert(schema.appState)
      .values({ key, value })
      .onConflictDoUpdate({ target: schema.appState.key, set: { value } });
  } catch {
    // Non-critical
  }
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Call after each eligible event (sync pull success, contribution verified).
 * Internally increments the counter and fires the review prompt on the 3rd hit.
 * Safe to call anywhere — all DB operations and the review call are fire-and-forget.
 */
export async function trackReviewEvent(): Promise<void> {
  try {
    // Never prompt twice
    const prompted = await getAppStateValue(KEY_PROMPTED);
    if (prompted === 'true') return;

    // Increment counter
    const raw   = await getAppStateValue(KEY_COUNT);
    const count = (parseInt(raw ?? '0', 10) || 0) + 1;
    await setAppStateValue(KEY_COUNT, String(count));

    if (count < THRESHOLD) return;

    // Check OS-level availability
    const isAvailable = await StoreReview.isAvailableAsync();
    if (!isAvailable) return;

    // Fire prompt and mark as done
    await StoreReview.requestReview();
    await setAppStateValue(KEY_PROMPTED, 'true');
  } catch {
    // Non-critical — never bubble up to callers
  }
}
