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
 *   (streak, top category, weekly delta) to POST /api/notifications/insight.
 *   The worker reads these to craft personalised message variants:
 *     • Streak celebration · Weekly spend spike / drop
 *     • Top-category callout  · Goal nudge
 *
 * ── Tier 3 · Hourly engagement engine ───────────────────────────────────────
 *   Runs every hour at :00. For each user's local timezone:
 *     • 08:00          — yesterday recap: "You spent ₦X yesterday" (the FIRST
 *       notification of the day), or an encouraging nudge if nothing was logged
 *     • 09:00 → 20:00  — one creative, hour-themed nudge per hour
 *       (the 19:00 slot delivers the fully personalised Tier 1/2 message)
 *     • 21:00          — bedtime wrap-up: "hope you logged all your expenses
 *       and income today" 🌙
 *     • Sunday 18:00   — weekly summary
 *   DST-safe: Intl.DateTimeFormat tracks DST automatically.
 *   Users with no stored timezone fall back to UTC hours.
 *
 * Deduplication:
 *   notification_log (unique userId + type + sentDate) prevents double-sends
 *   across restarts or concurrent workers. Hourly slots use type
 *   'hourly_<hour>' so each slot fires at most once per user per day.
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
  goalMilestones: boolean;
  dailyDigest:    boolean;
}

const DEFAULT_PREFS: NotifPrefs = {
  billReminders:  true,
  goalMilestones: true,
  dailyDigest:    true,
};

// All notification types are always enabled — there is no user-facing
// toggle in the app anymore (the notification-settings screen was removed).
// This ignores any stored notifPrefsJson so every user gets the full
// engagement stream regardless of what may be sitting in that column from
// before the settings screen existed.
function parsePrefs(_json: string | null): NotifPrefs {
  return DEFAULT_PREFS;
}

interface UserRow {
  userId:              string;
  token:               string;
  timezone:            string | null;
  createdAt:           Date;
  lastSyncAt:          Date | null;
  spendingStreak:      number | null;
  weeklyChangePct:     number | null;
  monthlyExpenseCount: number | null;
  topCategory:         string | null;
  hasActiveGoals:      boolean | null;
  goalsOnTrack:        number | null;
  totalGoalsCount:     number | null;
  savingsRatePct:      number | null;
  notifPrefsJson:      string | null;
  yesterdayExpenseTotal: number | null;
  yesterdayExpenseCount: number | null;
  currencySymbol:        string | null;
}

// ─── Constants ────────────────────────────────────────────────────────────────

const PAGE_SIZE      = 500;
const DORMANT_HOURS  = 7 * 24;
const LAPSING_HOURS  = 3 * 24;
const NEW_USER_DAYS  = 3;

// ── Hourly engagement window (user-local time) ───────────────────────────────
const RECAP_HOUR    = 8;   // yesterday's spend recap — the FIRST notification of the day
const HOURLY_START  = 9;   // first creative nudge of the day
const HOURLY_END    = 21;  // bedtime wrap-up message
const INSIGHT_HOUR  = 19;  // the fully personalised Tier 1/2 slot
const WEEKLY_HOUR   = 18;  // Sunday weekly summary

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

/** Formats a kobo/cent integer amount as "₦12,345" (whole-unit, comma-grouped). */
function formatMoney(amountMinor: number, symbol: string): string {
  const whole = Math.round(amountMinor / 100);
  return `${symbol}${whole.toLocaleString('en-US')}`;
}

// ─── Yesterday recap — the FIRST notification of the day ────────────────────
// Reports the previous calendar day's total spend, or an encouraging nudge if
// nothing was logged. Gated by dailyDigest like the rest of the engagement
// stream (the master "Daily reminders" toggle).

const NO_SPEND_POOL: Array<{ title: string; body: string }> = [
  { title: 'A clean slate yesterday 🌱',      body: "You didn't log any expenses yesterday. Nothing spent, or just nothing logged? Either way, keep it up." },
  { title: 'Zero spend yesterday 👏',         body: 'No expenses logged yesterday. If that\'s accurate, that\'s real discipline — keep the streak alive today.' },
  { title: 'Quiet day, moneywise 🍃',         body: 'Yesterday shows no logged spending. Nice if intentional — just make sure nothing slipped through unlogged.' },
];

