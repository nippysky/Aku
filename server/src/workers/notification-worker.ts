/**
 * Akù Notification Worker — PM2 background process
 *
 * Runs two recurring jobs on an in-process scheduler:
 *
 *   Daily reminder    — 19:00 UTC every day
 *     "Log your spending for today!" → deep-links to Expenses tab
 *
 *   Weekly summary    — 18:00 UTC every Sunday
 *     "Your week in review 📊" → deep-links to Home dashboard
 *
 * Scale design:
 *   - Batches Expo push API at 100 tokens/request (Expo API limit)
 *   - Deduplicates via notification_log (unique per user + type + date)
 *   - Paginated DB queries — O(PAGE_SIZE) RAM regardless of user count
 *   - Graceful shutdown: SIGTERM/SIGINT drains the current batch then exits
 *
 * Start:
 *   pm2 start dist/workers/notification-worker.js --name aku-notif-worker
 * Or via ecosystem.config.cjs (see /server/ecosystem.config.cjs).
 */
import 'dotenv/config';
import { randomBytes } from 'node:crypto';
import { db } from '../db/client.js';
import { pushTokens, notificationLog } from '../db/schema.js';
import { sendExpoPush } from '../lib/expo-push.js';
import { sql, notInArray } from 'drizzle-orm';

// ─── Types ────────────────────────────────────────────────────────────────────

interface PushPayload {
  title:     string;
  body:      string;
  channelId: string;
  data:      Record<string, string>;
}

