-- Removes the Budgets feature entirely (folded nowhere — the app is now
-- purely Expense / Income / Bill / Goal). Budgets were stored client-side
-- as encrypted blobs in sync_records (entityType='budget', no server table
-- to drop there), plus two aggregate columns on user_insights used only for
-- budget-threshold push copy.
-- Run once on the droplet:
--   psql "$DATABASE_URL" -f drizzle/0003_remove_budgets.sql

BEGIN;

ALTER TABLE user_insights DROP COLUMN IF EXISTS budget_utilization;
ALTER TABLE user_insights DROP COLUMN IF EXISTS has_over_budget;

-- Any lingering sync_records rows with entityType='budget' are now orphaned
-- (the client no longer pushes or reads them) — safe to purge.
DELETE FROM sync_records WHERE entity_type = 'budget';

COMMIT;
