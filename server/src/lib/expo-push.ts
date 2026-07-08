/**
 * Expo Push Notification API wrapper.
 *
 * Docs: https://docs.expo.dev/push-notifications/sending-notifications/
 *
 * Key constraints:
 *  - Max 100 messages per POST /send request
 *  - Retry once on 5xx errors (network blip) with 5s delay
 *  - Remove DeviceNotRegistered tokens automatically (they bounced)
 *  - Receipt IDs should be checked 15–30 minutes later; we skip that
 *    complexity for now and rely on DeviceNotRegistered in the send receipt.
 */
import { db } from '../db/client.js';
import { pushTokens } from '../db/schema.js';
import { eq } from 'drizzle-orm';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface PushMessage {
  to:    string;   // Expo push token
  title: string;
  body:  string;
  data?: Record<string, unknown>;
  sound?: 'default' | null;
  badge?: number;
  channelId?: string; // Android notification channel
}

interface ExpoTicket {
  status:  'ok' | 'error';
  id?:     string;
  message?: string;
  details?: { error?: string };
}

// ─── Constants ────────────────────────────────────────────────────────────────

const EXPO_PUSH_URL = 'https://exp.host/--/api/v2/push/send';
const BATCH_SIZE    = 100;
const RETRY_DELAY   = 5_000; // 5 seconds

// ─── Helpers ──────────────────────────────────────────────────────────────────

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * POST one batch (≤100 messages) to the Expo push API.
 * Returns the array of tickets (one per message).
 */
async function postBatch(messages: PushMessage[], attempt = 1): Promise<ExpoTicket[]> {
  // EXPO_ACCESS_TOKEN is required for EAS production builds that have
  // "Enhanced push security" enabled (set in your Expo dashboard).
  // Without it, pushes to production builds silently fail.
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    'Accept':       'application/json',
  };
  const accessToken = process.env.EXPO_ACCESS_TOKEN;
  if (accessToken) {
    headers['Authorization'] = `Bearer ${accessToken}`;
  }

  const res = await fetch(EXPO_PUSH_URL, {
    method:  'POST',
    headers,
    body: JSON.stringify(messages),
  });

  if (res.status >= 500 && attempt === 1) {
    // Retry once on server error
    await sleep(RETRY_DELAY);
    return postBatch(messages, 2);
  }

  if (!res.ok) {
    throw new Error(`Expo push API returned ${res.status}: ${await res.text()}`);
  }

  const json = await res.json() as { data: ExpoTicket[] };
  return json.data;
}

/**
 * Handle tickets from a batch — remove stale tokens marked DeviceNotRegistered.
 */
async function handleTickets(
  messages: PushMessage[],
  tickets: ExpoTicket[],
): Promise<void> {
  const staleTokens: string[] = [];

  for (let i = 0; i < tickets.length; i++) {
    const ticket = tickets[i];
    if (
      ticket.status === 'error' &&
      ticket.details?.error === 'DeviceNotRegistered'
    ) {
      staleTokens.push(messages[i].to);
    }
  }

  if (staleTokens.length === 0) return;

  // Delete stale tokens from the DB
  await Promise.all(
    staleTokens.map((token) =>
      db.delete(pushTokens).where(eq(pushTokens.token, token)).catch(() => {
        // Silently ignore — token may have already been deleted
      })
    )
  );

  console.log(`[expo-push] Removed ${staleTokens.length} stale token(s).`);
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Send push notifications to a list of tokens.
 * Automatically batches into groups of 100 and removes stale tokens.
 *
 * @param tokens  Expo push tokens to target
 * @param payload Title / body / data for the notification
 */
export async function sendExpoPush(
  tokens: string[],
  payload: Omit<PushMessage, 'to'>,
): Promise<void> {
  if (tokens.length === 0) return;

  // Build messages
  const messages: PushMessage[] = tokens.map((token) => ({
    to:       token,
    sound:    'default',
    badge:    1,
    ...payload,
  }));

  // Chunk into batches of 100
  for (let offset = 0; offset < messages.length; offset += BATCH_SIZE) {
    const batch   = messages.slice(offset, offset + BATCH_SIZE);
    const tickets = await postBatch(batch);
    await handleTickets(batch, tickets);

    // Throttle between batches to be a good citizen
    if (offset + BATCH_SIZE < messages.length) {
      await sleep(200);
    }
  }
}
