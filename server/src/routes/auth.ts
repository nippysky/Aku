/**
 * Auth routes
 *
 * POST /api/auth/magic-link        — Send magic link email
 * GET  /api/auth/magic-link/verify — Verify token → redirect to app deep link
 * GET  /api/auth/session           — Validate current JWT (app startup check)
 * DELETE /api/auth/session         — Sign out (revoke session)
 */
import { Hono } from 'hono';
import { createHash, randomBytes } from 'crypto';
import { eq, and, isNull, gt } from 'drizzle-orm';
import { db } from '../db/client.js';
import { users, magicTokens, sessions } from '../db/schema.js';
import { signJWT, hashToken } from '../lib/jwt.js';
import { sendMagicLinkEmail } from '../lib/email.js';
import { authMiddleware, type AuthContext } from '../middleware/auth.js';

const router = new Hono<{ Variables: AuthContext }>();

// ─── Helpers ─────────────────────────────────────────────────────────────────

function generateId(): string {
  return randomBytes(16).toString('hex');
}

function getExpiryDate(): Date {
  const mins = parseInt(process.env.MAGIC_LINK_EXPIRY_MINUTES ?? '15', 10);
  return new Date(Date.now() + mins * 60 * 1000);
}

function getSessionExpiry(): Date {
  // Parse "30d", "7d", "24h" etc — default 30 days
  const expiry = process.env.JWT_EXPIRY ?? '30d';
  const match  = expiry.match(/^(\d+)([dhm])$/);
  if (!match) return new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);

  const value = parseInt(match[1], 10);
  const unit  = match[2];
  const ms    = unit === 'd' ? value * 86_400_000
              : unit === 'h' ? value * 3_600_000
              : value * 60_000;
  return new Date(Date.now() + ms);
}

// ─── POST /api/auth/magic-link ────────────────────────────────────────────────

router.post('/magic-link', async (c) => {
  let body: { email?: string; name?: string; intent?: 'sign-in' | 'sign-up' };
  try {
    body = await c.req.json();
  } catch {
    return c.json({ error: 'Invalid JSON body' }, 400);
  }

  const email  = body.email?.trim().toLowerCase();
  const intent = body.intent;
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return c.json({ error: 'Valid email is required' }, 400);
  }

  let [user] = await db.select().from(users).where(eq(users.email, email)).limit(1);

  // ── Security hardening ──────────────────────────────────────────────────
  // Previously ANY email — known or not — silently created an account and
  // signed the requester in. That meant typing a stranger's email into
  // "Sign in" logged you into a brand-new, empty account under their name,
  // which looks like (and functionally is) an account-enumeration/identity
  // hole. Now the client tells us which flow it's in, and we enforce it:
  //   sign-in → email MUST already exist
  //   sign-up → email must NOT already exist
  // No intent (e.g. a resend from verify.tsx, or Ụgwọ's Connect-Akù flow
  // acting as a second client of this same API) falls through to the
  // original find-or-create behavior, unchanged.
  if (intent === 'sign-in' && !user) {
    return c.json({
      error: "We couldn't find an account with that email. Try signing up instead.",
      code:  'account_not_found',
    }, 404);
  }
  if (intent === 'sign-up' && user) {
    return c.json({
      error: 'That email is already registered. Try signing in instead.',
      code:  'account_exists',
    }, 409);
  }

  // Find or create the user — track whether this is a brand-new account.
  let isNewUser = false;

  if (!user) {
    isNewUser = true;
    const newUser = {
      id:           generateId(),
      name:         body.name ?? email.split('@')[0],
      email,
      encryptedDek: null,  // set by the client after first PIN setup
      preferredCurrencyCode:   null,
      preferredCurrencySymbol: null,
      createdAt:    new Date(),
      updatedAt:    new Date(),
    };
    await db.insert(users).values(newUser);
    user = { ...newUser };
  }

  // Generate a raw random token and store its hash
  const rawToken  = randomBytes(32).toString('hex');
  const tokenHash = createHash('sha256').update(rawToken).digest('hex');

  // Generate a 6-digit OTP as an alternative to clicking the link.
  // This is especially helpful when the email arrives on a different device.
  const otpCode = String(Math.floor(100000 + Math.random() * 900000));

  await db.insert(magicTokens).values({
    id:        generateId(),
    email,
    tokenHash,
    otpCode,
    expiresAt: getExpiryDate(),
    isNew:     isNewUser,  // client uses this to skip onboarding for returning users
  });

  // Build the verification URL (goes to the server, then redirects to app)
  const apiUrl = process.env.API_URL ?? 'http://localhost:3000';
  const verifyUrl = `${apiUrl}/api/auth/magic-link/verify?token=${rawToken}`;

  try {
    await sendMagicLinkEmail({ to: email, name: user.name, url: verifyUrl, otpCode });
  } catch (err) {
    console.error('[auth] Failed to send magic link email:', err);
    return c.json({ error: 'Failed to send email. Please try again.' }, 500);
  }

  return c.json({ success: true, message: 'Magic link sent' });
});

