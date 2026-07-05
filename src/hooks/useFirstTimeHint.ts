/**
 * useFirstTimeHint
 *
 * Returns whether a hint for the given key should be shown,
 * and a dismiss() function that persists the "seen" state to SQLite appState
 * so it never shows again.
 *
 * Usage:
 *   const { visible, dismiss } = useFirstTimeHint('hint_home_bell');
 */
import { useState, useEffect, useCallback } from 'react';
import { eq } from 'drizzle-orm';
import { getDatabase, schema } from '../lib/database/client';

export function useFirstTimeHint(key: string) {
  const [visible, setVisible] = useState(false);
  const [checked, setChecked] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const db  = getDatabase();
        const row = await db
          .select({ value: schema.appState.value })
          .from(schema.appState)
          .where(eq(schema.appState.key, key))
          .limit(1);

        // Show hint only if the key has never been set (i.e. never seen)
        if (!cancelled && !row[0]) {
          setVisible(true);
        }
      } catch {
        // Non-critical — don't show if DB fails
      } finally {
        if (!cancelled) setChecked(true);
      }
    })();
    return () => { cancelled = true; };
  }, [key]);

  const dismiss = useCallback(async () => {
    setVisible(false);
    try {
      const db = getDatabase();
      await db
        .insert(schema.appState)
        .values({ key, value: 'seen' })
        .onConflictDoUpdate({ target: schema.appState.key, set: { value: 'seen' } });
    } catch {
      // Non-critical
    }
  }, [key]);

  return { visible: checked && visible, dismiss };
}
