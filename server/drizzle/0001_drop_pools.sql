-- Removes the Pools/Circles feature entirely.
-- Run once on the droplet:
--   psql "$DATABASE_URL" -f drizzle/0001_drop_pools.sql
-- (or: npm run db:push  — drizzle-kit will also offer to drop the tables
--  now that they are gone from src/db/schema.ts)

BEGIN;

-- 1. Drop pool tables (pool_members first — FK on pools)
DROP TABLE IF EXISTS pool_members;
DROP TABLE IF EXISTS pools;

-- 2. Purge any pool/circle entities that were synced as encrypted blobs
DELETE FROM sync_records
WHERE entity_type IN (
  'pool', 'circle', 'household',
  'pool_contribution', 'circle_contribution', 'household_contribution',
  'contribution'
);

-- 3. New insight signal for milestone-tailored notifications
ALTER TABLE user_insights ADD COLUMN IF NOT EXISTS savings_rate_pct real;

COMMIT;
