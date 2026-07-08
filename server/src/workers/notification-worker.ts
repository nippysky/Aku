/**
 * Akù Notification Worker — PM2 background process
 *
 * Sends personalised push notifications across three tiers:
 *
 * ── Tier 1 · Behavioural signals (server-only) ───────────────────────────────
 *   Segments every user into one of:
 *     • New user   (account < 3 days old)  → onboarding sequence (day 1/2/3)
 *     • Dormant    (no sync in 7+ days)     → strong re-engagement
 *     • Lapsing    (no sync in 3–6 days)    → gentle nudge
 *     • Active     (synced recently)         → standard or personalised
 *
 * ── Tier 2 · App-reported insights ──────────────────────────────────────────
 *   After each sync the app posts lightweight financial signals
 *   (budget %, streak, top category, weekly delta) to POST /api/notifications/insight.
 *   The worker reads these to craft personalised message variants:
 *     • Over-budget alert  · Budget warning (>80 %)  · Streak celebration
 *     • Weekly spend spike / drop  · Top-category callout  · Goal nudge
 *
 * ── Tier 3 · Smart delivery timing ──────────────────────────────────────────
 *   Runs every hour at :00.
 *   Determines which IANA timezones are currently showing 19:xx (daily) or
 *   Sunday 18:xx (weekly) and notifies only those users.
 *   DST-safe: Intl.DateTimeFormat tracks DST automatically.
 *   Users with no stored timezone fall back to UTC 19:00 / Sunday 18:00.
 *
 * Deduplication:
 *   notification_log (unique userId + type + sentDate) prevents double-sends
 *   across restarts or concurrent workers.
 *
 * Scale: paginated queries, Expo batches of 100, O(PAGE_SIZE) RAM.
 * Graceful shutdown: SIGTERM/SIGINT drains current batch then exits.
 */
import 'dotenv/config';
import { randomBytes } from 'node:crypto';
import { isNotNull, notInArray, sql, eq, max } from 'drizzle-orm';
import { db } from '../db/client.js';
import { pushTokens, notificationLog, users, userInsights, syncRecords } from '../db/schema.js';
import { sendExpoPush } from '../lib/expo-push.js';

// ─── Types ────────────────────────────────────────────────────────────────────

interface PushPayload {
  title:     string;
  body:      string;
  channelId: string;
  data:      Record<string, string>;
}

interface UserRow {
  userId:              string;
  token:               string;
  timezone:            string | null;
  createdAt:           Date;
  lastSyncAt:          Date | null;
  budgetUtilization:   number | null;
  hasOverBudget:       boolean | null;
  spendingStreak:      number | null;
  weeklyChangePct:     number | null;
  monthlyExpenseCount: number | null;
  topCategory:         string | null;
  hasActiveGoals:      boolean | null;
  goalsOnTrack:        number | null;
  totalGoalsCount:     number | null;
}

// ─── Constants ────────────────────────────────────────────────────────────────

const PAGE_SIZE      = 500;
const DORMANT_HOURS  = 7 * 24;
const LAPSING_HOURS  = 3 * 24;
const NEW_USER_DAYS  = 3;

// ─── Helpers ──────────────────────────────────────────────────────────────────

function generateId(): string {
  return randomBytes(16).toString('hex');
}

function todayUTC(): string {
  return new Date().toISOString().slice(0, 10);
}

/** Returns the local hour (0–23) for a given IANA timezone at `now`. -1 on error. */
function localHourIn(timezone: string, now: Date): number {
  try {
    const parts = new Intl.DateTimeFormat('en-US', {
      timeZone: timezone,
      hour:     'numeric',
      hour12:   false,
    }).formatToParts(now);
    const h = parts.find((p) => p.type === 'hour')?.value;
    return h !== undefined ? parseInt(h, 10) : -1;
  } catch {
    return -1;
  }
}

