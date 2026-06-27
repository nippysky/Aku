# Akù — Backend Architecture

> Status: Design document — server infrastructure not yet implemented.  
> App is fully functional in local-only mode. This document describes the
> target architecture for multi-device sync, push notifications, and
> household sharing.

---

## 1. Database — PostgreSQL on DigitalOcean

### 1.1 Managed Database

- **Provider**: DigitalOcean Managed PostgreSQL (or Neon.tech serverless PostgreSQL for lower cost)  
- **Version**: PostgreSQL 16+  
- **Connection**: Pooled via PgBouncer (transaction mode); max 20 connections per region  
- **Backups**: Daily automated snapshots, 7-day retention  
- **Encryption at rest**: AES-256 (DigitalOcean default)

### 1.2 Table Schemas

All amounts stored as `BIGINT` (kobo). All dates as `TIMESTAMPTZ` (UTC).  
Client UUIDs are preserved; the server treats them as immutable primary keys.

```sql
-- Users
CREATE TABLE users (
  id            UUID PRIMARY KEY,
  name          TEXT NOT NULL,
  email         TEXT NOT NULL UNIQUE,
  household_id  UUID REFERENCES households(id) ON DELETE SET NULL,
  avatar_url    TEXT,
  pin_hash      TEXT,               -- bcrypt hash (cost 12); null when unset
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_users_email       ON users(email);
CREATE INDEX idx_users_household   ON users(household_id);

-- Households
CREATE TABLE households (
  id          UUID PRIMARY KEY,
  name        TEXT NOT NULL,
  owner_id    UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Household Members
CREATE TABLE household_members (
  id            UUID PRIMARY KEY,
  household_id  UUID NOT NULL REFERENCES households(id) ON DELETE CASCADE,
  user_id       UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role          TEXT NOT NULL CHECK (role IN ('owner', 'member')) DEFAULT 'member',
  joined_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (household_id, user_id)
);
CREATE INDEX idx_members_household ON household_members(household_id);
CREATE INDEX idx_members_user      ON household_members(user_id);

-- Bills
CREATE TABLE bills (
  id            UUID PRIMARY KEY,
  user_id       UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  household_id  UUID REFERENCES households(id) ON DELETE SET NULL,
  name          TEXT NOT NULL,
  amount        BIGINT NOT NULL,
  category      TEXT NOT NULL,
  due_date      DATE NOT NULL,
  frequency     TEXT NOT NULL,
  notes         TEXT,
  is_shared     BOOLEAN NOT NULL DEFAULT FALSE,
  is_paid       BOOLEAN NOT NULL DEFAULT FALSE,
  paid_at       TIMESTAMPTZ,
  notify_30     BOOLEAN NOT NULL DEFAULT FALSE,
  notify_14     BOOLEAN NOT NULL DEFAULT TRUE,
  notify_7      BOOLEAN NOT NULL DEFAULT TRUE,
  notify_3      BOOLEAN NOT NULL DEFAULT TRUE,
  notify_1      BOOLEAN NOT NULL DEFAULT TRUE,
  notify_day    BOOLEAN NOT NULL DEFAULT TRUE,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at    TIMESTAMPTZ          -- soft delete for sync
);
CREATE INDEX idx_bills_user       ON bills(user_id);
CREATE INDEX idx_bills_due        ON bills(due_date);
CREATE INDEX idx_bills_household  ON bills(household_id);
CREATE INDEX idx_bills_deleted    ON bills(deleted_at) WHERE deleted_at IS NULL;

-- Expenses
CREATE TABLE expenses (
  id            UUID PRIMARY KEY,
  user_id       UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  household_id  UUID REFERENCES households(id) ON DELETE SET NULL,
  amount        BIGINT NOT NULL,
  category      TEXT NOT NULL,
  description   TEXT,
  date          DATE NOT NULL,
  is_shared     BOOLEAN NOT NULL DEFAULT FALSE,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at    TIMESTAMPTZ
);
CREATE INDEX idx_expenses_user      ON expenses(user_id);
CREATE INDEX idx_expenses_date      ON expenses(date);
CREATE INDEX idx_expenses_category  ON expenses(category);
CREATE INDEX idx_expenses_household ON expenses(household_id);
CREATE INDEX idx_expenses_deleted   ON expenses(deleted_at) WHERE deleted_at IS NULL;

-- Budgets
CREATE TABLE budgets (
  id            UUID PRIMARY KEY,
  user_id       UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  household_id  UUID REFERENCES households(id) ON DELETE SET NULL,
  category      TEXT NOT NULL,
  amount        BIGINT NOT NULL,
  period        TEXT NOT NULL CHECK (period IN ('weekly', 'monthly', 'yearly')),
  is_shared     BOOLEAN NOT NULL DEFAULT FALSE,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at    TIMESTAMPTZ
);
CREATE INDEX idx_budgets_user     ON budgets(user_id);
CREATE INDEX idx_budgets_category ON budgets(category);

-- Goals
CREATE TABLE goals (
  id             UUID PRIMARY KEY,
  user_id        UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  household_id   UUID REFERENCES households(id) ON DELETE SET NULL,
  name           TEXT NOT NULL,
  target_amount  BIGINT NOT NULL,
  saved_amount   BIGINT NOT NULL DEFAULT 0,
  target_date    DATE,
  notes          TEXT,
  emoji          TEXT,
  color          TEXT,
  is_shared      BOOLEAN NOT NULL DEFAULT FALSE,
  is_completed   BOOLEAN NOT NULL DEFAULT FALSE,
  completed_at   TIMESTAMPTZ,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at     TIMESTAMPTZ
);
CREATE INDEX idx_goals_user      ON goals(user_id);
CREATE INDEX idx_goals_household ON goals(household_id);

-- Goal Contributions
CREATE TABLE goal_contributions (
  id          UUID PRIMARY KEY,
  goal_id     UUID NOT NULL REFERENCES goals(id) ON DELETE CASCADE,
  user_id     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  amount      BIGINT NOT NULL,
  note        TEXT,
  date        DATE NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_contributions_goal ON goal_contributions(goal_id);
CREATE INDEX idx_contributions_date ON goal_contributions(date);

-- Notifications (server-side log; distinct from expo-notifications local schedule)
CREATE TABLE notifications (
  id            UUID PRIMARY KEY,
  user_id       UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  type          TEXT NOT NULL,
  title         TEXT NOT NULL,
  body          TEXT NOT NULL,
  reference_id  UUID,               -- billId, goalId, etc.
  is_read       BOOLEAN NOT NULL DEFAULT FALSE,
  scheduled_at  TIMESTAMPTZ,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_notifications_user       ON notifications(user_id);
CREATE INDEX idx_notifications_read       ON notifications(is_read);
CREATE INDEX idx_notifications_user_created ON notifications(user_id, created_at DESC);
CREATE INDEX idx_notifications_reference  ON notifications(reference_id);

-- Push Tokens
CREATE TABLE push_tokens (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token       TEXT NOT NULL UNIQUE,   -- Expo push token
  platform    TEXT NOT NULL CHECK (platform IN ('ios', 'android')),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_used_at TIMESTAMPTZ
);
CREATE INDEX idx_push_tokens_user ON push_tokens(user_id);
```