function pickYesterdaySummaryMessage(u: UserRow, prefs: NotifPrefs): PushPayload | null {
  if (!prefs.dailyDigest) return null;

  const symbol = u.currencySymbol ?? '₦';
  const count  = u.yesterdayExpenseCount ?? 0;

  if (count === 0) {
    const { title, body } = NO_SPEND_POOL[rotateIdx(u.userId, NO_SPEND_POOL.length, 8)];
    return {
      title, body,
      channelId: 'digest',
      data: { type: 'yesterday_recap', screen: 'expenses', action: 'log' },
    };
  }

  const total = formatMoney(u.yesterdayExpenseTotal ?? 0, symbol);
  const pool: Array<{ title: string; body: string }> = [
    { title: `You spent ${total} yesterday 📊`,        body: `Across ${count} ${count === 1 ? 'entry' : 'entries'}. Tap to see the full breakdown and start today fresh.` },
    { title: `Yesterday's total: ${total} 💸`,          body: `${count} ${count === 1 ? 'expense' : 'expenses'} logged. See where it went, then log today as it happens.` },
    { title: `${total} logged yesterday 📋`,            body: 'Here\'s your recap. A new day of spending starts now — keep the habit going.' },
  ];
  const { title, body } = pool[rotateIdx(u.userId, pool.length, 8)];
  return {
    title, body,
    channelId: 'digest',
    data: { type: 'yesterday_recap', screen: 'expenses', action: 'log' },
  };
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
      title:     'Add a bill you pay regularly 🧾',
      body:      'Rent, subscriptions, electricity — track them so nothing sneaks up on you.',
      channelId: 'digest',
      data:      { ...baseData, screen: 'bills' },
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
      { title: `${u.topCategory} is your top spend 💡`,          body: 'It is claiming the most of your spending this month. Tap to see the breakdown.' },
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
    { title: "What's left in the tank? ⛽",     body: 'Check in on your spending and see how today is shaping up.' },
    { title: '30 seconds to clarity ⏱️',        body: 'A quick log now keeps your finances sharp. Open Akù and add your expenses.' },
  ];
  const { title, body } = genericPool[rotateIdx(u.userId, genericPool.length)];
  return { title, body, channelId: 'digest', data: baseData };
}

