/**
 * Email sender using Resend.
 * https://resend.com — free tier: 3,000 emails/month, 100/day.
 *
 * Setup:
 *  1. Create account at resend.com
 *  2. Add + verify your domain (DNS TXT + CNAME records)
 *  3. Create an API key → set RESEND_API_KEY in .env
 *  4. Set EMAIL_FROM to "Akù <auth@yourdomain.com>"
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
  return process.env.EMAIL_FROM ?? 'Akù <onboarding@resend.dev>';
}

// ─── Magic Link Email ─────────────────────────────────────────────────────────

export async function sendMagicLinkEmail(opts: {
  to:       string;
  name:     string | null;
  url:      string;
  otpCode?: string;
}): Promise<void> {
  const resend     = getResend();
  const firstName  = opts.name ? opts.name.split(' ')[0] : null;
  const expiryMins = process.env.MAGIC_LINK_EXPIRY_MINUTES ?? '15';

  const html = magicLinkTemplate({ firstName, url: opts.url, expiryMins, otpCode: opts.otpCode });

  const { error } = await resend.emails.send({
    from:    getFrom(),
    to:      opts.to,
    subject: '🔐 Your Akù sign-in link',
    html,
  });

  if (error) {
    throw new Error(`Failed to send email: ${error.message}`);
  }
}

// ─── Template ─────────────────────────────────────────────────────────────────

function magicLinkTemplate(opts: {
  firstName:  string | null;
  url:        string;
  expiryMins: string;
  otpCode?:   string;
}): string {
  const { firstName, url, expiryMins, otpCode } = opts;
  const greeting = firstName ? `Hi ${firstName}` : 'Hi there';

  return `<!DOCTYPE html>
<html lang="en" xmlns:v="urn:schemas-microsoft-com:vml">
<head>
  <meta charset="utf-8"/>
  <meta name="viewport" content="width=device-width,initial-scale=1"/>
  <meta name="color-scheme" content="light"/>
  <meta name="supported-color-schemes" content="light"/>
  <title>Sign in to Akù</title>
  <style>
    /* Reset */
    body,table,td,a { -webkit-text-size-adjust:100%; -ms-text-size-adjust:100%; }
    table,td { mso-table-lspace:0pt; mso-table-rspace:0pt; }
    img { border:0; height:auto; line-height:100%; outline:none; text-decoration:none; }
    * { box-sizing:border-box; }

    /* Mobile */
    @media only screen and (max-width:600px) {
      .wrapper  { padding:20px 12px !important; }
      .card     { border-radius:0 !important; }
      .hpad     { padding:28px 24px 24px !important; }
      .bpad     { padding:36px 24px 28px !important; }
      .fpad     { padding:20px 24px !important; }
      .btn-wrap { padding:0 !important; }
      .btn-a    { padding:15px 32px !important; font-size:15px !important; }
      h1        { font-size:24px !important; }
    }
  </style>