/** Returns the local weekday short name ('Sun', 'Mon', …) for a timezone. */
function localWeekdayIn(timezone: string, now: Date): string {
  try {
    return new Intl.DateTimeFormat('en-US', {
      timeZone: timezone,
      weekday:  'short',
    }).format(now);
  } catch {
    return '';
  }
}

/** Returns the set of IANA timezones stored in push_tokens. */
async function allStoredTimezones(): Promise<string[]> {
  const rows = await db
    .selectDistinct({ timezone: pushTokens.timezone })
    .from(pushTokens)
    .where(isNotNull(pushTokens.timezone));
  return rows.map((r) => r.timezone!);
}

// ─── Message selection — Tier 1 + Tier 2 ─────────────────────────────────────

function pickDailyMessage(u: UserRow, now: Date): PushPayload {
  const msPerHour    = 3_600_000;
  const accountAgeH  = (now.getTime() - u.createdAt.getTime()) / msPerHour;
  const lastSyncAgeH = u.lastSyncAt
    ? (now.getTime() - u.lastSyncAt.getTime()) / msPerHour
    : Infinity;

  const baseData = { type: 'daily_reminder', screen: 'expenses', action: 'log' };

  // ── NEW USER onboarding sequence (days 1 / 2 / 3) ──────────────────────
  if (accountAgeH < NEW_USER_DAYS * 24) {
    const dayNum = Math.floor(accountAgeH / 24) + 1;

    if (dayNum === 1) return {
      title:     'Welcome to Akù! 👋',
      body:      'Log your first expense to start tracking your money.',
      channelId: 'digest',
      data:      { ...baseData, screen: 'expenses' },
    };

    if (dayNum === 2) return {
      title:     'Set a budget today 🎯',
      body:      'Budgets show you exactly where your money is going.',
      channelId: 'digest',
      data:      { ...baseData, screen: 'budgets' },
    };

    return {
      title:     'Create your first savings goal 💰',
      body:      'What are you saving for? Akù makes it easy to track progress.',
      channelId: 'digest',
      data:      { ...baseData, screen: 'goals' },
    };
  }

  // ── DORMANT re-engagement (7+ days silent) ──────────────────────────────
  if (lastSyncAgeH >= DORMANT_HOURS) {
    const days = Math.floor(lastSyncAgeH / 24);
    return {
      title:     'Your finances need you 🚨',
      body:      `You haven't logged anything in ${days} days. Don't lose track!`,
      channelId: 'digest',
      data:      { ...baseData, action: 'reopen' },
    };
  }

  // ── LAPSING nudge (3–6 days silent) ────────────────────────────────────
  if (lastSyncAgeH >= LAPSING_HOURS) {
    return {
      title:     'Haven\'t seen you in a bit 👀',
      body:      'A quick expense log keeps your finances sharp. Tap to catch up.',
      channelId: 'digest',
      data:      baseData,
    };
  }

  // ── ACTIVE user — Tier 2 personalisation ────────────────────────────────

  if (u.hasOverBudget) return {
    title:     '⚠️ Budget exceeded!',
    body:      'You\'ve gone over budget this period. Tap to review your spending.',
    channelId: 'digest',
    data:      { ...baseData, screen: 'budgets' },
  };

  if (u.budgetUtilization != null && u.budgetUtilization >= 0.8) {
    const pct = Math.round(u.budgetUtilization * 100);
    return {
      title:     `Budget at ${pct}% 🔴`,
      body:      'You\'re close to your limit — time to review what\'s left.',
      channelId: 'digest',
      data:      { ...baseData, screen: 'budgets' },
    };
  }

  if (u.spendingStreak != null && u.spendingStreak >= 3) return {
    title:     `${u.spendingStreak}-day logging streak! 🔥`,
    body:      'Keep the momentum — log today\'s expenses.',
    channelId: 'digest',
    data:      baseData,
  };

  if (u.weeklyChangePct != null && u.weeklyChangePct >= 20) return {
    title:     `Spending up ${Math.round(u.weeklyChangePct)}% this week 📈`,
    body:      u.topCategory
      ? `${u.topCategory} is your biggest driver. Tap to review.`
      : 'Tap to see what\'s driving it.',
    channelId: 'digest',
    data:      { ...baseData, screen: 'expenses' },
  };

  if (u.weeklyChangePct != null && u.weeklyChangePct <= -20) return {
    title:     `Spending down ${Math.abs(Math.round(u.weeklyChangePct))}% this week 📉`,
    body:      'Great discipline! Log today to keep it up.',
    channelId: 'digest',
    data:      baseData,
  };

  if (u.topCategory && u.monthlyExpenseCount != null && u.monthlyExpenseCount >= 5) return {
    title:     `${u.topCategory} is your top spend this month 💡`,
    body:      'Tap to see your full breakdown.',
    channelId: 'digest',
    data:      { ...baseData, screen: 'expenses' },
  };

  if (
    u.hasActiveGoals &&
    u.totalGoalsCount != null &&
    u.goalsOnTrack != null &&
    u.goalsOnTrack < u.totalGoalsCount
  ) {
    const behind = u.totalGoalsCount - u.goalsOnTrack;
    return {
      title:     `${behind} goal${behind > 1 ? 's' : ''} need${behind === 1 ? 's' : ''} attention 🎯`,
      body:      'You\'re falling behind on savings. Contribute today.',
      channelId: 'digest',
      data:      { ...baseData, screen: 'goals' },
    };
  }

  // ── Default ─────────────────────────────────────────────────────────────
  return {
    title:     'How did you spend today? 💸',
    body:      'Take 30 seconds to log your expenses. Every penny counts.',
    channelId: 'digest',
    data:      baseData,
  };
}

