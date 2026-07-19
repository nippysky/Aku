/**
 * Akù Sync Engine
 *
 * Orchestrates push + pull of encrypted financial data between the device
 * and the server. All data is encrypted with the user's DEK (from sync.store)
 * before leaving the device. The server stores only ciphertext.
 *
 * Push: INCREMENTAL — only rows updated since the last successful push are
 *       encrypted and uploaded (batches of 200). A 60-second overlap window
 *       guards against clock skew and writes racing a push.
 * Deletes: local deletes are queued as tombstones (app_state.pending_deletes)
 *       and pushed as isDeleted records so they propagate to other devices
 *       and never resurrect on a fresh restore.
 * Pull: fetches encrypted deltas (since lastSyncAt), decrypts, upserts locally.
 * Conflict: last-write-wins on clientUpdatedAt. If local is newer, skip.
 * Soft-delete: isDeleted=true → remove the local row.
 */

import { eq } from 'drizzle-orm';
import { getDatabase, schema } from '../database/client';
import { encryptRecord, decryptRecord } from './crypto';
import { syncPush, syncPull, reportInsight, type UserInsightPayload } from '../api-client';
import { useSyncStore } from '../../store/sync.store';
import { trackReviewEvent } from '../review';

// ─── Types ────────────────────────────────────────────────────────────────────

type EntityType = 'expense' | 'bill' | 'goal' | 'goal_contribution' | 'income' | 'recurring_expense' | 'recurring_income';

interface LocalRecord {
  syncId:     string;   // stable sync-record ID: type-prefix + entity UUID
  entityType: EntityType;
  entityId:   string;
  payload:    object;
  updatedAt:  string;
}

interface PulledRecord {
  id:               string;
  entityType:       string;
  entityId:         string;
  encryptedPayload: string;
  clientUpdatedAt:  string | Date;
  serverUpdatedAt:  string | Date;
  isDeleted:        boolean;
}

// ─── Delete tombstones ────────────────────────────────────────────────────────
// Local deletes are queued here (app_state table) and drained by pushAll as
// isDeleted tombstones. Without this, deleted items would linger on the server
// and resurrect on a fresh device restore.

const PENDING_DELETES_KEY = 'pending_deletes';

const SYNC_PREFIX: Record<EntityType, string> = {
  expense:           'exp',
  bill:              'bill',
  goal:              'goal',
  goal_contribution: 'gc',
  income:            'inc',
  recurring_expense: 'rexp',
  recurring_income:  'rinc',
};

interface PendingDelete {
  entityType: EntityType;
  entityId:   string;
  deletedAt:  string;
}

async function readPendingDeletes(db: ReturnType<typeof getDatabase>): Promise<PendingDelete[]> {
  try {
    const [row] = await db.select().from(schema.appState)
      .where(eq(schema.appState.key, PENDING_DELETES_KEY)).limit(1);
    return row ? (JSON.parse(row.value) as PendingDelete[]) : [];
  } catch {
    return [];
  }
}

async function writePendingDeletes(
  db: ReturnType<typeof getDatabase>,
  queue: PendingDelete[],
): Promise<void> {
  const value = JSON.stringify(queue);
  await db.insert(schema.appState)
    .values({ key: PENDING_DELETES_KEY, value })
    .onConflictDoUpdate({ target: schema.appState.key, set: { value } });
}

/** Queue a deleted entity for tombstone push. Call before/after the local delete. */
export async function queueDelete(entityType: EntityType, entityId: string): Promise<void> {
  const db    = getDatabase();
  const queue = await readPendingDeletes(db);
  if (!queue.some((q) => q.entityType === entityType && q.entityId === entityId)) {
    queue.push({ entityType, entityId, deletedAt: new Date().toISOString() });
    await writePendingDeletes(db, queue);
  }
}

// ─── Push ─────────────────────────────────────────────────────────────────────

/** Overlap window re-pushed on every sync to absorb clock skew / races. */
const PUSH_OVERLAP_MS = 60_000;

