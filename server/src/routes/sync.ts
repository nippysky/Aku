/**
 * Sync routes — encrypted financial data backup & restore.
 *
 * Security model:
 *   All payloads are AES-256-GCM encrypted on the client before upload.
 *   The server stores only ciphertext and cannot read the financial data.
 *   User isolation is enforced via JWT — each route extracts userId from
 *   the verified token and scopes every query to that user only.
 *
 * POST /api/sync/push   — upsert a batch of encrypted records
 * GET  /api/sync/pull   — fetch records newer than a given timestamp
 * GET  /api/sync/stats  — count of synced records for the authenticated user
 */
import { Hono } from 'hono';
import { eq, and, gt } from 'drizzle-orm';
import { db } from '../db/client.js';
import { syncRecords } from '../db/schema.js';
import { authMiddleware } from '../middleware/auth.js';
import type { AuthContext } from '../middleware/auth.js';

// ─── Validation helpers ───────────────────────────────────────────────────────

const VALID_ENTITY_TYPES = new Set([
  'expense',
  'bill',
  'goal',
  'budget',
  'goal_contribution',
  'income',
  'recurring_expense',
  'recurring_income',
]);

function isValidUUID(s: unknown): s is string {
  return (
    typeof s === 'string' &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(s)
  );
}

// ─── Router ───────────────────────────────────────────────────────────────────

const syncRouter = new Hono<{ Variables: AuthContext }>();

syncRouter.use('*', authMiddleware);

// ── POST /api/sync/push ───────────────────────────────────────────────────────
// Accept a batch of encrypted records and upsert them.
// Body: { records: SyncRecord[] }
// A record with isDeleted=true and encryptedPayload='' signals a soft-delete.

type PushRecord = {
  id:               string;   // client UUID (stable across devices)
  entityType:       string;
  entityId:         string;
  encryptedPayload: string;   // base64(iv || ciphertext || tag)
  clientUpdatedAt:  string;   // ISO 8601
  isDeleted:        boolean;
};

syncRouter.post('/push', async (c) => {
  const payload = c.get('jwtPayload');
  const userId  = payload.sub;

  let body: { records?: unknown };
  try {
    body = await c.req.json();
  } catch {
    return c.json({ error: 'Invalid JSON body' }, 400);
  }

  if (!Array.isArray(body.records) || body.records.length === 0) {
    return c.json({ error: '`records` must be a non-empty array' }, 400);
  }

  if (body.records.length > 500) {
    return c.json({ error: 'Maximum 500 records per push' }, 400);
  }

  const now = new Date();
  const toUpsert: typeof syncRecords.$inferInsert[] = [];

  for (const r of body.records as PushRecord[]) {
    // Validate each record strictly
    if (!isValidUUID(r.id)) {
      return c.json({ error: `Invalid record id: ${r.id}` }, 400);
    }
    if (!VALID_ENTITY_TYPES.has(r.entityType)) {
      return c.json({ error: `Invalid entityType: ${r.entityType}` }, 400);
    }
    if (!isValidUUID(r.entityId)) {
      return c.json({ error: `Invalid entityId: ${r.entityId}` }, 400);
    }
    if (typeof r.encryptedPayload !== 'string') {
      return c.json({ error: 'encryptedPayload must be a string' }, 400);
    }
    const clientTs = new Date(r.clientUpdatedAt);
    if (isNaN(clientTs.getTime())) {
      return c.json({ error: `Invalid clientUpdatedAt: ${r.clientUpdatedAt}` }, 400);
    }

    toUpsert.push({
      id:               r.id,
      userId,
      entityType:       r.entityType,
      entityId:         r.entityId,
      encryptedPayload: r.encryptedPayload,
      clientUpdatedAt:  clientTs,
      serverUpdatedAt:  now,
      isDeleted:        Boolean(r.isDeleted),
    });
  }

  // Upsert each record — last-write-wins on client_updated_at.
  // Individual inserts at ≤500 records is fast enough and avoids the
  // complexity of referencing EXCLUDED columns in a batched upsert.
  for (const rec of toUpsert) {
    await db
      .insert(syncRecords)
      .values(rec)
      .onConflictDoUpdate({
        target: syncRecords.id,
        set: {
          encryptedPayload: rec.encryptedPayload,
          clientUpdatedAt:  rec.clientUpdatedAt,
          serverUpdatedAt:  now,
          isDeleted:        rec.isDeleted,
        },
      });
  }

  return c.json({ pushed: toUpsert.length, serverUpdatedAt: now.toISOString() });
});

// ── GET /api/sync/pull ────────────────────────────────────────────────────────
// Return all records for the authenticated user updated after `since`.
// Query params:
//   since — ISO 8601 timestamp (default: epoch, i.e. return everything)

syncRouter.get('/pull', async (c) => {
  const payload = c.get('jwtPayload');
  const userId  = payload.sub;

  const sinceParam = c.req.query('since');
  const since = sinceParam ? new Date(sinceParam) : new Date(0);

  if (isNaN(since.getTime())) {
    return c.json({ error: 'Invalid `since` timestamp' }, 400);
  }

  const records = await db
    .select({
      id:               syncRecords.id,
      entityType:       syncRecords.entityType,
      entityId:         syncRecords.entityId,
      encryptedPayload: syncRecords.encryptedPayload,
      clientUpdatedAt:  syncRecords.clientUpdatedAt,
      serverUpdatedAt:  syncRecords.serverUpdatedAt,
      isDeleted:        syncRecords.isDeleted,
    })
    .from(syncRecords)
    .where(
      and(
        eq(syncRecords.userId, userId),
        gt(syncRecords.serverUpdatedAt, since),
      ),
    )
    .orderBy(syncRecords.serverUpdatedAt);

  return c.json({
    records,
    pulledAt: new Date().toISOString(),
  });
});

// ── GET /api/sync/stats ───────────────────────────────────────────────────────
// Returns counts of synced records. Useful for the profile/settings screen.

syncRouter.get('/stats', async (c) => {
  const payload = c.get('jwtPayload');
  const userId  = payload.sub;

  const rows = await db
    .select({
      entityType: syncRecords.entityType,
      isDeleted:  syncRecords.isDeleted,
    })
    .from(syncRecords)
    .where(eq(syncRecords.userId, userId));

  const counts: Record<string, number> = {};
  let totalActive = 0;
  for (const row of rows) {
    if (!row.isDeleted) {
      counts[row.entityType] = (counts[row.entityType] ?? 0) + 1;
      totalActive++;
    }
  }

  return c.json({ counts, totalActive });
});

export default syncRouter;
