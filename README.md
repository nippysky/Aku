# Akù — Wealth. Tracked. Understood.

A personal finance tracker by **NIPPYSKY**. Sibling product to
[Ụgwọ](https://ugwo.nippysky.com) — same DNA: self-logged data, zero bank
connections, end-to-end encrypted, local-first, reminder-driven.

**We can't see your money. Nobody can.**

## Layout

```
.
├── src/                 # Expo app (SDK 56, expo-router, TypeScript strict)
│   ├── app/             #   screens (tabs, expenses, income, bills, goals, onboarding, auth)
│   ├── components/      #   UI kit + finance components (sheets, charts)
│   ├── lib/             #   crypto, sqlite (drizzle), sync engine, notifications
│   ├── store/           #   zustand stores (auth, expenses, income, bills, goals, sync, ui)
│   └── theme/           #   design tokens (Fraunces + Plus Jakarta Sans)
├── server/              # aku-api (Hono + Drizzle + Postgres + Redis + Resend)
│   ├── src/             #   auth (magic link + OTP), sync, DEK escrow, notifications
│   ├── public/          #   marketing site aku.nippysky.com (+ privacy/terms/delete-account)
│   ├── nginx-aku.conf   #   nginx site
│   ├── ecosystem.config.cjs
│   └── DEPLOY.md        #   step-by-step droplet deployment
└── assets/              # icons, splash, fonts (brand assets)
```

## Architecture in one paragraph

The SQLite database on the phone is the source of truth. Every record —
expenses, income, bills, goals — is encrypted on-device (AES-256-GCM) with a
per-account DEK before sync; the server stores ciphertext plus the DEK
wrapped by a server master key, so a returning user on a new device restores
by email sign-in alone. Reminders (bill due dates, daily check-ins) are Expo
local notifications scheduled on-device — the server can't read any of it.
Real-time cross-device sync rides a WebSocket nudge (Redis pub/sub on the
server), with foreground pull as the safety net. Ụgwọ can optionally mirror
debts and repayments in as expense/income entries under a Loans category —
one-way, opt-in, and gated on matching currencies.

## Development

```bash
npm install
cp .env.example .env        # set EXPO_PUBLIC_API_URL
npx expo start              # app (use a dev build — expo-sqlite etc. need native code)

cd server
npm install
cp .env.example .env        # dev values
npm run dev                 # API on :3000
```

## Builds & stores

- `npx eas init` once, paste the project ID into `app.config.js` (two spots).
- `eas build --profile production` — profiles are in `eas.json`.
- Store URLs: privacy `https://aku.nippysky.com/privacy`, deletion
  `https://aku.nippysky.com/delete-account`.
- iOS export compliance is pre-answered (`ITSAppUsesNonExemptEncryption=false`
  — standard encryption only).
- A reviewer demo login is supported via `DEMO_EMAIL`/`DEMO_OTP` server env.

## Deployment

See [server/DEPLOY.md](server/DEPLOY.md) — same droplet as ugwo-api, own
Postgres DB (`aku_db`), own PM2 process (`aku-api`), own nginx site
(`aku.nippysky.com`).

---

Akù · A venture by NIPPYSKY · By the makers of Ụgwọ