export async function pushAll(): Promise<void> {
  const { dek, lastPushAt } = useSyncStore.getState();
  if (!dek) return; // no DEK = local-only mode; silently skip

  // Captured BEFORE reading rows — any write racing this push lands after
  // this timestamp and is safely included in the next push.
  const pushStartedAt = new Date().toISOString();

  // Incremental cutoff: only rows updated after (lastPushAt − overlap)
  const cutoff = lastPushAt
    ? new Date(new Date(lastPushAt).getTime() - PUSH_OVERLAP_MS).toISOString()
    : null;

  const db = getDatabase();
  const records: LocalRecord[] = [];

  const [expenses, bills, goals, contribs, incomeRows, recurringExpRows, recurringIncRows] = await Promise.all([
    db.select().from(schema.expenses),
    db.select().from(schema.bills),
    db.select().from(schema.goals),
    db.select().from(schema.goalContributions),
    db.select().from(schema.income),
    db.select().from(schema.recurringExpenses),
    db.select().from(schema.recurringIncome),
  ]);

  for (const e of expenses) {
    records.push({ syncId: `exp_${e.id}`, entityType: 'expense', entityId: e.id, payload: e, updatedAt: e.updatedAt });
  }
  for (const b of bills) {
    records.push({ syncId: `bill_${b.id}`, entityType: 'bill', entityId: b.id, payload: b, updatedAt: b.updatedAt });
  }
  for (const g of goals) {
    records.push({ syncId: `goal_${g.id}`, entityType: 'goal', entityId: g.id, payload: g, updatedAt: g.updatedAt });
  }
  for (const c of contribs) {
    records.push({ syncId: `gc_${c.id}`, entityType: 'goal_contribution', entityId: c.id, payload: c, updatedAt: c.createdAt });
  }
  for (const r of incomeRows) {
    records.push({ syncId: `inc_${r.id}`, entityType: 'income', entityId: r.id, payload: r, updatedAt: r.updatedAt });
  }
  for (const r of recurringExpRows) {
    records.push({ syncId: `rexp_${r.id}`, entityType: 'recurring_expense', entityId: r.id, payload: r, updatedAt: r.updatedAt });
  }
  for (const r of recurringIncRows) {
    records.push({ syncId: `rinc_${r.id}`, entityType: 'recurring_income', entityId: r.id, payload: r, updatedAt: r.updatedAt });
  }

  // ── Incremental filter: skip rows already pushed ───────────────────────────
  const changed = cutoff
    ? records.filter((r) => r.updatedAt > cutoff)
    : records;

  // ── Pending delete tombstones ──────────────────────────────────────────────
  const pendingDeletes = await readPendingDeletes(db);

  if (changed.length === 0 && pendingDeletes.length === 0) {
    // Nothing new — still advance the cursor so the overlap window moves on.
    useSyncStore.getState().setLastPushAt(pushStartedAt);
    return;
  }

  const BATCH = 200;
  for (let i = 0; i < changed.length; i += BATCH) {
    const batch = changed.slice(i, i + BATCH);
    const encrypted = await Promise.all(
      batch.map(async (r) => ({
        id:               r.syncId,
        entityType:       r.entityType,
        entityId:         r.entityId,
        encryptedPayload: await encryptRecord(r.payload, dek),
        clientUpdatedAt:  r.updatedAt,
        isDeleted:        false,
      })),
    );
    await syncPush(encrypted);
  }

  // Push tombstones (empty payload + isDeleted per the server contract)
  if (pendingDeletes.length > 0) {
    for (let i = 0; i < pendingDeletes.length; i += BATCH) {
      const batch = pendingDeletes.slice(i, i + BATCH);
      await syncPush(batch.map((d) => ({
        id:               `${SYNC_PREFIX[d.entityType]}_${d.entityId}`,
        entityType:       d.entityType,
        entityId:         d.entityId,
        encryptedPayload: '',
        clientUpdatedAt:  d.deletedAt,
        isDeleted:        true,
      })));
    }
    // All tombstones accepted — clear the queue
    await writePendingDeletes(db, []);
  }

  // Success — advance the incremental cursor
  useSyncStore.getState().setLastPushAt(pushStartedAt);
}

// ─── Pull ─────────────────────────────────────────────────────────────────────