function pickWeeklyMessage(u: UserRow, prefs: NotifPrefs): PushPayload | null {
  // Weekly summary is part of the daily digest pref
  if (!prefs.dailyDigest) return null;

  const baseData = { type: 'weekly_summary', screen: 'analytics' };

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

  // Savings-rate milestone recap
  if (u.savingsRatePct != null && u.savingsRatePct >= 20) {
    const pct = Math.round(u.savingsRatePct);
    const pool: Array<{ title: string; body: string }> = [
      { title: `Saving ${pct}% of your income 🏆`, body: 'You are beating the 20% golden rule this month. See your weekly summary.' },
      { title: `${pct}% saved this month 💪`,      body: 'Elite discipline. Tap for your weekly review and keep the streak alive.' },
    ];
    const { title, body } = pool[rotateIdx(u.userId, pool.length, 55)];
    return { title, body, channelId: 'digest', data: baseData };
  }

  // Top-category weekly
  if (u.topCategory) {
    const pool: Array<{ title: string; body: string }> = [
      { title: 'Your week in review 📊',     body: `${u.topCategory} was your top category this week. Tap for the full breakdown.` },
      { title: 'Weekly spending recap 📊',   body: `${u.topCategory} claimed the most of your spending. See where else your money went.` },
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

// ─── Hourly engagement engine — creative, hour-themed nudges ─────────────────
//
// One nudge per hour from 09:00 to 20:00 local, plus a 21:00 bedtime wrap-up.
// Each slot has its own themed pool; variants rotate per user per day.
// A few slots weave in analytical insights (streaks, top category) so the
// day feels personal, not robotic.
// All hourly slots are gated by the dailyDigest preference.

const HOURLY_POOLS: Record<number, Array<{ title: string; body: string }>> = {
  9: [
    { title: 'Good morning, money boss ☀️',   body: 'A fresh day, a clean slate. Log your first expense or income as it happens.' },
    { title: 'Rise and track ☕',              body: 'Bought breakfast? Paid for transport? 10 seconds to log it while it is fresh.' },
    { title: 'Start the day sharp 📋',         body: 'People who log in the morning track 2× more accurately. Be that person today.' },
    { title: 'New day, new numbers ☀️',        body: 'Yesterday is history. Today\'s money story starts with your first log.' },
  ],
  10: [
    { title: 'Mid-morning money check 🕙',     body: 'Anything spent since you woke up? Capture it before the day gets busy.' },
    { title: 'Quick one 👀',                   body: 'That small purchase this morning — logged it yet? Small leaks sink big ships.' },
    { title: 'Your ledger misses you 📒',      body: 'A 10-second log now saves a 10-minute memory struggle tonight.' },
  ],
  11: [
    { title: 'Almost lunchtime 🕚',            body: 'Before the lunch rush: is your morning spending logged and accounted for?' },
    { title: 'Snack money counts too 🍩',      body: 'The little buys are the sneaky ones. Log them and stay in control.' },
    { title: 'Money moves? Log moves 📲',      body: 'Every naira tracked is a naira understood. Quick check-in before noon.' },
  ],
  12: [
    { title: 'Lunch o\'clock 🍛',              body: 'Grabbing lunch? Log it the moment you pay — done before your food arrives.' },
    { title: 'Midday money minute 🕛',         body: 'Half the day gone. Take one minute to make sure your morning is fully logged.' },
    { title: 'Fuel up, log up 🍽️',            body: 'Lunch, drinks, that extra side — capture it all while the receipt is warm.' },
  ],
  13: [
    { title: 'Post-lunch check-in ✅',         body: 'Lunch logged? Income landed today? Keep your picture complete.' },
    { title: 'The midday audit 🕐',            body: 'A quick glance at today\'s spending now beats a shock at month-end.' },
    { title: 'Stay on top of it 💼',           body: 'Money moves fast in the afternoon. Log as you go and nothing escapes.' },
  ],
  14: [
    { title: 'Afternoon pulse 🕑',             body: "How is today's spending tracking? One tap to find out." },
    { title: 'Midday money check 🎯',          body: 'See how today is shaping up so far — tap for a quick look.' },
    { title: 'Keep the streak alive 🔥',       body: 'Consistent logging is the single best money habit. Add anything new.' },
  ],
  15: [
    { title: 'Afternoon check-in 🕒',          body: 'Still in control? Afternoon spending sneaks up quietly — log anything new since lunch.' },
    { title: 'Small buys, big picture 🧩',     body: 'Airtime, snacks, transport — the small stuff shapes the month. Log it.' },
    { title: 'Your money, your rules 👑',      body: 'Owning your finances starts with knowing them. Quick log check.' },
  ],
  16: [
    { title: 'The late-afternoon look 👁️',    body: 'Take a 20-second look at today\'s numbers. Awareness is the whole game.' },
    { title: 'Before the evening rush 🕓',     body: 'Log your afternoon spending now — evenings have a way of getting busy.' },
    { title: 'Money clarity hour 💡',          body: 'A quick log now means tonight\'s picture is already complete.' },
  ],
  17: [
    { title: 'Heading home? 🚗',               body: 'Transport fare, fuel, that quick stop at the shop — log it on the go.' },
    { title: 'End-of-workday wrap 🕔',         body: 'Work is winding down. Give your money 30 seconds before the evening starts.' },
    { title: 'The commute log 📱',             body: 'Perfect time to log the day so far — you will thank yourself at 9pm.' },
  ],
  18: [
    { title: 'Dinner plans? 🍲',               body: 'Whether you are cooking or ordering, log the spend while it is happening.' },
    { title: 'Evening check-in 🌆',            body: 'The day is winding down. Is everything you spent and earned today logged?' },
    { title: 'Evening money moment 🕕',        body: 'A complete day of logs is a beautiful thing. You are almost there.' },
  ],
  // 19:00 is the personalised insight slot — handled by pickDailyMessage()
  20: [
    { title: 'The evening review 🌙',          body: 'Scroll back through today. Any expense or income still unlogged? Now is the time.' },
    { title: 'Wind-down window 🛋️',           body: 'Before you settle in for the night — quick sweep for missed expenses.' },
    { title: 'Almost bedtime 📖',              body: 'Close out the day\'s money story. A complete log today = clear insights tomorrow.' },
  ],
};

const BEDTIME_POOL: Array<{ title: string; body: string }> = [
  { title: 'Before you sleep 🌙',           body: 'Hope you have logged all your expenses and income for today. Sleep well — your finances are in order.' },
  { title: 'One last thing 😴',             body: 'Have you logged everything you spent and earned today? 30 seconds now, total clarity tomorrow.' },
  { title: 'Goodnight, money boss 🌙',      body: 'Last call to log today\'s expenses and income. End the day with a complete picture.' },
  { title: 'Sleep on a clean ledger 🛏️',   body: 'Before the lights go out — make sure every expense and income made it into Akù today.' },
];

/** Bedtime wrap-up — the final message of the day. */
function pickBedtimeMessage(u: UserRow, prefs: NotifPrefs): PushPayload | null {
  if (!prefs.dailyDigest) return null;
  const { title, body } = BEDTIME_POOL[rotateIdx(u.userId, BEDTIME_POOL.length, 210)];
  return {
    title,
    body,
    channelId: 'digest',
    data: { type: 'bedtime_reminder', screen: 'expenses', action: 'log' },
  };
}

/**
 * Creative hourly nudge with light analytical seasoning:
 * a few slots surface real insights (streak, top category) when the
 * data supports it; otherwise the hour-themed creative pool rotates daily.
 */
function pickHourlyMessage(u: UserRow, hour: number, prefs: NotifPrefs): PushPayload | null {
  if (!prefs.dailyDigest) return null;

  const baseData = { type: 'hourly_reminder', screen: 'expenses', action: 'log' };

  // ── Analytical seasoning — specific hours, only when the data is real ──────
  if (hour === 11 && u.spendingStreak != null && u.spendingStreak >= 3) {
    return {
      title:     `${u.spendingStreak}-day logging streak 🔥`,
      body:      'Keep it rolling — log today\'s expenses and make it one more.',
      channelId: 'digest',
      data:      baseData,
    };
  }

  if (hour === 13 && u.savingsRatePct != null) {
    if (u.savingsRatePct >= 20) {
      return {
        title:     `You're keeping ${Math.round(u.savingsRatePct)}% of your income 🏆`,
        body:      'That is elite-level saving this month. See the full picture in Analytics.',
        channelId: 'digest',
        data:      { ...baseData, screen: 'analytics' },
      };
    }
    if (u.savingsRatePct < 0) {
      return {
        title:     'Spending has passed income this month 📉',
        body:      'You have spent more than you earned so far. A quick review now can turn the month around.',
        channelId: 'digest',
        data:      { ...baseData, screen: 'expenses' },
      };
    }
  }

  if (hour === 16 && u.topCategory && u.monthlyExpenseCount != null && u.monthlyExpenseCount >= 5) {
    return {
      title:     `${u.topCategory} is leading this month 💡`,
      body:      'It is taking the biggest slice of your spending. Tap to see the breakdown.',
      channelId: 'digest',
      data:      baseData,
    };
  }

  // ── Creative hour-themed rotation ──────────────────────────────────────────
  const pool = HOURLY_POOLS[hour];
  if (!pool || pool.length === 0) return null;
  const { title, body } = pool[rotateIdx(u.userId, pool.length, hour * 11)];
  return { title, body, channelId: 'digest', data: baseData };
}

// ─── Core personalised send ───────────────────────────────────────────────────

type MessagePicker = (u: UserRow, now: Date, prefs: NotifPrefs) => PushPayload | null;

/**
 * Query eligible users (matching timezones, not yet notified today),
 * pick a personalised message per user, group by identical variant,
 * send each variant as one Expo batch, then log to notification_log.
 *
 * `notifType` doubles as the dedup key in notification_log — one send per
 * user per type per calendar day (hourly slots use 'hourly_<hour>').
 */
async function runPersonalisedJob(
  notifType:       string,
  picker:          MessagePicker,
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
        spendingStreak:      userInsights.spendingStreak,
        weeklyChangePct:     userInsights.weeklyChangePct,
        monthlyExpenseCount: userInsights.monthlyExpenseCount,
        topCategory:         userInsights.topCategory,
        hasActiveGoals:      userInsights.hasActiveGoals,
        goalsOnTrack:        userInsights.goalsOnTrack,
        totalGoalsCount:     userInsights.totalGoalsCount,
        savingsRatePct:      userInsights.savingsRatePct,
        notifPrefsJson:      userInsights.notifPrefsJson,
        yesterdayExpenseTotal: userInsights.yesterdayExpenseTotal,
        yesterdayExpenseCount: userInsights.yesterdayExpenseCount,
        currencySymbol:        users.preferredCurrencySymbol,
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
        const wantsAnything = prefs.dailyDigest || prefs.goalMilestones;
        if (!wantsAnything) continue;

        const userRow: UserRow = {
          userId:              row.userId,
          token:               row.token,
          timezone:            row.timezone,
          createdAt:           row.createdAt,
          lastSyncAt:          lastSyncMap.get(row.userId) ?? null,
          spendingStreak:      row.spendingStreak,
          weeklyChangePct:     row.weeklyChangePct,
          monthlyExpenseCount: row.monthlyExpenseCount,
          topCategory:         row.topCategory,
          hasActiveGoals:      row.hasActiveGoals,
          goalsOnTrack:        row.goalsOnTrack,
          totalGoalsCount:     row.totalGoalsCount,
          savingsRatePct:      row.savingsRatePct,
          notifPrefsJson:      row.notifPrefsJson ?? null,
          yesterdayExpenseTotal: row.yesterdayExpenseTotal,
          yesterdayExpenseCount: row.yesterdayExpenseCount,
          currencySymbol:        row.currencySymbol,
        };

        const payload = picker(userRow, now, prefs);

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

// ─── Hourly check — Tier 3 engagement engine ─────────────────────────────────

/**
 * Fired at the top of every hour.
 * Groups stored timezones by their current local hour, then:
 *   • local 09:00–20:00 → hour-themed creative nudge
 *     (19:00 = fully personalised Tier 1/2 daily message)
 *   • local 21:00       → bedtime wrap-up
 *   • Sunday 18:00      → weekly summary (in addition to the 18:00 slot)
 * Users with no stored timezone are treated as UTC.
 */
async function hourlyCheck(): Promise<void> {
  const now     = new Date();
  const utcHour = now.getUTCHours();

  const storedTimezones = await allStoredTimezones();

  // Group timezones by their current local hour (DST-safe via Intl)
  const tzByHour = new Map<number, Set<string>>();
  for (const tz of storedTimezones) {
    const h = localHourIn(tz, now);
    if (h < 0) continue;
    if (!tzByHour.has(h)) tzByHour.set(h, new Set());
    tzByHour.get(h)!.add(tz);
  }

  // ── Hourly engagement slots: 08:00 (yesterday recap) … 21:00 local ───────
  for (let hour = RECAP_HOUR; hour <= HOURLY_END; hour++) {
    if (shutdownRequested) return;

    const tzs         = tzByHour.get(hour) ?? new Set<string>();
    const includeNull = utcHour === hour;
    if (tzs.size === 0 && !includeNull) continue;

    const slotType =
      hour === RECAP_HOUR   ? 'yesterday_recap'  :
      hour === HOURLY_END   ? 'bedtime_reminder' :
      hour === INSIGHT_HOUR ? 'daily_reminder'   :
      `hourly_${hour}`;

    const picker: MessagePicker =
      hour === RECAP_HOUR   ? (u, _n, prefs) => pickYesterdaySummaryMessage(u, prefs) :
      hour === HOURLY_END   ? (u, _n, prefs) => pickBedtimeMessage(u, prefs) :
      hour === INSIGHT_HOUR ? pickDailyMessage :
      (u, _n, prefs) => pickHourlyMessage(u, hour, prefs);

    await runPersonalisedJob(slotType, picker, tzs, includeNull, now);
  }

  // ── Weekly summary: Sunday, local 18:00 ──────────────────────────────────
  const weeklyTzs = new Set<string>(
    [...(tzByHour.get(WEEKLY_HOUR) ?? [])].filter(
      (tz) => localWeekdayIn(tz, now) === 'Sun',
    ),
  );
  const includeNullForWeekly = now.getUTCDay() === 0 && utcHour === WEEKLY_HOUR;

  if (weeklyTzs.size > 0 || includeNullForWeekly) {
    await runPersonalisedJob(
      'weekly_summary',
      (u, _n, prefs) => pickWeeklyMessage(u, prefs),
      weeklyTzs,
      includeNullForWeekly,
      now,
    );
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
console.log('[worker] Mode: hourly engagement engine · 08:00–21:00 local · yesterday recap + Tier 1 (behavioural) + Tier 2 (insights) + bedtime wrap-up');

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