function pickWeeklyMessage(u: UserRow): PushPayload {
  const data = { type: 'weekly_summary', screen: 'home' };

  if (u.weeklyChangePct != null && u.weeklyChangePct >= 25) return {
    title:     `Spending jumped ${Math.round(u.weeklyChangePct)}% this week 📈`,
    body:      u.topCategory
      ? `${u.topCategory} was your biggest expense. See your full review.`
      : 'Your week in review — see where the money went.',
    channelId: 'digest',
    data,
  };

  if (u.weeklyChangePct != null && u.weeklyChangePct <= -25) return {
    title:     `Great week — spending down ${Math.abs(Math.round(u.weeklyChangePct))}% 📉`,
    body:      'You spent less than last week. Keep it up!',
    channelId: 'digest',
    data,
  };

  if (u.topCategory) return {
    title:     'Your week in review 📊',
    body:      `${u.topCategory} was your top category. Tap for the full breakdown.`,
    channelId: 'digest',
    data,
  };

  if (u.hasActiveGoals && u.goalsOnTrack != null && u.totalGoalsCount != null) {
    const onTrack = u.goalsOnTrack;
    const total   = u.totalGoalsCount;
    if (total > 0) return {
      title:     'Your week in review 📊',
      body:      `${onTrack} of ${total} goal${total > 1 ? 's' : ''} on track. See how your week shaped up.`,
      channelId: 'digest',
      data,
    };
  }

  return {
    title:     'Your week in review 📊',
    body:      'See how your finances shaped up this week.',
    channelId: 'digest',
    data,
  };
}

// ─── Core personalised send ───────────────────────────────────────────────────

/**
 * Query eligible users (matching timezones, not yet notified today),
 * pick a personalised message per user, group by identical variant,
 * send each variant as one Expo batch, then log to notification_log.
 */