### 1.3 Row-Level Security (RLS)

RLS is enforced at the database layer so even a compromised API process cannot
leak cross-user data.

```sql
ALTER TABLE users              ENABLE ROW LEVEL SECURITY;
ALTER TABLE bills              ENABLE ROW LEVEL SECURITY;
ALTER TABLE expenses           ENABLE ROW LEVEL SECURITY;
ALTER TABLE budgets            ENABLE ROW LEVEL SECURITY;
ALTER TABLE goals              ENABLE ROW LEVEL SECURITY;
ALTER TABLE goal_contributions ENABLE ROW LEVEL SECURITY;
ALTER TABLE notifications      ENABLE ROW LEVEL SECURITY;
ALTER TABLE push_tokens        ENABLE ROW LEVEL SECURITY;

-- The API server connects with a role that has app_user_id set per request:
--   SET LOCAL app.user_id = '<uuid>';

CREATE POLICY user_isolation ON bills
  USING (
    user_id = current_setting('app.user_id')::UUID
    OR household_id IN (
      SELECT household_id FROM household_members
      WHERE user_id = current_setting('app.user_id')::UUID
    )
  );
-- (Equivalent policies apply to expenses, budgets, goals, notifications, push_tokens)
```

### 1.4 Index Strategy

- Primary key lookups: UUID primary keys (B-tree, default)  
- Frequently filtered columns: `user_id`, `due_date`, `date`, `category`  
- Soft deletes: partial indexes `WHERE deleted_at IS NULL` so active-record queries never touch deleted rows  
- Composite index on `(user_id, created_at DESC)` for notification inbox queries  
- `push_tokens.token` unique index ensures deduplication on re-registration

