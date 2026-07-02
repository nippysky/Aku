/**
 * Email sender using Resend.
 * https://resend.com — free tier: 3,000 emails/month, 100/day.
 *
 * Setup:
 *  1. Create account at resend.com
 *  2. Add + verify your domain (DNS TXT + CNAME records)
 *  3. Create an API key → set RESEND_API_KEY in .env
 *  4. Set EMAIL_FROM to "Name <you@yourdomain.com>"
 */
import { Resend } from 'resend';

let _resend: Resend | null = null;

function getResend(): Resend {
  if (!_resend) {
    const key = process.env.RESEND_API_KEY;
    if (!key) throw new Error('RESEND_API_KEY is not set');
    _resend = new Resend(key);
  }
  return _resend;
}

function getFrom(): string {
  return process.env.EMAIL_FROM ?? 'Akù <auth@example.com>';
}

// ─── Magic Link Email ─────────────────────────────────────────────────────────

export async function sendMagicLinkEmail(opts: {
  to:   string;
  name: string | null;
  url:  string;
}): Promise<void> {
  const resend      = getResend();
  const greeting    = opts.name ? `Hi ${opts.name.split(' ')[0]},` : 'Hi,';
  const expiryMins  = process.env.MAGIC_LINK_EXPIRY_MINUTES ?? '15';

  const html = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Sign in to Akù</title>
</head>
<body style="margin:0;padding:0;background:#F5F2EC;font-family:'Helvetica Neue',Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#F5F2EC;padding:40px 20px;">
    <tr>
      <td align="center">
        <table width="520" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:16px;overflow:hidden;box-shadow:0 2px 12px rgba(0,0,0,0.06);">

          <!-- Header -->
          <tr>
            <td style="background:#163A2F;padding:32px 40px;">
              <p style="margin:0;font-size:26px;font-weight:300;color:#F5F2EC;letter-spacing:-0.5px;">Akù</p>
              <p style="margin:6px 0 0;font-size:13px;color:rgba(245,242,236,0.6);letter-spacing:0.5px;">YOUR FINANCIAL COMPANION</p>
            </td>
          </tr>

          <!-- Body -->
          <tr>
            <td style="padding:40px 40px 32px;">
              <p style="margin:0 0 8px;font-size:15px;color:#4A5568;">${greeting}</p>
              <h2 style="margin:0 0 16px;font-size:24px;font-weight:300;color:#1A202C;letter-spacing:-0.3px;">Your sign-in link is ready</h2>
              <p style="margin:0 0 32px;font-size:15px;color:#718096;line-height:1.6;">
                Tap the button below to sign in to Akù. This link is valid for <strong>${expiryMins} minutes</strong> and can only be used once.
              </p>

              <!-- CTA Button -->
              <table cellpadding="0" cellspacing="0" style="margin:0 auto 32px;">
                <tr>
                  <td style="background:#163A2F;border-radius:100px;padding:0;">
                    <a href="${opts.url}"
                       style="display:inline-block;padding:16px 40px;font-size:15px;font-weight:500;color:#F5F2EC;text-decoration:none;letter-spacing:0.2px;">
                      Sign in to Akù →
                    </a>
                  </td>
                </tr>
              </table>

              <p style="margin:0 0 8px;font-size:13px;color:#A0AEC0;">Or copy this link into your browser:</p>
              <p style="margin:0;font-size:12px;color:#CBD5E0;word-break:break-all;">${opts.url}</p>
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="background:#F9F7F3;padding:24px 40px;border-top:1px solid #EDF2F7;">
              <p style="margin:0;font-size:12px;color:#A0AEC0;line-height:1.6;">
                If you didn't request this, you can safely ignore this email.<br/>
                This link will expire automatically.
              </p>
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;

  const { error } = await resend.emails.send({
    from:    getFrom(),
    to:      opts.to,
    subject: 'Your Akù sign-in link',
    html,
  });

  if (error) {
    throw new Error(`Failed to send email: ${error.message}`);
  }
}
