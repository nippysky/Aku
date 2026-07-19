-- Adds server-persisted currency preference + "yesterday's spend" insight signal.
-- Run once on the droplet:
--   psql "$DATABASE_URL" -f drizzle/0002_currency_and_yesterday_recap.sql

BEGIN;

-- 1. Preferred currency — set on registration, changeable in More > Currency.
--    Persisted server-side so it survives logout / reinstall / new-device sign-in.
ALTER TABLE users ADD COLUMN IF NOT EXISTS preferred_currency_code text;
ALTER TABLE users ADD COLUMN IF NOT EXISTS preferred_currency_symbol text;

-- 2. Yesterday recap insight — powers the first push notification of the day.
ALTER TABLE user_insights ADD COLUMN IF NOT EXISTS yesterday_expense_total integer NOT NULL DEFAULT 0;
ALTER TABLE user_insights ADD COLUMN IF NOT EXISTS yesterday_expense_count integer NOT NULL DEFAULT 0;

COMMIT;
