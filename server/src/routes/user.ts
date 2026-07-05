/**
 * User profile routes (all protected)
 *
 * GET /api/user/me           — Get current user's profile
 * PUT /api/user/me           — Update name
 * PUT /api/user/avatar-data  — Sync base64 avatar (fire-and-forget from device)
 * GET /api/user/dek          — Fetch the user's DEK (decrypted) — new-device restore
 * POST /api/user/dek         — Store/update the user's DEK (encrypted at rest)
 */
import { Hono } from 'hono';
import { eq } from 'drizzle-orm';
import { db } from '../db/client.js';
import { users } from '../db/schema.js';
import { authMiddleware, type AuthContext } from '../middleware/auth.js';
import { encryptDekForStorage, decryptDekFromStorage } from '../lib/server-crypto.js';

const router = new Hono<{ Variables: AuthContext }>();

// All routes require auth
router.use('*', authMiddleware);

// ─── GET /api/user/me ─────────────────────────────────────────────────────────

router.get('/me', async (c) => {
  const { sub: userId } = c.get('jwtPayload');

  const [user] = await db
    .select()
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);

  if (!user) return c.json({ error: 'User not found' }, 404);

  return c.json({
    id:         user.id,
    name:       user.name,
    email:      user.email,
    avatarUrl:  user.avatarUrl,
    avatarData: user.avatarData,
    createdAt:  user.createdAt,
  });
});

// ─── PUT /api/user/me ─────────────────────────────────────────────────────────

router.put('/me', async (c) => {
  const { sub: userId } = c.get('jwtPayload');

  let body: { name?: string };
  try {
    body = await c.req.json();
  } catch {
    return c.json({ error: 'Invalid JSON body' }, 400);
  }

  const name = body.name?.trim();
  if (!name || name.length < 1) {
    return c.json({ error: 'Name is required' }, 400);
  }

  await db
    .update(users)
    .set({ name, updatedAt: new Date() })
    .where(eq(users.id, userId));

  return c.json({ success: true, name });
});

// ─── PUT /api/user/avatar-data ───────────────────────────────────────────────
// Receives a base64 data URI from the device and stores it in the DB.
// The device is authoritative — this is a background sync, not a blocking upload.
// Payload: { avatarData: "data:image/jpeg;base64,..." }

router.put('/avatar-data', async (c) => {
  const { sub: userId } = c.get('jwtPayload');

  let body: { avatarData?: string };
  try {
    body = await c.req.json();
  } catch {
    return c.json({ error: 'Invalid JSON body' }, 400);
  }

  const avatarData = body.avatarData?.trim();

  // Accept null/empty to allow avatar removal
  if (avatarData !== undefined && avatarData !== '' && !avatarData.startsWith('data:image/')) {
    return c.json({ error: 'avatarData must be a valid image data URI' }, 400);
  }

  // Soft cap: ~100 KB base64 ≈ 75 KB image ≈ a 300×300 JPEG. More than enough.
  if (avatarData && avatarData.length > 150_000) {
    return c.json({ error: 'Avatar data is too large (max ~100 KB)' }, 413);
  }

  await db
    .update(users)
    .set({ avatarData: avatarData ?? null, updatedAt: new Date() })
    .where(eq(users.id, userId));

  return c.json({ success: true });
});

// ─── GET /api/user/dek ───────────────────────────────────────────────────────
// Returns the user's plaintext DEK (hex) so a new device can decrypt its data.
// Auth-gated — only the owner can fetch their own DEK.

router.get('/dek', async (c) => {
  const { sub: userId } = c.get('jwtPayload');

  const [user] = await db
    .select({ encryptedDek: users.encryptedDek })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);

  if (!user) return c.json({ error: 'User not found' }, 404);
  if (!user.encryptedDek) return c.json({ dek: null });

  try {
    const dek = decryptDekFromStorage(user.encryptedDek);
    return c.json({ dek });
  } catch (err) {
    console.error('[dek] Failed to decrypt DEK for user', userId, err);
    return c.json({ error: 'Failed to decrypt DEK' }, 500);
  }
});

// ─── POST /api/user/dek ──────────────────────────────────────────────────────
// Store or update the user's DEK. The server encrypts it before persisting.
// Called once at first PIN setup, and again if the initial upload failed.
// Body: { dek: "<64-char hex string>" }

router.post('/dek', async (c) => {
  const { sub: userId } = c.get('jwtPayload');

  let body: { dek?: unknown };
  try {
    body = await c.req.json();
  } catch {
    return c.json({ error: 'Invalid JSON body' }, 400);
  }

  const dek = body.dek;
  if (typeof dek !== 'string' || !/^[0-9a-f]{64}$/i.test(dek)) {
    return c.json({ error: 'dek must be a 64-character lowercase hex string' }, 400);
  }

  let encryptedDek: string;
  try {
    encryptedDek = encryptDekForStorage(dek);
  } catch (err) {
    console.error('[dek] Encryption failed — check SERVER_DEK_MASTER_KEY', err);
    return c.json({ error: 'Server encryption misconfigured' }, 500);
  }

  await db
    .update(users)
    .set({ encryptedDek, updatedAt: new Date() })
    .where(eq(users.id, userId));

  return c.json({ success: true });
});

export default router;
