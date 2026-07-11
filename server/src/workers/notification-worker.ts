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

interface NotifPrefs {
  billReminders:  boolean;
  budgetAlerts:   boolean;
  goalMilestones: boolean;
  dailyDigest:    boolean;
}

const DEFAULT_PREFS: NotifPrefs = {
  billReminders:  true,
  budgetAlerts:   true,
  goalMilestones: true,
  dailyDigest:    true,  // server-worker default is enabled (user can opt out)
};

function parsePrefs(json: string | null): NotifPrefs {
  if (!json) return DEFAULT_PREFS;
  try {
    const parsed = JSON.parse(json) as Partial<NotifPrefs>;
    return {
      billReminders:  parsed.billReminders  ?? DEFAULT_PREFS.billReminders,
      budgetAlerts:   parsed.budgetAlerts   ?? DEFAULT_PREFS.budgetAlerts,
      goalMilestones: parsed.goalMilestones ?? DEFAULT_PREFS.goalMilestones,
      dailyDigest:    parsed.dailyDigest    ?? DEFAULT_PREFS.dailyDigest,
    };
  } catch {
    return DEFAULT_PREFS;
  }
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
  notifPrefsJson:      string | null;
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

/**
 * Pick a deterministic variant index based on userId + day-of-year (+ optional salt).
 * Ensures the same user gets a different message each day without relying on Math.random().
 */
function rotateIdx(userId: string, pool: number, salt = 0): number {
  const dayOfYear = Math.floor(Date.now() / 86_400_000);
  let hash = dayOfYear ^ salt;
  for (let i = 0; i < userId.length; i++) {
    hash = ((hash * 31) + userId.charCodeAt(i)) >>> 0;
  }
  return hash % pool;
}

function pickDailyMessage(u: UserRow, now: Date, prefs: NotifPrefs): PushPayload | null {
  const msPerHour    = 3_600_000;
  const accountAgeH  = (now.getTime() - u.createdAt.getTime()) / msPerHour;
  const lastSyncAgeH = u.lastSyncAt
    ? (now.getTime() - u.lastSyncAt.getTime()) / msPerHour
    : Infinity;

  const baseData = { type: 'daily_reminder', screen: 'expenses', action: 'log' };

  // ── NEW USER onboarding sequence (days 1 / 2 / 3) ──────────────────────────
  // Always send — user has not configured prefs yet.
  if (accountAgeH < NEW_USER_DAYS * 24) {
    const dayNum = Math.floor(accountAgeH / 24) + 1;

    if (dayNum === 1) return {
      title:     'Welcome to Akù! 👋',
      body:      'Tap to log your first expense and start understanding your money.',
      channelId: 'digest',
      data:      { ...baseData, screen: 'expenses' },
    };

    if (dayNum === 2) return {
      title:     'Set your first budget 🎯',
      body:      'Budgets keep your spending honest. Takes less than a minute to set up.',
      channelId: 'digest',
      data:      { ...baseData, screen: 'budgets' },
    };

    return {
      title:     'What are you saving for? 💰',
      body:      'Add a savings goal and watch Akù track your progress automatically.',
      channelId: 'digest',
      data:      { ...baseData, screen: 'goals' },
    };
  }

  // ── DORMANT re-engagement (7+ days silent) ─────────────────────────────────
  if (lastSyncAgeH >= DORMANT_HOURS && prefs.dailyDigest) {
    const days = Math.floor(lastSyncAgeH / 24);
    const pool: Array<{ title: string; body: string }> = [
      { title: 'Your finances are calling 📵', body: `${days} days without a log. Don't let the gaps pile up — open Akù now.` },
      { title: 'Still here for you 🤝',        body: `It has been ${days} days. A quick catch-up keeps your financial picture clear.` },
      { title: 'Where did the money go? 🔍',   body: `${days} days of untracked spending. Tap to fill the gaps before you forget.` },
    ];
    const { title, body } = pool[rotateIdx(u.userId, pool.length, 7)];
    return { title, body, channelId: 'digest', data: { ...baseData, action: 'reopen' } };
  }

  // ── LAPSING nudge (3–6 days silent) ───────────────────────────────────────
  if (lastSyncAgeH >= LAPSING_HOURS && prefs.dailyDigest) {
    const pool: Array<{ title: string; body: string }> = [
      { title: "Haven't seen you in a bit 👀",  body: 'A 30-second expense log keeps your finances sharp. Tap to catch up.' },
      { title: 'Your wallet has been busy 💳',  body: 'A few days have passed. Log what you spent before the details blur.' },
      { title: 'Consistency is the edge 📐',    body: 'Small daily logs add up to serious financial clarity. Tap to continue.' },
    ];
    const { title, body } = pool[rotateIdx(u.userId, pool.length, 3)];
    return { title, body, channelId: 'digest', data: baseData };
  }

  // ── ACTIVE user — Tier 2 personalisation ──────────────────────────────────

  // Budget alerts (gated by pref)
  if (prefs.budgetAlerts) {
    if (u.hasOverBudget) {
      const pool: Array<{ title: string; body: string }> = [
        { title: 'Budget exceeded! ⚠️',  body: 'You have gone over budget this period. Tap to see where the overspend happened.' },
        { title: 'Budget limit hit 🔴',   body: 'One or more budgets are maxed out. Time to review your spending.' },
      ];
      const { title, body } = pool[rotateIdx(u.userId, pool.length, 1)];
      return { title, body, channelId: 'digest', data: { ...baseData, screen: 'budgets' } };
    }

    if (u.budgetUtilization != null && u.budgetUtilization >= 0.9) {
      const pct = Math.round(u.budgetUtilization * 100);
      return {
        title:     `${pct}% of your budget used 🔴`,
        body:      'You are nearly at your limit. Review what is left before the period ends.',
        channelId: 'digest',
        data:      { ...baseData, screen: 'budgets' },
      };
    }

    if (u.budgetUtilization != null && u.budgetUtilization >= 0.8) {
      const pct = Math.round(u.budgetUtilization * 100);
      return {
        title:     `Budget at ${pct}% 🟡`,
        body:      'Approaching your budget ceiling. Tap to check your remaining headroom.',
        channelId: 'digest',
        data:      { ...baseData, screen: 'budgets' },
      };
    }
  }

  // Non-digest users: only goal nudges if goalMilestones is on
  if (!prefs.dailyDigest) {
    if (
      prefs.goalMilestones &&
      u.hasActiveGoals &&
      u.totalGoalsCount != null &&
      u.goalsOnTrack != null &&
      u.goalsOnTrack < u.totalGoalsCount
    ) {
      const behind = u.totalGoalsCount - u.goalsOnTrack;
      return {
        title:     `${behind} goal${behind > 1 ? 's' : ''} falling behind 🎯`,
        body:      `You are off-pace on ${behind === 1 ? 'a savings goal' : 'some savings goals'}. Contribute today to close the gap.`,
        channelId: 'digest',
        data:      { ...baseData, screen: 'goals' },
      };
    }
    return null;
  }

  // Streak celebrations — milestone tiers
  if (u.spendingStreak != null && u.spendingStreak >= 30) return {
    title:     `${u.spendingStreak}-day streak! You're unstoppable 🏆`,
    body:      'A month of consistent tracking. That is serious financial discipline. Keep it going.',
    channelId: 'digest',
    data:      baseData,
  };

  if (u.spendingStreak != null && u.spendingStreak >= 14) return {
    title:     `${u.spendingStreak} days in a row 🔥`,
    body:      'Two weeks of daily logs. You are building a habit that pays off — literally.',
    channelId: 'digest',
    data:      baseData,
  };

  if (u.spendingStreak != null && u.spendingStreak >= 7) return {
    title:     'Week-long streak 🔥',
    body:      `${u.spendingStreak} days logged in a row. This is how financial clarity is built.`,
    channelId: 'digest',
    data:      baseData,
  };

  if (u.spendingStreak != null && u.spendingStreak >= 3) return {
    title:     `${u.spendingStreak}-day logging streak 🔥`,
    body:      'You are on a roll. Keep the momentum — log today\'s expenses.',
    channelId: 'digest',
    data:      baseData,
  };

  // Spending spike (larger jump gets more urgent copy)
  if (u.weeklyChangePct != null && u.weeklyChangePct >= 30) {
    const pct = Math.round(u.weeklyChangePct);
    const pool: Array<{ title: string; body: string }> = [
      { title: `Spending up ${pct}% this week 📈`,        body: u.topCategory ? `${u.topCategory} is driving it. Tap to see the full breakdown.` : 'That is a big jump. Find out where the money is going.' },
      { title: `Heads up — ${pct}% more spent this week 📈`, body: u.topCategory ? `${u.topCategory} was your biggest category. Worth a quick look.` : 'Your spending spiked this week. Check expenses to stay on track.' },
    ];
    const { title, body } = pool[rotateIdx(u.userId, pool.length, 20)];
    return { title, body, channelId: 'digest', data: { ...baseData, screen: 'expenses' } };
  }

  if (u.weeklyChangePct != null && u.weeklyChangePct >= 20) {
    const pct = Math.round(u.weeklyChangePct);
    return {
      title:     `Spending up ${pct}% this week 📈`,
      body:      u.topCategory ? `${u.topCategory} is your biggest driver this week. Tap to review.` : 'Tap to see what is driving the increase.',
      channelId: 'digest',
      data:      { ...baseData, screen: 'expenses' },
    };
  }

  // Spending drop — positive reinforcement
  if (u.weeklyChangePct != null && u.weeklyChangePct <= -25) {
    const pct = Math.abs(Math.round(u.weeklyChangePct));
    const pool: Array<{ title: string; body: string }> = [
      { title: `Spending down ${pct}% this week 📉`,  body: 'Excellent discipline. Your future self thanks you. Log today to keep it up.' },
      { title: `You spent ${pct}% less this week 📉`, body: 'That restraint adds up. Keep tracking and watch it compound.' },
    ];
    const { title, body } = pool[rotateIdx(u.userId, pool.length, 25)];
    return { title, body, channelId: 'digest', data: baseData };
  }

  if (u.weeklyChangePct != null && u.weeklyChangePct <= -20) return {
    title:     `Spending down ${Math.abs(Math.round(u.weeklyChangePct))}% this week 📉`,
    body:      'Great discipline this week. Log today to extend the run.',
    channelId: 'digest',
    data:      baseData,
  };

  // Top-category callout
  if (u.topCategory && u.monthlyExpenseCount != null && u.monthlyExpenseCount >= 5) {
    const pool: Array<{ title: string; body: string }> = [
      { title: `${u.topCategory} is your top spend 💡`,          body: 'It is claiming the most from your budget this month. Tap to see the breakdown.' },
      { title: `Most of your money went to ${u.topCategory} 💡`, body: 'See if that aligns with your priorities — tap to review.' },
    ];
    const { title, body } = pool[rotateIdx(u.userId, pool.length, 5)];
    return { title, body, channelId: 'digest', data: { ...baseData, screen: 'expenses' } };
  }

  // Goal nudge (gated by pref)
  if (
    prefs.goalMilestones &&
    u.hasActiveGoals &&
    u.totalGoalsCount != null &&
    u.goalsOnTrack != null &&
    u.goalsOnTrack < u.totalGoalsCount
  ) {
    const behind = u.totalGoalsCount - u.goalsOnTrack;
    const pool: Array<{ title: string; body: string }> = [
      { title: `${behind} goal${behind > 1 ? 's' : ''} falling behind 🎯`, body: 'You are off-pace on your savings. A contribution today closes the gap.' },
      { title: 'Your savings goals need attention 🎯',                      body: `${behind} of your goals are lagging. Tap to contribute and get back on track.` },
    ];
    const { title, body } = pool[rotateIdx(u.userId, pool.length, 9)];
    return { title, body, channelId: 'digest', data: { ...baseData, screen: 'goals' } };
  }

  // ── Generic daily reminders — rotating pool ────────────────────────────────
  const genericPool: Array<{ title: string; body: string }> = [
    { title: 'How did you spend today? 💸',     body: 'Take 30 seconds to log your expenses. Every entry is a data point for your future.' },
    { title: 'Your money log is waiting 📋',    body: 'Log what you spent today while it is fresh. The habit stacks up fast.' },
    { title: 'Small logs, big picture 🗺️',      body: "Today's expense log is tomorrow's financial insight. Tap to add it." },
    { title: 'Track it, own it 💪',             body: 'You cannot improve what you do not measure. Log today\'s spending now.' },
    { title: 'Your future self is watching 🔮', body: 'Every expense logged is a step toward financial clarity. Tap to add today.' },
    { title: 'Money in, money out 🔄',          body: 'Logging takes seconds. Knowing where your money goes is worth far more.' },
    { title: "What's left in the tank? ⛽",     body: 'Check in on your spending and see how today compared to your budget.' },
    { title: '30 seconds to clarity ⏱️',        body: 'A quick log now keeps your finances sharp. Open Akù and add your expenses.' },
  ];
  const { title, body } = genericPool[rotateIdx(u.userId, genericPool.length)];
  return { title, body, channelId: 'digest', data: baseData };
}

function pickWeeklyMessage(u: UserRow, prefs: NotifPrefs): PushPayload | null {
  // Weekly summary is part of the daily digest pref
  if (!prefs.dailyDigest) return null;

  const baseData = { type: 'weekly_summary', screen: 'home' };

  // Spending spike
  if (u.weeklyChangePct != null && u.weeklyChangePct >= 25) {
    const pct = Math.round(u.weeklyChangePct);
    const pool: Array<{ title: string; body: string }> = [
      { title: `Spending jumped ${pct}% this week 📈`, body: u.topCategory ? `${u.topCategory} was your biggest expense. See your full weekly review.` : 'That is a significant jump. Tap for your weekly breakdown.' },
      { title: `Up ${pct}% from last week 📈`,         body: u.topCategory ? `${u.topCategory} drove most of it. Tap to see the full picture.` : 'Your weekly spending rose sharply. Tap to review.' },
    ];
    const { title, body } = pool[rotateIdx(u.userId, pool.length, 25)];
    return { title, body, channelId: 'digest', data: baseData };
  }

  // Spending drop — celebration
  if (u.weeklyChangePct != null && u.weeklyChangePct <= -25) {
    const pct = Math.abs(Math.round(u.weeklyChangePct));
    const pool: Array<{ title: string; body: string }> = [
      { title: `Great week — down ${pct}% 📉`, body: 'You spent significantly less than last week. That discipline compounds. Keep it up!' },
      { title: `${pct}% less spent this week 📉`, body: 'Your best week in a while. See your weekly summary to appreciate the progress.' },
    ];
    const { title, body } = pool[rotateIdx(u.userId, pool.length, 75)];
    return { title, body, channelId: 'digest', data: baseData };
  }

  // Top-category weekly
  if (u.topCategory) {
    const pool: Array<{ title: string; body: string }> = [
      { title: 'Your week in review 📊',     body: `${u.topCategory} was your top category this week. Tap for the full breakdown.` },
      { title: 'Weekly spending recap 📊',   body: `${u.topCategory} claimed the most of your budget. See where else your money went.` },
    ];
    const { title, body } = pool[rotateIdx(u.userId, pool.length, 50)];
    return { title, body, channelId: 'digest', data: baseData };
  }

  // Goal progress recap
  if (prefs.goalMilestones && u.hasActiveGoals && u.goalsOnTrack != null && u.totalGoalsCount != null && u.totalGoalsCount > 0) {
    const onTrack = u.goalsOnTrack;
    const total   = u.totalGoalsCount;
    const pool: Array<{ title: string; body: string }> = [
      { title: 'Your week in review 📊',   body: `${onTrack} of ${total} goal${total > 1 ? 's' : ''} on track. See how your week shaped up.` },
      { title: 'Weekly goals check 🎯',    body: `${onTrack}/${total} goals pacing on schedule. Tap to see your full weekly summary.` },
    ];
    const { title, body } = pool[rotateIdx(u.userId, pool.length, 10)];
    return { title, body, channelId: 'digest', data: baseData };
  }

  // Generic weekly pool
  const genericPool: Array<{ title: string; body: string }> = [
    { title: 'Your week in review 📊',          body: 'See how your finances shaped up this week. Every week is a new chance to improve.' },
    { title: 'Weekly financial check-in 📊',    body: 'Another week, another opportunity to understand your money. Tap to review.' },
    { title: 'How was your week financially? 📊', body: 'Your weekly summary is ready. Patterns start showing when you look weekly.' },
    { title: 'End of week money check 📊',      body: 'See your weekly summary. Small insights compound into big financial wins.' },
  ];
  const { title, body } = genericPool[rotateIdx(u.userId, genericPool.length, 100)];
  return { title, body, channelId: 'digest', data: baseData };
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
        notifPrefsJson:      userInsights.notifPrefsJson,
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
        const prefs = parsePrefs(row.notifPrefsJson ?? null);

        // Skip users who opted out of all push notification types
        const wantsAnything = prefs.dailyDigest || prefs.budgetAlerts || prefs.goalMilestones;
        if (!wantsAnything) continue;

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
          notifPrefsJson:      row.notifPrefsJson ?? null,
        };

        const payload = notifType === 'daily_reminder'
          ? pickDailyMessage(userRow, now, prefs)
          : pickWeeklyMessage(userRow, prefs);

        // null = user opted out of this specific message category
        if (!payload) continue;

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
