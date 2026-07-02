/**
 * User profile routes (all protected)
 *
 * GET  /api/user/me      — Get current user's profile
 * PUT  /api/user/me      — Update name
 * POST /api/user/avatar  — Upload avatar to Cloudinary, returns { avatarUrl }
 */
import { Hono } from 'hono';
import { eq } from 'drizzle-orm';
import { db } from '../db/client.js';
import { users } from '../db/schema.js';
import { uploadAvatar } from '../lib/cloudinary.js';
import { authMiddleware, type AuthContext } from '../middleware/auth.js';

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
    id:        user.id,
    name:      user.name,
    email:     user.email,
    avatarUrl: user.avatarUrl,
    createdAt: user.createdAt,
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

// ─── POST /api/user/avatar ────────────────────────────────────────────────────
// Accepts multipart/form-data with field "avatar" (image file, max 5 MB).

router.post('/avatar', async (c) => {
  const { sub: userId } = c.get('jwtPayload');

  // Parse multipart form
  let formData: FormData;
  try {
    formData = await c.req.formData();
  } catch {
    return c.json({ error: 'Expected multipart/form-data' }, 400);
  }

  const file = formData.get('avatar');
  if (!file || !(file instanceof File)) {
    return c.json({ error: 'Field "avatar" (image file) is required' }, 400);
  }

  // Size check (5 MB)
  if (file.size > 5 * 1024 * 1024) {
    return c.json({ error: 'Image must be under 5 MB' }, 413);
  }

  // Type check
  const allowed = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp', 'image/heic'];
  if (!allowed.includes(file.type)) {
    return c.json({ error: 'Only JPEG, PNG, WebP and HEIC images are allowed' }, 415);
  }

  let avatarUrl: string;
  try {
    const buffer = Buffer.from(await file.arrayBuffer());
    avatarUrl = await uploadAvatar(buffer, userId, file.type);
  } catch (err) {
    console.error('[avatar] Cloudinary upload failed:', err);
    return c.json({ error: 'Upload failed. Please try again.' }, 500);
  }

  // Persist the URL in the DB
  await db
    .update(users)
    .set({ avatarUrl, updatedAt: new Date() })
    .where(eq(users.id, userId));

  return c.json({ avatarUrl });
});

export default router;
