import {
  pgTable,
  text,
  timestamp,
  boolean,
  index,
  unique,
} from 'drizzle-orm/pg-core';

// ─── Users ────────────────────────────────────────────────────────────────────

export const users = pgTable('users', {
  id:         text('id').primaryKey(),           // UUID v4
  name:       text('name').notNull(),
  email:      text('email').notNull().unique(),
  avatarUrl:  text('avatar_url'),
  /** Base64 data URI — synced from the device, no CDN required. */
  avatarData:   text('avatar_data'),
  /**
   * The user's Data Encryption Key, encrypted at rest with the server master key
   * (AES-256-GCM). Stored as base64(iv[12] || ciphertext || tag[16]).
   * Returned to the authenticated user so they can decrypt their own data on
   * any device. The server never stores or returns the plaintext DEK.
   */
  encryptedDek: text('encrypted_dek'),
  createdAt:    timestamp('created_at').notNull().defaultNow(),
  updatedAt:    timestamp('updated_at').notNull().defaultNow(),
});

// ─── Magic Link Tokens ────────────────────────────────────────────────────────
// One-time tokens sent via email. tokenHash is SHA-256(rawToken).
// The raw token is in the email URL; only the hash is stored here.

export const magicTokens = pgTable('magic_tokens', {
  id:        text('id').primaryKey(),           // UUID v4
  email:     text('email').notNull(),
  tokenHash: text('token_hash').notNull().unique(),
  expiresAt: timestamp('expires_at').notNull(),
  usedAt:    timestamp('used_at'),              // null = still valid
  createdAt: timestamp('created_at').notNull().defaultNow(),
  /** True when the user row was created in the same POST /magic-link request. */
  isNew:     boolean('is_new').notNull().default(false),
});

// ─── Sessions ─────────────────────────────────────────────────────────────────
// JWT sessions issued after magic link verification.
// tokenHash is SHA-256(jwt) — lets us invalidate specific tokens on sign-out.

export const sessions = pgTable('sessions', {
  id:        text('id').primaryKey(),           // UUID v4
  userId:    text('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  tokenHash: text('token_hash').notNull().unique(),
  expiresAt: timestamp('expires_at').notNull(),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  revokedAt: timestamp('revoked_at'),           // null = active
});

// ─── Sync Records ─────────────────────────────────────────────────────────────
// Encrypted financial data blobs for cross-device sync.
//
// Security model:
//   - encrypted_payload = base64(iv[12] || AES-256-GCM(plaintext)[variable] || tag[16])
//   - Encrypted client-side with the user's DEK (random 32-byte key, server-stored).
//   - The server stores ONLY ciphertext — it cannot read financial data.
//   - user_id constraint ensures each user can only access their own records.
//   - Conflict resolution: last-write-wins on client_updated_at.
//   - Soft-delete: is_deleted = true + encrypted_payload = '' signals deletion.

export const syncRecords = pgTable('sync_records', {
  id:              text('id').primaryKey(),       // client-generated UUID
  userId:          text('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  entityType:      text('entity_type').notNull(), // 'expense'|'bill'|'goal'|'budget'|'goal_contribution'
  entityId:        text('entity_id').notNull(),   // the entity's own UUID
  encryptedPayload: text('encrypted_payload').notNull(), // base64(iv||ciphertext||tag)
  clientUpdatedAt: timestamp('client_updated_at', { withTimezone: true }).notNull(),
  serverUpdatedAt: timestamp('server_updated_at', { withTimezone: true }).notNull().defaultNow(),
  isDeleted:       boolean('is_deleted').notNull().default(false),
}, (t) => [
  // Fast pull: "give me all records for user X updated after timestamp T"
  index('idx_sync_user_server_ts').on(t.userId, t.serverUpdatedAt),
  // Upsert lookup: "does this entity already exist for this user?"
  index('idx_sync_user_entity').on(t.userId, t.entityType, t.entityId),
]);

// ─── Push Tokens ──────────────────────────────────────────────────────────────
// One row per (user, device). Expo push token + platform tag.
// A user may have multiple devices (phone + tablet).

export const pushTokens = pgTable('push_tokens', {
  id:        text('id').primaryKey(),             // UUID v4
  userId:    text('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  /** Expo push token: "ExponentPushToken[xxxxxxxxxxxxxxxxxxxxxx]" */
  token:     text('token').notNull().unique(),
  platform:  text('platform').notNull(),          // 'ios' | 'android'
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
}, (t) => [
  index('idx_push_tokens_user').on(t.userId),
]);

// ─── Notification Log ─────────────────────────────────────────────────────────
// Deduplication log for server-sent push notifications.
// Prevents the worker from re-sending the same type on the same calendar day.

export const notificationLog = pgTable('notification_log', {
  id:       text('id').primaryKey(),              // UUID v4
  userId:   text('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  /** e.g. 'daily_reminder' | 'weekly_summary' */
  type:     text('type').notNull(),
  /** YYYY-MM-DD — the calendar day the notification was sent */
  sentDate: text('sent_date').notNull(),
  sentAt:   timestamp('sent_at').notNull().defaultNow(),
}, (t) => [
  // Primary dedup constraint: one notification per user per type per day
  unique('uq_notif_log_user_type_date').on(t.userId, t.type, t.sentDate),
  index('idx_notif_log_user').on(t.userId),
]);