async function runPersonalisedJob(
  notifType:       'daily_reminder' | 'weekly_summary',
  activeTimezones: Set<string>,
  includeNullTz:   boolean,
  now:             Date,
): Promise<void> {
  const date = todayUTC();
  console.log(
    `[worker] ${notifType} | ${date} | tzCount=${activeTimezones.size} | nullTz=${includeNullTz}`,
  );

  if (activeTimezones.size === 0 && !includeNullTz) return;

  let sent   = 0;
  let offset = 0;

  while (true) {
    if (shutdownRequested) break;

    // Sub-query: users already notified today
    const alreadySent = db
      .select({ userId: notificationLog.userId })
      .from(notificationLog)
      .where(
        sql`${notificationLog.type} = ${notifType}
            AND ${notificationLog.sentDate} = ${date}`,
      );

    // Fetch page of users with their push token + insights
    const rows = await db
      .select({
        userId:              pushTokens.userId,
        token:               pushTokens.token,
        timezone:            pushTokens.timezone,
        createdAt:           users.createdAt,
        budgetUtilization:   userInsights.budgetUtilization,
        hasOverBudget:       userInsights.hasOverBudget,
        spendingStreak:      userInsights.spendingStreak,
        weeklyChangePct:     userInsights.weeklyChangePct,
        monthlyExpenseCount: userInsights.monthlyExpenseCount,
        topCategory:         userInsights.topCategory,
        hasActiveGoals:      userInsights.hasActiveGoals,
        goalsOnTrack:        userInsights.goalsOnTrack,
        totalGoalsCount:     userInsights.totalGoalsCount,
      })
      .from(pushTokens)
      .innerJoin(users, eq(pushTokens.userId, users.id))
      .leftJoin(userInsights, eq(userInsights.userId, pushTokens.userId))
      .where(notInArray(pushTokens.userId, alreadySent))
      .limit(PAGE_SIZE)
      .offset(offset);

    if (rows.length === 0) break;

    // Filter to matching timezones (in-process; avoids complex SQL array binding)
    const eligibleRows = rows.filter((r) => {
      if (r.timezone && activeTimezones.has(r.timezone)) return true;
      if (!r.timezone && includeNullTz) return true;
      return false;
    });

    if (eligibleRows.length > 0) {
      // Batch-load last sync time for this page's users
      const uniqueIds = [...new Set(eligibleRows.map((r) => r.userId))];
      const syncRows  = await db
        .select({ userId: syncRecords.userId, lastSync: max(syncRecords.serverUpdatedAt) })
        .from(syncRecords)
        .where(
          sql`${syncRecords.userId} IN (${sql.join(uniqueIds.map((id) => sql`${id}`), sql`, `)})`,
        )
        .groupBy(syncRecords.userId);

      const lastSyncMap = new Map<string, Date>(
        syncRows
          .filter((s) => s.lastSync !== null)
          .map((s) => [s.userId, new Date(s.lastSync as Date)]),
      );

      // Build per-user personalised messages and group by identical variant
      const variantMap = new Map<string, { tokens: string[]; userIds: string[]; payload: PushPayload }>();

      for (const row of eligibleRows) {
        const userRow: UserRow = {
          userId:              row.userId,
          token:               row.token,
          timezone:            row.timezone,
          createdAt:           row.createdAt,
          lastSyncAt:          lastSyncMap.get(row.userId) ?? null,
          budgetUtilization:   row.budgetUtilization,
          hasOverBudget:       row.hasOverBudget,
          spendingStreak:      row.spendingStreak,
          weeklyChangePct:     row.weeklyChangePct,
          monthlyExpenseCount: row.monthlyExpenseCount,
          topCategory:         row.topCategory,
          hasActiveGoals:      row.hasActiveGoals,
          goalsOnTrack:        row.goalsOnTrack,
          totalGoalsCount:     row.totalGoalsCount,
        };

        const payload = notifType === 'daily_reminder'
          ? pickDailyMessage(userRow, now)
          : pickWeeklyMessage(userRow);

        const variantKey = `${payload.title}|||${payload.body}`;
        if (!variantMap.has(variantKey)) {
          variantMap.set(variantKey, { tokens: [], userIds: [], payload });
        }
        const entry = variantMap.get(variantKey)!;
        entry.tokens.push(row.token);
        entry.userIds.push(row.userId);
      }

      // Send each variant + log
      for (const { tokens, userIds, payload } of variantMap.values()) {
        if (shutdownRequested) break;
        try {
          await sendExpoPush(tokens, payload);
        } catch (err) {
          console.error(`[worker] Expo send error (${payload.title}):`, err);
        }

        for (const userId of userIds) {
          try {
            await db.insert(notificationLog).values({
              id:       generateId(),
              userId,
              type:     notifType,
              sentDate: date,
              sentAt:   now,
            });
          } catch {
            // Unique constraint hit — already logged, safe to ignore
          }
        }
        sent += tokens.length;
      }

      console.log(`[worker] ${notifType}: page offset=${offset}, sent=${sent}`);
    }

    offset += PAGE_SIZE;
  }

  console.log(`[worker] ${notifType} complete — ${sent} device(s) notified.`);
}