---

## 2. Authentication — Better Auth

### 2.1 Magic Link Flow

1. User enters their email on the sign-in screen.  
2. App calls `POST /api/auth/magic-link` with `{ email }`.  
3. Server generates a time-limited token (15 min) and sends a magic link via
   **Resend** (transactional email provider).  
4. User taps the link in their email. The link opens the Akù app via the
   `aku://` deep link scheme (configured in `app.json` as `scheme: "aku"`).  
5. App extracts the token from the URL and calls
   `POST /api/auth/magic-link/verify` with `{ token }`.  
6. Server validates the token, creates a session, and returns `{ accessToken, expiresAt, user }`.  
7. App stores `accessToken` in **SecureStore** (not AsyncStorage) and sets the
   `AuthSession` in the local SQLite `app_state` table.

```
Client                          Server (Better Auth)         Email Provider
  |                                  |                             |
  |--- POST /auth/magic-link ------->|                             |
  |                                  |--- Send magic link email -->|
  |<-- 200 OK ----------------------|                             |
  |                                  |                             |
  |  (user taps email link)          |                             |
  |                                  |                             |
  |--- POST /auth/magic-link/verify ->|                            |
  |<-- { accessToken, user } --------|                            |
```

### 2.2 Session Management

- Sessions are JWT-based, signed with a server secret (RS256).  
- `accessToken` expiry: 7 days.  
- The client sends `Authorization: Bearer <accessToken>` on every API call.  
- On 401 responses the app clears the session and redirects to auth.  
- No refresh token flow in v1 — magic link re-auth is the recovery path.

### 2.3 Local PIN + Biometric Layer

PIN and biometrics are a **local lock** — they do not replace the server
session. The flow is:

1. On app launch, if `AuthSession` exists in SecureStore, the app is
   considered authenticated.  
2. If `pinEnabled` is true (stored in `app_state`), the app is in `isLocked`
   state and renders the PIN/biometric unlock screen.  
3. Successful PIN entry or biometric match sets `isLocked = false` in memory
   (Zustand `auth.store`).  
4. The PIN itself is stored as a **bcrypt hash** in the local SQLite `users`
   table (`pin_hash`). It is never sent to the server in plaintext.  
5. For PIN reset (forgotten PIN), the user re-authenticates via magic link,
   which clears and replaces the local PIN hash.

---

## 3. API Design

### 3.1 Transport

- **REST over HTTPS** (no tRPC in v1 — simpler to audit and mock)  
- Base URL: `https://api.aku.app/v1`  
- All endpoints require `Authorization: Bearer <accessToken>` unless noted  
- All request/response bodies are `application/json`  
- Amounts always transmitted in kobo (`number`)

### 3.2 Endpoints

```
Auth
  POST   /auth/magic-link             Request magic link (no auth required)
  POST   /auth/magic-link/verify      Verify token, create session
  DELETE /auth/session                Sign out (invalidates server session)

User
  GET    /user                        Get current user profile
  PATCH  /user                        Update name, avatarUrl
  POST   /user/push-token             Register/update Expo push token
  DELETE /user/push-token/:token      Remove a push token on sign-out

Sync (primary mechanism for multi-device)
  POST   /sync/push                   Upload local changes to server
  GET    /sync/pull?since=<ISO8601>   Download server changes since timestamp

Bills
  GET    /bills                       List (also returned by /sync/pull)
  POST   /bills                       Create
  PATCH  /bills/:id                   Update
  DELETE /bills/:id                   Soft delete

Expenses
  GET    /expenses?month=YYYY-MM
  POST   /expenses
  PATCH  /expenses/:id
  DELETE /expenses/:id

Budgets
  GET    /budgets
  POST   /budgets
  PATCH  /budgets/:id
  DELETE /budgets/:id

Goals
  GET    /goals
  POST   /goals
  PATCH  /goals/:id
  DELETE /goals/:id
  POST   /goals/:id/contributions
  DELETE /goals/:goalId/contributions/:id

Notifications (in-app log, not push scheduling)
  GET    /notifications               List (newest first, paginated)
  PATCH  /notifications/:id/read      Mark read
  POST   /notifications/read-all      Mark all read

Household
  GET    /household                   Get current household + members
  POST   /household                   Create household
  POST   /household/invite            Generate invite link
  POST   /household/join/:token       Accept invite
  DELETE /household/members/:userId   Remove member (owner only)
```