export async function pullAndMerge(since?: string | null): Promise<void> {
  const { dek } = useSyncStore.getState();
  if (!dek) return;

  const { records, pulledAt } = await syncPull(since ?? undefined);

  if (!records || records.length === 0) {
    // Nothing new — still advance the cursor (server-authoritative timestamp)
    // so WS-triggered pulls stay cheap instead of re-fetching the same delta.
    if (pulledAt) useSyncStore.getState().setLastSyncAt(pulledAt);
    return;
  }

  // Track successful pull for app review prompt (fire-and-forget)
  trackReviewEvent().catch(() => {});

  const db  = getDatabase();
  const now = new Date().toISOString();

  for (const rec of records as PulledRecord[]) {
    const serverTs = rec.clientUpdatedAt instanceof Date
      ? rec.clientUpdatedAt.toISOString()
      : String(rec.clientUpdatedAt);

    if (rec.isDeleted) {
      await deleteLocal(db, rec.entityType as EntityType, rec.entityId);
      continue;
    }

    let payload: Record<string, unknown>;
    try {
      payload = decryptRecord<Record<string, unknown>>(rec.encryptedPayload, dek);
    } catch {
      console.warn('[sync] Failed to decrypt record', rec.entityType, rec.entityId);
      continue;
    }

    await upsertLocal(db, rec.entityType as EntityType, payload, serverTs, now);
  }

  // Advance the pull cursor with the server's own timestamp (immune to
  // device clock skew) — every subsequent pull is a true delta.
  if (pulledAt) useSyncStore.getState().setLastSyncAt(pulledAt);

  // Notify screens that new data is available — they watch syncVersion and
  // silently reload their stores without showing skeleton loaders.
  useSyncStore.getState().bumpSyncVersion();
}

// ─── Insight computation ──────────────────────────────────────────────────────
//
// Reads local SQLite (already decrypted in-app) and derives lightweight signals
// for the server's notification personalisation engine. No raw amounts are sent
// — only ratios, streaks, category names, and boolean flags.

