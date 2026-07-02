/**
 * Akù API Server
 * Runtime: Node.js 20+ on Ubuntu (DigitalOcean Droplet)
 * Framework: Hono — fast, typed, Node-compatible
 *
 * Start dev:  npm run dev
 * Production: npm run build && npm start  (or pm2, see README.md)
 */
import 'dotenv/config';  // Load .env before anything else

import { serve } from '@hono/node-server';
import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { logger } from 'hono/logger';
import { prettyJSON } from 'hono/pretty-json';

import authRouter from './routes/auth.js';
import userRouter from './routes/user.js';

// ─── App ──────────────────────────────────────────────────────────────────────

const app = new Hono();

// ── Global middleware ─────────────────────────────────────────────────────────

app.use('*', logger());
app.use('*', prettyJSON());

// CORS — allow the Expo dev client and production app
// (Mobile apps don't send an Origin header for native requests, so CORS is
//  mainly needed for web and for testing via browser/Postman.)
app.use(
  '*',
  cors({
    origin: [
      'http://localhost:8081',   // Expo dev server
      'http://localhost:3000',   // Local API (for browser testing)
      process.env.API_URL ?? '',
    ].filter(Boolean),
    allowMethods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowHeaders: ['Content-Type', 'Authorization'],
    credentials:  true,
  }),
);

// ── Health check ──────────────────────────────────────────────────────────────

app.get('/', (c) => c.json({ status: 'ok', service: 'aku-api', version: '1.0.0' }));
app.get('/health', (c) => c.json({ status: 'ok', ts: new Date().toISOString() }));

// ── Routes ────────────────────────────────────────────────────────────────────

app.route('/api/auth', authRouter);
app.route('/api/user', userRouter);

// ── 404 ───────────────────────────────────────────────────────────────────────

app.notFound((c) => c.json({ error: 'Route not found' }, 404));

// ── Error handler ─────────────────────────────────────────────────────────────

app.onError((err, c) => {
  console.error('[server] Unhandled error:', err);
  return c.json({ error: 'Internal server error' }, 500);
});

// ── Start ─────────────────────────────────────────────────────────────────────

const PORT = parseInt(process.env.PORT ?? '3000', 10);

serve({ fetch: app.fetch, port: PORT }, (info) => {
  console.log(`🚀 Akù API running on http://localhost:${info.port}`);
  console.log(`   NODE_ENV: ${process.env.NODE_ENV ?? 'development'}`);
  console.log(`   API_URL:  ${process.env.API_URL ?? '(not set)'}`);
});

export default app;