// ─── GET /api/auth/magic-link/verify ─────────────────────────────────────────
// Browser opens this URL from the email. We verify the token, create a session,
// then redirect the browser to the app's deep link with the JWT attached.

router.get('/magic-link/verify', async (c) => {
  const rawToken = c.req.query('token');
  if (!rawToken) {
    return c.html(errorPage('Missing token. Please request a new sign-in link.'), 400);
  }

  const tokenHash = createHash('sha256').update(rawToken).digest('hex');

  // Look up the token — must be unused and not expired
  const [record] = await db
    .select()
    .from(magicTokens)
    .where(
      and(
        eq(magicTokens.tokenHash, tokenHash),
        isNull(magicTokens.usedAt),
        gt(magicTokens.expiresAt, new Date()),
      ),
    )
    .limit(1);

  if (!record) {
    return c.html(errorPage('This link has expired or already been used. Please request a new one.'), 400);
  }

  // Carry the new-user flag through to the deep link
  const isNewUser = record.isNew;

  // Mark token as used
  await db
    .update(magicTokens)
    .set({ usedAt: new Date() })
    .where(eq(magicTokens.tokenHash, tokenHash));

  // Find the user
  const [user] = await db
    .select()
    .from(users)
    .where(eq(users.email, record.email))
    .limit(1);

  if (!user) {
    return c.html(errorPage('User not found. Please sign up again.'), 404);
  }

  // Create a session
  const sessionId    = generateId();
  const sessionExpiry = getSessionExpiry();

  const jwt = await signJWT({
    sub:       user.id,
    email:     user.email,
    name:      user.name,
    sessionId,
  });

  const jwtHash = hashToken(jwt);

  await db.insert(sessions).values({
    id:        sessionId,
    userId:    user.id,
    tokenHash: jwtHash,
    expiresAt: sessionExpiry,
  });

  // Redirect to the app's deep link
  // The app's auth-callback route reads ?token= and ?user=
  // isNew tells the app whether to route to full onboarding (new user)
  // or PIN-setup-only (returning user on a new device).
  const scheme   = process.env.APP_SCHEME ?? 'aku';
  const userData = Buffer.from(JSON.stringify({
    id:                      user.id,
    name:                    user.name,
    email:                   user.email,
    preferredCurrencyCode:   user.preferredCurrencyCode ?? null,
    preferredCurrencySymbol: user.preferredCurrencySymbol ?? null,
    isNew:                   isNewUser,
  })).toString('base64');

  const deepLink = `${scheme}://auth-callback?token=${encodeURIComponent(jwt)}&user=${encodeURIComponent(userData)}`;

  // Return an HTML page that auto-redirects to the deep link.
  // If the app isn't installed the page shows a fallback message.
  return c.html(redirectPage(deepLink));
});

// ─── POST /api/auth/magic-link/verify-otp ────────────────────────────────────
// Alternative verification for cross-device use: user types the 6-digit OTP
// that was included in the magic link email instead of tapping the link.
// Returns the same JWT + user payload as the link-based verify.

router.post('/magic-link/verify-otp', async (c) => {
  let body: { email?: string; otp?: string };
  try {
    body = await c.req.json();
  } catch {
    return c.json({ error: 'Invalid JSON body' }, 400);
  }

  const email = body.email?.trim().toLowerCase();
  const otp   = body.otp?.trim();

  if (!email || !otp) {
    return c.json({ error: 'email and otp are required' }, 400);
  }

  // ── App-store review demo account ─────────────────────────────────────────
  // Reviewers can't receive magic-link emails, so a fixed demo credential is
  // allowed when BOTH env vars are set (e.g. DEMO_EMAIL=demo@nippysky.com,
  // DEMO_OTP=<code you put in the review notes>). No-op in normal operation.
  const demoEmail = process.env.DEMO_EMAIL?.trim().toLowerCase();
  const demoOtp   = process.env.DEMO_OTP?.trim();
  if (demoEmail && demoOtp && email === demoEmail && otp === demoOtp) {
    let [demoUser] = await db.select().from(users).where(eq(users.email, demoEmail)).limit(1);
    if (!demoUser) {
      const newId = generateId();
      await db.insert(users).values({ id: newId, name: 'Demo Reviewer', email: demoEmail });
      [demoUser] = await db.select().from(users).where(eq(users.id, newId)).limit(1);
    }
    const demoSessionId = generateId();
    const demoJwt = await signJWT({
      sub:       demoUser!.id,
      email:     demoUser!.email,
      name:      demoUser!.name,
      sessionId: demoSessionId,
    });
    await db.insert(sessions).values({
      id:        demoSessionId,
      userId:    demoUser!.id,
      tokenHash: hashToken(demoJwt),
      expiresAt: getSessionExpiry(),
    });
    return c.json({
      jwt:   demoJwt,
      isNew: false,
      user: {
        id:                      demoUser!.id,
        name:                    demoUser!.name,
        email:                   demoUser!.email,
        preferredCurrencyCode:   demoUser!.preferredCurrencyCode ?? null,
        preferredCurrencySymbol: demoUser!.preferredCurrencySymbol ?? null,
      },
    });
  }

  // Find the most-recent unused, non-expired token for this email + OTP
  const [record] = await db
    .select()
    .from(magicTokens)
    .where(
      and(
        eq(magicTokens.email, email),
        eq(magicTokens.otpCode, otp),
        isNull(magicTokens.usedAt),
        gt(magicTokens.expiresAt, new Date()),
      ),
    )
    .limit(1);

  if (!record) {
    return c.json({ error: 'Invalid or expired code. Please request a new sign-in link.' }, 400);
  }

  // Mark token as used
  await db
    .update(magicTokens)
    .set({ usedAt: new Date() })
    .where(eq(magicTokens.id, record.id));

  const [user] = await db
    .select()
    .from(users)
    .where(eq(users.email, record.email))
    .limit(1);

  if (!user) {
    return c.json({ error: 'User not found. Please sign up again.' }, 404);
  }

  const sessionId     = generateId();
  const sessionExpiry = getSessionExpiry();

  const jwt = await signJWT({
    sub:       user.id,
    email:     user.email,
    name:      user.name,
    sessionId,
  });

  await db.insert(sessions).values({
    id:        sessionId,
    userId:    user.id,
    tokenHash: hashToken(jwt),
    expiresAt: sessionExpiry,
  });

  return c.json({
    jwt,
    isNew: record.isNew,
    user:  {
      id:                      user.id,
      name:                    user.name,
      email:                   user.email,
      preferredCurrencyCode:   user.preferredCurrencyCode ?? null,
      preferredCurrencySymbol: user.preferredCurrencySymbol ?? null,
    },
  });
});

