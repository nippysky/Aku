-- Removes the profile-photo (avatar) feature entirely. Akù now shows a
-- plain name + email in More, matching Ụgwọ — no photo upload, no CDN,
-- no base64-in-Postgres. The client-side PUT /api/user/avatar-data route
-- and the notification-settings PATCH /api/notifications/preferences route
-- were also deleted from server/src (no user-facing toggle remains — all
-- notifications are enabled by default). notif_prefs_json itself is left
-- alone; the worker now ignores it unconditionally.
-- Run once on the droplet:
--   psql "$DATABASE_URL" -f drizzle/0004_remove_avatar.sql

BEGIN;

ALTER TABLE users DROP COLUMN IF EXISTS avatar_url;
ALTER TABLE users DROP COLUMN IF EXISTS avatar_data;

COMMIT;
