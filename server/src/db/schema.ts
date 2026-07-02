import {
  pgTable,
  text,
  timestamp,
  boolean,
} from 'drizzle-orm/pg-core';

// ─── Users ────────────────────────────────────────────────────────────────────

export const users = pgTable('users', {
  id:        text('id').primaryKey(),           // UUID v4
  name:      text('name').notNull(),
  email:     text('email').notNull().unique(),
  avatarUrl: text('avatar_url'),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
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