// ─── GET /api/auth/session ────────────────────────────────────────────────────
// App calls this on startup to validate the stored JWT is still active.

router.get('/session', authMiddleware, async (c) => {
  const payload = c.get('jwtPayload');

  const [user] = await db
    .select()
    .from(users)
    .where(eq(users.id, payload.sub))
    .limit(1);

  if (!user) return c.json({ error: 'User not found' }, 404);

  return c.json({
    user: {
      id:                      user.id,
      name:                    user.name,
      email:                   user.email,
      preferredCurrencyCode:   user.preferredCurrencyCode ?? null,
      preferredCurrencySymbol: user.preferredCurrencySymbol ?? null,
    },
    sessionId: payload.sessionId,
  });
});

// ─── DELETE /api/auth/session ─────────────────────────────────────────────────
// Sign out — revokes the current session in the DB.

router.delete('/session', authMiddleware, async (c) => {
  const authHeader = c.req.header('Authorization')!;
  const token      = authHeader.slice(7);
  const tokenHash  = hashToken(token);

  await db
    .update(sessions)
    .set({ revokedAt: new Date() })
    .where(eq(sessions.tokenHash, tokenHash));

  return c.json({ success: true });
});

// ─── HTML helpers ─────────────────────────────────────────────────────────────

function redirectPage(deepLink: string): string {
  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8"/>
  <meta name="viewport" content="width=device-width,initial-scale=1"/>
  <title>Opening Akù…</title>
  <style>
    body { margin:0; background:#163A2F; display:flex; align-items:center; justify-content:center;
           min-height:100vh; font-family:'Helvetica Neue',Arial,sans-serif; }
    .card { background:#fff; border-radius:16px; padding:40px 32px; text-align:center; max-width:360px; width:90%; }
    h2 { margin:0 0 8px; font-size:22px; font-weight:300; color:#1A202C; }
    p { margin:0 0 24px; font-size:14px; color:#718096; line-height:1.6; }
    a.btn { display:inline-block; background:#163A2F; color:#F5F2EC; padding:14px 32px;
            border-radius:100px; font-size:14px; text-decoration:none; }
  </style>
  <script>
    // Auto-redirect after 500ms
    setTimeout(function() { window.location.href = ${JSON.stringify(deepLink)}; }, 500);
  </script>
</head>
<body>
  <div class="card">
    <h2>Opening Akù…</h2>
    <p>You're signed in! If the app doesn't open automatically, tap the button below.</p>
    <a class="btn" href="${deepLink}">Open Akù</a>
  </div>
</body>
</html>`;
}

function errorPage(message: string): string {
  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8"/>
  <meta name="viewport" content="width=device-width,initial-scale=1"/>
  <title>Sign-in Error — Akù</title>
  <style>
    body { margin:0; background:#163A2F; display:flex; align-items:center; justify-content:center;
           min-height:100vh; font-family:'Helvetica Neue',Arial,sans-serif; }
    .card { background:#fff; border-radius:16px; padding:40px 32px; text-align:center; max-width:360px; width:90%; }
    h2 { margin:0 0 8px; font-size:22px; font-weight:300; color:#1A202C; }
    p { margin:0; font-size:14px; color:#718096; line-height:1.6; }
  </style>
</head>
<body>
  <div class="card">
    <h2>Sign-in failed</h2>
    <p>${message}</p>
  </div>
</body>
</html>`;
}

export default router;