interface JobConfig {
  type:    string;
  payload: PushPayload;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function generateId(): string {
  return randomBytes(16).toString('hex');
}

/** Returns today's date as YYYY-MM-DD in UTC. */
function todayUTC(): string {
  return new Date().toISOString().slice(0, 10);
}

/** Returns a Date for the next occurrence of hour:minute UTC (tomorrow if already past). */
function nextUtcOccurrence(hour: number, minute: number): Date {
  const now  = new Date();
  const next = new Date(Date.UTC(
    now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(),
    hour, minute, 0, 0,
  ));
  if (next <= now) next.setUTCDate(next.getUTCDate() + 1);
  return next;
}

/** Returns the next Sunday at 18:00 UTC. */
function nextSunday18UTC(): Date {
  const now              = new Date();
  const daysUntilSunday  = now.getUTCDay() === 0 ? 0 : 7 - now.getUTCDay();
  const candidate = new Date(Date.UTC(
    now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + daysUntilSunday,
    18, 0, 0, 0,
  ));
  if (candidate <= now) candidate.setUTCDate(candidate.getUTCDate() + 7);
  return candidate;
}

// ─── Core send job ────────────────────────────────────────────────────────────

const PAGE_SIZE = 500; // tokens per DB fetch — controls peak RAM

/**
 * Sends `cfg.payload` to all registered devices that haven't received
 * `cfg.type` today. Uses paginated queries and deduplication via the
 * notification_log table.
 */
async function runJob(cfg: JobConfig): Promise<void> {
  const date = todayUTC();
  console.log(`[worker] Starting job: ${cfg.type} / ${date}`);
  let sent = 0;
  let offset = 0;

  while (true) {
    if (shutdownRequested) {
      console.log('[worker] Shutdown requested — stopping job mid-batch.');
      break;
    }

    // userId sub-select: who already got this notification today?
    const alreadySentIds = db
      .select({ userId: notificationLog.userId })
      .from(notificationLog)
      .where(
        sql`${notificationLog.type} = ${cfg.type}
            AND ${notificationLog.sentDate} = ${date}`
      );

    // Fetch next page of tokens whose owners haven't been notified yet
    const rows = await db
      .select({ userId: pushTokens.userId, token: pushTokens.token })
      .from(pushTokens)
      .where(notInArray(pushTokens.userId, alreadySentIds))
      .limit(PAGE_SIZE)
      .offset(offset);

    if (rows.length === 0) break;

    const tokens  = rows.map((r) => r.token);
    const userIds = [...new Set(rows.map((r) => r.userId))];

    // Send the batch (internally chunked at 100 by expo-push wrapper)
    await sendExpoPush(tokens, cfg.payload);

    // Log each user — unique constraint prevents double-logging if worker
    // restarts mid-batch or runs concurrently in a multi-instance setup.
    for (const userId of userIds) {
      try {
        await db.insert(notificationLog).values({
          id:       generateId(),
          userId,
          type:     cfg.type,
          sentDate: date,
          sentAt:   new Date(),
        });
      } catch {
        // Unique constraint hit — already logged (concurrent workers / restart).
        // Safe to silently ignore.
      }
    }

    sent += tokens.length;
    offset += PAGE_SIZE;

    console.log(`[worker] ${cfg.type}: offset=${offset}, sent so far=${sent}`);
  }

  console.log(`[worker] ${cfg.type} complete — ${sent} device(s) notified.`);
}

// ─── Job definitions ──────────────────────────────────────────────────────────
//
// `data` payload keys match the NotificationData interface on the client
// so that useNotificationNavigation can deep-link to the right screen.

const DAILY_JOB: JobConfig = {
  type: 'daily_reminder',
  payload: {
    title:     'How did you spend today? 💸',
    body:      'Take 30 seconds to log your expenses. Every penny counts.',
    channelId: 'digest',
    data: {
      type:   'daily_reminder',
      screen: 'expenses',
      action: 'log',
    },
  },
};

const WEEKLY_JOB: JobConfig = {
  type: 'weekly_summary',
  payload: {
    title:     'Your week in review 📊',
    body:      'See how your finances shaped up this week.',
    channelId: 'digest',
    data: {
      type:   'weekly_summary',
      screen: 'home',
    },
  },
};

// ─── Scheduler ────────────────────────────────────────────────────────────────

let shutdownRequested = false;

function scheduleDaily19(fn: () => Promise<void>, label: string): void {
  const target = nextUtcOccurrence(19, 0);
  const ms     = target.getTime() - Date.now();
  console.log(`[worker] ${label} → next run: ${target.toISOString()} (${Math.round(ms / 60_000)} min)`);

  setTimeout(async () => {
    if (shutdownRequested) return;
    try { await fn(); } catch (err) { console.error(`[worker] ${label} error:`, err); }
    scheduleDaily19(fn, label); // reschedule for tomorrow
  }, ms);
}

function scheduleSunday18(fn: () => Promise<void>, label: string): void {
  const target = nextSunday18UTC();
  const ms     = target.getTime() - Date.now();
  console.log(`[worker] ${label} → next run: ${target.toISOString()} (${Math.round(ms / 60_000)} min)`);

  setTimeout(async () => {
    if (shutdownRequested) return;
    try { await fn(); } catch (err) { console.error(`[worker] ${label} error:`, err); }
    scheduleSunday18(fn, label); // reschedule for next Sunday
  }, ms);
}

// ─── Graceful shutdown ────────────────────────────────────────────────────────

process.on('SIGTERM', () => {
  console.log('[worker] SIGTERM — draining current batch (max 15 s)…');
  shutdownRequested = true;
  setTimeout(() => process.exit(0), 15_000);
});
process.on('SIGINT', () => {
  shutdownRequested = true;
  setTimeout(() => process.exit(0), 15_000);
});

// ─── Start ────────────────────────────────────────────────────────────────────

console.log('[worker] Akù notification worker starting…');

scheduleDaily19(() => runJob(DAILY_JOB),  'daily-reminder');
scheduleSunday18(() => runJob(WEEKLY_JOB), 'weekly-summary');

console.log('[worker] Scheduler live. Waiting for run times…');

// Heartbeat every 6 h — visible in `pm2 logs aku-notif-worker`
setInterval(() => {
  const now = new Date();
  if (now.getUTCMinutes() === 0 && now.getUTCHours() % 6 === 0) {
    console.log(`[worker] ❤ alive at ${now.toISOString()}`);
  }
}, 60_000).unref();