### 3.3 Sync Strategy — Local-First, Server as Source of Truth

Akù is **local-first**: all writes go to SQLite immediately (zero latency for
the user). The server is synced in the background.

**Push (client → server)**

On each mutation (add/update/delete), the store optimistically writes to
SQLite, then queues a sync job. The sync queue is a simple table in SQLite:

```
sync_queue { id, table, operation, recordId, payload, createdAt }
```

A background effect drains the queue whenever network is available via
`POST /sync/push`. The server processes each entry and responds with
`{ accepted: string[], conflicts: ConflictRecord[] }`.

**Pull (server → client)**

On app foreground, the client calls `GET /sync/pull?since=<lastSyncAt>`.
The server returns all records updated after `since` (using `updated_at`).
The client upserts these into SQLite.

**Conflict Resolution**

Last-write-wins by `updated_at` timestamp. Since the server is the source of
truth, a server record with a newer `updated_at` always wins. The client
discards its local version and adopts the server's. In the future, household
shared records will use operational transforms for concurrent edits.

---

## 4. Notification Infrastructure

### 4.1 Expo Push Notifications Service

Akù uses **Expo's push notification service** (free tier) to abstract over
APNs (iOS) and FCM (Android). This avoids managing APNs certificates and FCM
keys directly in v1.

For scale (> 10,000 DAU), the plan is to move to direct APNs/FCM calls to
eliminate the Expo intermediary latency.

### 4.2 Push Token Registration Flow

```
App start
  └─> notificationService.requestPermissions()
        └─> if granted
              └─> Notifications.getExpoPushTokenAsync({ projectId })
                    └─> POST /user/push-token { token, platform }
                          └─> server upserts into push_tokens table
```

Token registration happens:
- After the user first grants notification permission  
- On every sign-in (tokens can change after app reinstall)  
- On sign-out: `DELETE /user/push-token/:token` is called to prevent
  delivering notifications to a signed-out device

### 4.3 Server-Side Notification Triggers

A background worker (Node.js cron, running on a DigitalOcean App Platform
worker dyno) handles scheduled push delivery:

| Trigger | Schedule | Action |
|---------|----------|--------|
| Bill reminders | Daily 06:00 UTC | Query bills where `due_date - notify_offset = today`, send push |
| Budget exceeded | On expense write | Inline check: if budget exceeded, send push immediately |
| Goal milestone | On contribution write | Inline check: if crossed 25/50/75/100%, send push |
| Daily digest | Daily 08:00 local (per user TZ) | Push "Your Akù daily summary" |

**Server push delivery:**

```ts
// Pseudocode — not yet implemented
const messages = tokensForUser.map(token => ({
  to:    token,
  title: 'Bill due in 3 days',
  body:  'Netflix — ₦5,500.00',
  data:  { screen: 'bill', id: billId, type: 'bill_reminder' },
  // No financial amounts beyond what the user already knows
}));

await fetch('https://exp.host/--/api/v2/push/send', {
  method:  'POST',
  headers: { 'Content-Type': 'application/json' },
  body:    JSON.stringify(messages),
});
```

The server also writes a row to the `notifications` table for every push sent,
so the in-app notification inbox is always accurate even if the user misses the
push.

### 4.4 Local vs Remote Notification Split