async function computeInsight(): Promise<UserInsightPayload> {
  const db  = getDatabase();
  const now = new Date();

  // Date boundaries
  const startOfMonth     = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`;
  const startOfWeekDate  = new Date(now);
  startOfWeekDate.setUTCDate(now.getUTCDate() - now.getUTCDay()); // Sunday
  startOfWeekDate.setUTCHours(0, 0, 0, 0);
  const startOfWeekStr   = startOfWeekDate.toISOString().slice(0, 10);
  const startOfLastWeek  = new Date(startOfWeekDate);
  startOfLastWeek.setUTCDate(startOfLastWeek.getUTCDate() - 7);
  const startOfLastWeekStr = startOfLastWeek.toISOString().slice(0, 10);

  // Pull all expenses (amounts in kobo — only used for relative comparisons)
  const allExpenses = await db.select().from(schema.expenses);

  // Yesterday's total — the one raw amount reported to the server, so the
  // notification worker can compose the "you spent X yesterday" push (the
  // first notification of the day) while the app is closed.
  const yesterdayDate = new Date(now);
  yesterdayDate.setDate(yesterdayDate.getDate() - 1);
  const yesterdayStr  = yesterdayDate.toISOString().slice(0, 10);
  const yesterdayExpenses    = allExpenses.filter((e) => e.date === yesterdayStr);
  const yesterdayExpenseTotal = yesterdayExpenses.reduce((s, e) => s + e.amount, 0);
  const yesterdayExpenseCount = yesterdayExpenses.length;

  // Monthly expenses
  const thisMonthExp = allExpenses.filter((e) => e.date >= startOfMonth);

  // Top category by total amount this month
  const categoryTotals: Record<string, number> = {};
  for (const e of thisMonthExp) {
    categoryTotals[e.category] = (categoryTotals[e.category] ?? 0) + e.amount;
  }
  const topCategory = Object.entries(categoryTotals)
    .sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;

  // Weekly change %
  const thisWeekTotal  = allExpenses
    .filter((e) => e.date >= startOfWeekStr)
    .reduce((s, e) => s + e.amount, 0);
  const lastWeekTotal  = allExpenses
    .filter((e) => e.date >= startOfLastWeekStr && e.date < startOfWeekStr)
    .reduce((s, e) => s + e.amount, 0);
  const weeklyChangePct: number | null = lastWeekTotal > 0
    ? Math.round(((thisWeekTotal - lastWeekTotal) / lastWeekTotal) * 100)
    : null;

  // Spending streak — consecutive days with ≥ 1 expense, counting back from today
  const expenseDaySet = new Set(allExpenses.map((e) => e.date.slice(0, 10)));
  let streak          = 0;
  const checkDay      = new Date(now);
  checkDay.setUTCHours(0, 0, 0, 0);
  while (expenseDaySet.has(checkDay.toISOString().slice(0, 10))) {
    streak++;
    checkDay.setUTCDate(checkDay.getUTCDate() - 1);
  }

  // Goals on track: saved ≥ 80 % of expected progress given deadline
  const allGoals   = await db.select().from(schema.goals);
  const activeGoals = allGoals.filter((g) => !g.isCompleted);
  const goalsOnTrack = activeGoals.filter((g) => {
    if (!g.targetDate) return true;          // no deadline → always on track
    if (!g.targetAmount || g.targetAmount === 0) return false;
    const deadline   = new Date(g.targetDate);
    const created    = new Date(g.createdAt);
    const totalMs    = deadline.getTime() - created.getTime();
    if (totalMs <= 0) return false;
    const elapsedMs  = now.getTime() - created.getTime();
    const expectedPct = Math.min(elapsedMs / totalMs, 1);
    const actualPct   = (g.savedAmount ?? 0) / g.targetAmount;
    return actualPct >= expectedPct * 0.8;
  }).length;

  // Savings rate this month: % of income KEPT. Unified-ledger economics:
  // 'savings'-category expenses (goal contributions, savings transfers) are
  // money kept, not money spent — so they're excluded from the spend side.
  // Powers milestone-tailored push notifications (celebrate ≥ 20 %, warn < 0).
  const allIncome       = await db.select().from(schema.income);
  const thisMonthIncome = allIncome
    .filter((r) => r.date >= startOfMonth)
    .reduce((s2, r) => s2 + r.amount, 0);
  const thisMonthSpend  = thisMonthExp
    .filter((e) => e.category !== 'savings')
    .reduce((s2, e) => s2 + e.amount, 0);
  const savingsRatePct: number | null = thisMonthIncome > 0
    ? Math.round(((thisMonthIncome - thisMonthSpend) / thisMonthIncome) * 100)
    : null;

  return {
    spendingStreak:      streak,
    weeklyChangePct,
    monthlyExpenseCount: thisMonthExp.length,
    topCategory,
    totalGoalsCount:     activeGoals.length,
    goalsOnTrack,
    hasActiveGoals:      activeGoals.length > 0,
    savingsRatePct,
    yesterdayExpenseTotal,
    yesterdayExpenseCount,
  };
}

// ─── Full sync ────────────────────────────────────────────────────────────────

export async function fullSync(): Promise<void> {
  const store = useSyncStore.getState();
  if (store.isSyncing) return; // prevent concurrent syncs
  store.setSyncing(true);
  store.setSyncError(null);
  try {
    await pushAll();
    await pullAndMerge(store.lastSyncAt);
    // lastSyncAt is advanced inside pullAndMerge using the server timestamp

    // Fire-and-forget: report insight signals to server for push personalisation.
    // Non-critical — never blocks sync or surfaces an error to the user.
    computeInsight()
      .then((insight) => reportInsight(insight))
      .catch(() => { /* silent — insight reporting is best-effort */ });

  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Sync failed';
    store.setSyncError(msg);
    // Non-fatal — local data remains intact
  } finally {
    store.setSyncing(false);
  }
}

// ─── Local upsert helpers ─────────────────────────────────────────────────────

type DB = ReturnType<typeof getDatabase>;

async function upsertLocal(
  db: DB,
  entityType: EntityType,
  payload: Record<string, unknown>,
  serverTs: string,
  _now: string,
): Promise<void> {
  try {
    switch (entityType) {
      case 'expense': {
        const e = payload as typeof schema.expenses.$inferSelect;
        const [existing] = await db.select({ updatedAt: schema.expenses.updatedAt })
          .from(schema.expenses).where(eq(schema.expenses.id, e.id)).limit(1);
        if (existing && existing.updatedAt >= serverTs) return;
        await db.insert(schema.expenses).values(e)
          .onConflictDoUpdate({ target: schema.expenses.id, set: { ...e, updatedAt: serverTs } });
        break;
      }
      case 'bill': {
        const b = payload as typeof schema.bills.$inferSelect;
        const [existing] = await db.select({ updatedAt: schema.bills.updatedAt })
          .from(schema.bills).where(eq(schema.bills.id, b.id)).limit(1);
        if (existing && existing.updatedAt >= serverTs) return;
        await db.insert(schema.bills).values(b)
          .onConflictDoUpdate({ target: schema.bills.id, set: { ...b, updatedAt: serverTs } });
        break;
      }
      case 'goal': {
        const g = payload as typeof schema.goals.$inferSelect;
        const [existing] = await db.select({ updatedAt: schema.goals.updatedAt })
          .from(schema.goals).where(eq(schema.goals.id, g.id)).limit(1);
        if (existing && existing.updatedAt >= serverTs) return;
        await db.insert(schema.goals).values(g)
          .onConflictDoUpdate({ target: schema.goals.id, set: { ...g, updatedAt: serverTs } });
        break;
      }
      case 'goal_contribution': {
        const c = payload as typeof schema.goalContributions.$inferSelect;
        // Contributions are immutable — insert-only, never update
        await db.insert(schema.goalContributions).values(c).onConflictDoNothing();
        break;
      }
      case 'income': {
        const r = payload as typeof schema.income.$inferSelect;
        const [existing] = await db.select({ updatedAt: schema.income.updatedAt })
          .from(schema.income).where(eq(schema.income.id, r.id)).limit(1);
        if (existing && existing.updatedAt >= serverTs) return;
        await db.insert(schema.income).values(r)
          .onConflictDoUpdate({ target: schema.income.id, set: { ...r, updatedAt: serverTs } });
        break;
      }
      case 'recurring_expense': {
        const r = payload as typeof schema.recurringExpenses.$inferSelect;
        const [existing] = await db.select({ updatedAt: schema.recurringExpenses.updatedAt })
          .from(schema.recurringExpenses).where(eq(schema.recurringExpenses.id, r.id)).limit(1);
        if (existing && existing.updatedAt >= serverTs) return;
        await db.insert(schema.recurringExpenses).values(r)
          .onConflictDoUpdate({ target: schema.recurringExpenses.id, set: { ...r, updatedAt: serverTs } });
        break;
      }
      case 'recurring_income': {
        const r = payload as typeof schema.recurringIncome.$inferSelect;
        const [existing] = await db.select({ updatedAt: schema.recurringIncome.updatedAt })
          .from(schema.recurringIncome).where(eq(schema.recurringIncome.id, r.id)).limit(1);
        if (existing && existing.updatedAt >= serverTs) return;
        await db.insert(schema.recurringIncome).values(r)
          .onConflictDoUpdate({ target: schema.recurringIncome.id, set: { ...r, updatedAt: serverTs } });
        break;
      }
    }
  } catch (err) {
    console.warn('[sync] upsertLocal failed', entityType, err);
  }
}

async function deleteLocal(db: DB, entityType: EntityType, entityId: string): Promise<void> {
  try {
    switch (entityType) {
      case 'expense':
        await db.delete(schema.expenses).where(eq(schema.expenses.id, entityId));
        break;
      case 'bill':
        await db.delete(schema.bills).where(eq(schema.bills.id, entityId));
        break;
      case 'goal':
        await db.delete(schema.goals).where(eq(schema.goals.id, entityId));
        break;
      case 'goal_contribution':
        await db.delete(schema.goalContributions).where(eq(schema.goalContributions.id, entityId));
        break;
      case 'income':
        await db.delete(schema.income).where(eq(schema.income.id, entityId));
        break;
      case 'recurring_expense':
        await db.delete(schema.recurringExpenses).where(eq(schema.recurringExpenses.id, entityId));
        break;
      case 'recurring_income':
        await db.delete(schema.recurringIncome).where(eq(schema.recurringIncome.id, entityId));
        break;
    }
  } catch { /* ignore — row may already be gone */ }
}
