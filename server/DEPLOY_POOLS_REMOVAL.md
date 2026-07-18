# Deploy: Pools removal + hourly notification engine + milestone insights

Run from your Mac, **in the repo root** (`cd /Users/nippysky/Documents/Projects/aku` first — running from another folder is why the first rsync failed).

## 1. Push the new server code to the droplet

```bash
rsync -avz --delete \
  --exclude node_modules --exclude dist --exclude logs --exclude .env \
  server/ root@178.128.165.128:/var/www/aku-api/
```

(`--exclude .env` keeps the production secrets in place.)

## 2. On the droplet — build and clean the database

```bash
ssh root@178.128.165.128
cd /var/www/aku-api
npm install          # no new deps, but keeps lockfile in sync
npm run build

# Drop pool tables + purge any pool sync records (irreversible)
# DATABASE_URL is in .env — load it first:
export $(grep DATABASE_URL .env)
psql "$DATABASE_URL" -f drizzle/0001_drop_pools.sql
```

## 2b. Store-compliance extras (same deploy)

```bash
# Demo account for App Store / Play review — add to /var/www/aku-api/.env:
#   DEMO_EMAIL=demo@nippysky.com
#   DEMO_OTP=482913        # any 6 digits; put these in the store review notes
nano .env

# Akù website (landing + privacy + terms + delete-account) — reload nginx:
sudo cp nginx-aku.conf /etc/nginx/sites-available/aku
sudo nginx -t && sudo systemctl reload nginx
curl -s https://aku.nippysky.com/ | head -3               # landing page
curl -s https://aku.nippysky.com/privacy | head -3        # privacy policy
curl -s https://aku.nippysky.com/delete-account | head -3 # deletion page
```

Store-listing URLs:
- Website / marketing: `https://aku.nippysky.com`
- Privacy policy: `https://aku.nippysky.com/privacy`
- Terms of service: `https://aku.nippysky.com/terms`
- Account deletion (Google Data safety form): `https://aku.nippysky.com/delete-account`
- Support email: `contact@nippysky.com`

Note: certbot's HTTPS server block on the droplet mirrors the HTTP one — make
sure the new `location /` static block is present in the **443 server block**
too (certbot usually duplicates edits, but verify with `sudo nginx -T | grep -A6 'location /'`).

## 3. Restart both PM2 processes

```bash
pm2 restart aku-api aku-notif-worker
pm2 logs aku-notif-worker --lines 20   # should print "hourly engagement engine · 09:00–21:00 local"
```

## 4. Verify

```bash
curl -s https://<your-api-domain>/api/pools        # → {"error":"Route not found"} (404)
curl -s https://<your-api-domain>/health           # → ok
```

Then from the app: POST `/api/notifications/test` (Profile → dev tools, or curl with a JWT) to confirm push still works end-to-end.

## What changed server-side

- `routes/pools.ts` deleted; `/api/pools/*` and `/api/notifications/pool-event` gone.
- `pools` + `pool_members` dropped from schema and DB.
- Worker now sends one creative, hour-themed nudge per hour from **9:00 to 21:00 in each user's local timezone**:
  - 9:00–18:00 + 20:00 — rotating engaging copy, seasoned with real insights (over-budget at 10:00, streaks at 11:00, budget check at 14:00, top category at 16:00).
  - 19:00 — the existing fully personalised daily message (onboarding sequence, dormant/lapsing re-engagement, budget/streak/spike analytics).
  - 21:00 — bedtime wrap-up: "Hope you have logged all your expenses and income."
  - Sunday 18:00 — weekly summary (unchanged).
- All hourly nudges respect the user's **Daily Digest** preference; budget-related ones also respect **Budget Alerts**. Dedup via `notification_log` (`hourly_<hour>` types) — max one per slot per user per day, even across restarts.
- Every push carries a `screen` field and the app now routes by it first, so taps always land on the right screen (bill detail, budgets, goals, Finance tab, home).

## Also in this release

- **Goals — savings destination**: each goal can store the bank/platform, account name and account number where the money is actually saved. Shown as a rich card on the goal detail screen with one-tap copy of the account number.
- **Goal insights**: every goal detail screen now computes monthly saving pace, average and biggest contribution, projected finish date (ahead/behind target), plus a progress sparkline.
- **Analytics**: range selector (1M / 3M / 6M / 1Y), range totals, category donut chart, and a per-month savings-rate trend.
- **Milestone-tailored notifications**: the app now reports `savingsRatePct` (income kept this month) after each sync. The worker celebrates ≥ 20% savers at 1pm and in the weekly summary, and warns when spending passes income. The SQL file adds the `savings_rate_pct` column (`ALTER TABLE user_insights …` — included, idempotent).

## App-side note

Existing installs migrate automatically on next launch: local circle/household tables and columns are dropped by the SQLite migration list in `src/lib/database/client.ts`. Ship a new EAS build (schema + UI changed).