| Type | Mechanism | Scheduled by |
|------|-----------|--------------|
| Bill reminders | `expo-notifications` local scheduled | Client (`NotificationService`) |
| Budget alerts | `expo-notifications` immediate local | Client (triggered in budget store after expense add) |
| Goal milestones | `expo-notifications` immediate local | Client (triggered in goals store after contribution) |
| Daily digest | `expo-notifications` daily repeating local | Client (`scheduleDailyDigest`) |
| Multi-device sync notifications | Expo Push (remote) | Server worker |
| Household activity | Expo Push (remote) | Server (on shared record mutation) |

The local-first approach means notifications fire even without internet
connectivity. Remote push is additive — it catches cases where the user's
device was offline when the local schedule should have fired.

---

## 5. Security

### 5.1 Transport

- All API calls use **HTTPS/TLS 1.3**. HTTP redirects to HTTPS (HSTS enforced).  
- Certificate pinning is not implemented in v1 (Expo Go incompatibility);
  planned for production native build.

### 5.2 Credential Storage

| Credential | Storage | Notes |
|-----------|---------|-------|
| `accessToken` | `expo-secure-store` | AES-256, backed by Keychain (iOS) / Keystore (Android) |
| PIN hash | SQLite `users.pin_hash` (local) | bcrypt, cost factor 12; never sent to server |
| PIN hash (server) | PostgreSQL `users.pin_hash` | For reset flow only; same bcrypt encoding |
| Biometric state | `expo-secure-store` | Boolean flag; actual biometric data never leaves the OS |

### 5.3 Push Notification Payload Security

Push notification payloads must **never** contain sensitive financial data
because:
- iOS shows the notification body on the lock screen by default
- Expo's push service sees all payloads in transit

Safe payload pattern:
```json
{
  "title": "Bill due today!",
  "body":  "Netflix — ₦5,500.00",
  "data":  { "screen": "bill", "id": "uuid", "type": "bill_reminder" }
}
```

The body contains the bill name and amount — information the user explicitly
entered. It does **not** contain account balances, total spending, or any
derived financial analysis.

### 5.4 JWT Sessions

- Signed RS256 (asymmetric); private key stored as environment secret, never
  in client code  
- Short expiry (7 days) with no refresh token reduces exposure window  
- Session invalidation on sign-out calls `DELETE /auth/session` which adds
  the JWT `jti` claim to a server-side deny-list (Redis or Postgres table)

### 5.5 API Rate Limiting

- Magic link requests: 3 per email per 10 minutes (prevents email flooding)  
- All authenticated endpoints: 300 requests/minute per user  
- Sync endpoints: 60 requests/minute (batching expected)

---

## 6. Dev Mode Flags

### 6.1 Skip Email Verification

Set `DEV_SKIP_MAGIC_LINK=true` in server `.env`. When true, the `/auth/magic-link/verify`
endpoint accepts `token=dev-bypass-{email}` without checking the database.

```
POST /auth/magic-link/verify
{ "token": "dev-bypass-test@example.com" }
→ returns a valid session for test@example.com
```

Never enabled in production (gated by `NODE_ENV !== 'production'`).

### 6.2 Local-Only Mode (No Backend)

The app is fully functional without a backend. All stores write directly to
SQLite. To run without a server:

1. Do not set `EXPO_PUBLIC_API_URL` in `.env`.  
2. All API calls in stores are wrapped in `if (!apiUrl) return;` guards (to
   be implemented when the sync layer is added).  
3. Notifications use the local `NotificationService` exclusively.

This is the current state of the app (June 2026). The backend described in this
document is the target architecture for v1.1 (multi-device sync and household sharing).

### 6.3 Push Notification Testing Without a Server

Use the [Expo push notification tool](https://expo.dev/notifications) or `curl`:

```bash
curl -X POST https://exp.host/--/api/v2/push/send \
  -H "Content-Type: application/json" \
  -d '{
    "to": "ExponentPushToken[...]",
    "title": "Test bill reminder",
    "body": "Netflix — ₦5,500.00",
    "data": { "screen": "bill", "id": "test-id", "type": "bill_reminder" }
  }'
```

Or trigger local notifications instantly using `notificationService.scheduleBudgetAlert()`
with `trigger: null` from a debug screen.