</head>
<body style="margin:0;padding:0;background:#EDE9E0;font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;">

  <!--[if mso]><xml><o:OfficeDocumentSettings><o:PixelsPerInch>96</o:PixelsPerInch></o:OfficeDocumentSettings></xml><![endif]-->

  <!-- Preview text (hidden) -->
  <div style="display:none;max-height:0;overflow:hidden;mso-hide:all;font-size:1px;color:#EDE9E0;">
    ${greeting} — your Akù sign-in link is ready. Tap to open the app.&ensp;&#847;&ensp;&#847;&ensp;&#847;&ensp;&#847;&ensp;&#847;&ensp;&#847;&ensp;&#847;&ensp;&#847;&ensp;&#847;&ensp;&#847;
  </div>

  <!-- Wrapper -->
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
    <tr>
      <td class="wrapper" align="center" style="padding:48px 16px;">

        <!-- Card -->
        <table role="presentation" class="card" width="540" cellpadding="0" cellspacing="0" border="0"
               style="background:#FFFFFF;border-radius:20px;overflow:hidden;box-shadow:0 8px 40px rgba(22,58,47,0.12);">

          <!-- ── Header ── -->
          <tr>
            <td class="hpad" style="background:#163A2F;padding:30px 44px 26px;">
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
                <tr>
                  <td style="vertical-align:middle;">
                    <span style="font-size:30px;font-weight:200;color:#F5F2EC;letter-spacing:-0.8px;line-height:1;">Akù</span>
                    <br/>
                    <span style="font-size:10px;color:rgba(245,242,236,0.45);letter-spacing:2.5px;text-transform:uppercase;">Financial Companion</span>
                  </td>
                  <td align="right" style="vertical-align:middle;">
                    <table role="presentation" cellpadding="0" cellspacing="0" border="0">
                      <tr>
                        <td style="width:42px;height:42px;border-radius:21px;border:1px solid rgba(245,242,236,0.18);text-align:center;vertical-align:middle;">
                          <span style="font-size:16px;color:rgba(245,242,236,0.35);line-height:42px;">✦</span>
                        </td>
                      </tr>
                    </table>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- Gradient accent bar -->
          <tr>
            <td height="3" style="background:linear-gradient(90deg,#2D6A4F,#52B788,#2D6A4F);font-size:0;line-height:0;">&nbsp;</td>
          </tr>

          <!-- ── Body ── -->
          <tr>
            <td class="bpad" style="padding:44px 44px 36px;">

              <!-- Greeting -->
              <p style="margin:0 0 4px;font-size:13px;color:#A0AEC0;letter-spacing:0.2px;">${greeting},</p>

              <!-- Headline -->
              <h1 style="margin:0 0 18px;font-size:27px;font-weight:300;color:#1A202C;letter-spacing:-0.6px;line-height:1.25;">
                Your sign-in link<br/>is ready.
              </h1>

              <!-- Body copy -->
              <p style="margin:0 0 36px;font-size:15px;color:#718096;line-height:1.75;">
                Tap the button below to open Akù and sign in instantly.
                This link is valid for&nbsp;<strong style="color:#163A2F;font-weight:600;">${expiryMins} minutes</strong>
                and can only be used once.
              </p>

              <!-- ── CTA Button ── -->
              <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="width:100%;margin-bottom:36px;">
                <tr>
                  <td class="btn-wrap" align="center">
                    <!--[if mso]>
                    <v:roundrect xmlns:v="urn:schemas-microsoft-com:vml" xmlns:w="urn:schemas-microsoft-com:office:word"
                      href="${url}"
                      style="height:52px;v-text-anchor:middle;width:220px;"
                      arcsize="50%"
                      strokecolor="#163A2F"
                      fillcolor="#163A2F">
                      <w:anchorlock/>
                      <center style="color:#F5F2EC;font-family:Helvetica,Arial,sans-serif;font-size:16px;font-weight:600;letter-spacing:0.3px;">
                        Sign in to Akù →
                      </center>
                    </v:roundrect>
                    <![endif]-->
                    <!--[if !mso]><!-->
                    <table role="presentation" cellpadding="0" cellspacing="0" border="0">
                      <tr>
                        <td style="border-radius:100px;background:#163A2F;">
                          <a class="btn-a" href="${url}"
                             style="display:inline-block;padding:16px 52px;font-size:16px;font-weight:600;color:#F5F2EC;text-decoration:none;letter-spacing:0.3px;border-radius:100px;line-height:1;">
                            Sign in to Akù &nbsp;→
                          </a>
                        </td>
                      </tr>
                    </table>
                    <!--<![endif]-->
                  </td>
                </tr>
              </table>

              <!-- Divider -->
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
                <tr><td style="border-top:1px solid #EDF2F7;font-size:0;">&nbsp;</td></tr>
              </table>

              <!-- Fallback link -->
              <p style="margin:20px 0 4px;font-size:12px;color:#A0AEC0;">
                Button not working? Copy this link into your browser:
              </p>
              <p style="margin:0;font-size:11px;color:#CBD5E0;word-break:break-all;line-height:1.6;">${url}</p>

              ${otpCode ? `
              <!-- OTP code block -->
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin-top:28px;">
                <tr><td style="border-top:1px solid #EDF2F7;font-size:0;">&nbsp;</td></tr>
              </table>
              <p style="margin:20px 0 4px;font-size:13px;color:#718096;line-height:1.65;">
                Got the email on a different device? Enter this code on the device where you started sign-in:
              </p>
              <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:12px 0 0;">
                <tr>
                  <td style="background:#F0F7F4;border:1px solid #C6E1D5;border-radius:12px;padding:16px 28px;text-align:center;">
                    <p style="margin:0 0 4px;font-size:10px;letter-spacing:2px;text-transform:uppercase;color:#52B788;">One-time code</p>
                    <p style="margin:0;font-size:32px;font-weight:700;letter-spacing:10px;color:#163A2F;font-family:'Courier New',Courier,monospace;">${otpCode}</p>
                    <p style="margin:6px 0 0;font-size:11px;color:#A0AEC0;">Expires in ${expiryMins} minutes · one-time use</p>
                  </td>
                </tr>
              </table>
              ` : ''}

            </td>
          </tr>

          <!-- ── Footer ── -->
          <tr>
            <td class="fpad" style="background:#F7F4EF;padding:22px 44px;border-top:1px solid #EDF2F7;">
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
                <tr>
                  <td width="22" style="vertical-align:top;padding-top:1px;">
                    <span style="font-size:15px;">🔒</span>
                  </td>
                  <td style="padding-left:10px;">
                    <p style="margin:0;font-size:12px;color:#718096;line-height:1.65;">
                      If you didn't request this, you can safely ignore this email — your account is secure.
                      This link will expire automatically and cannot be reused.
                    </p>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

        </table>
        <!-- /Card -->

        <!-- Below-card tagline -->
        <p style="margin:20px 0 0;font-size:11px;color:#A0AEC0;text-align:center;letter-spacing:0.3px;">
          Akù — Your Financial Companion &nbsp;·&nbsp; Sent with care
        </p>

      </td>
    </tr>
  </table>

</body>
</html>`;
}