// ─── Hourly check — Tier 3 smart timing ──────────────────────────────────────

/**
 * Fired at the top of every hour.
 * Determines which timezones are showing 19:xx (daily) or Sunday 18:xx (weekly)
 * and runs the personalised job for those users.
 */
async function hourlyCheck(): Promise<void> {
  const now     = new Date();
  const utcHour = now.getUTCHours();

  const storedTimezones = await allStoredTimezones();

  // ── Daily reminder: find TZs where local hour = 19 ──────────────────────
  const dailyTzs = new Set<string>(
    storedTimezones.filter((tz) => localHourIn(tz, now) === 19),
  );
  const includeNullForDaily = utcHour === 19;

  if (dailyTzs.size > 0 || includeNullForDaily) {
    await runPersonalisedJob('daily_reminder', dailyTzs, includeNullForDaily, now);
  }

  // ── Weekly summary: find TZs where it's Sunday AND local hour = 18 ──────
  const weeklyTzs = new Set<string>(
    storedTimezones.filter(
      (tz) => localWeekdayIn(tz, now) === 'Sun' && localHourIn(tz, now) === 18,
    ),
  );
  const isUtcSunday         = now.getUTCDay() === 0;
  const includeNullForWeekly = isUtcSunday && utcHour === 18;

  if (weeklyTzs.size > 0 || includeNullForWeekly) {
    await runPersonalisedJob('weekly_summary', weeklyTzs, includeNullForWeekly, now);
  }
}

// ─── Scheduler ────────────────────────────────────────────────────────────────

let shutdownRequested = false;

function scheduleNextHour(): void {
  const now          = new Date();
  const msToNextHour =
    (60 - now.getUTCMinutes()) * 60_000
    - now.getUTCSeconds()      * 1_000
    - now.getUTCMilliseconds();

  const nextRun = new Date(now.getTime() + msToNextHour);
  console.log(
    `[worker] Next hourly check: ${nextRun.toISOString()} (${Math.round(msToNextHour / 60_000)} min)`,
  );

  setTimeout(async () => {
    if (shutdownRequested) return;
    try {
      await hourlyCheck();
    } catch (err) {
      console.error('[worker] hourlyCheck error:', err);
    }
    scheduleNextHour();
  }, msToNextHour);
}

// ─── Graceful shutdown ────────────────────────────────────────────────────────

process.on('SIGTERM', () => {
  console.log('[worker] SIGTERM — draining current batch (max 20 s)…');
  shutdownRequested = true;
  setTimeout(() => process.exit(0), 20_000);
});

process.on('SIGINT', () => {
  shutdownRequested = true;
  setTimeout(() => process.exit(0), 20_000);
});

// ─── Start ────────────────────────────────────────────────────────────────────

console.log('[worker] Akù notification worker starting…');
console.log('[worker] Mode: hourly timezone-aware · Tier 1 (behavioural) + Tier 2 (insights) + Tier 3 (smart timing)');

scheduleNextHour();

// Heartbeat every 6 h
setInterval(() => {
  const h = new Date().getUTCHours();
  const m = new Date().getUTCMinutes();
  if (m === 0 && h % 6 === 0) {
    console.log(`[worker] ❤ alive at ${new Date().toISOString()}`);
  }
}, 60_000).unref();

console.log('[worker] Scheduler live — first check fires at the top of the next hour.');
