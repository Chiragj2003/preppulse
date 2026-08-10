import { env } from "./env";

/**
 * Minimal transactional email via Resend's REST API — no SDK dependency.
 *
 * If RESEND_API_KEY isn't set we log the message to the server console instead
 * of throwing. That keeps magic-link sign-in fully usable in local development
 * without forcing an email provider signup: the link is right there in the
 * terminal running `npm run dev`.
 */
export async function sendEmail(options: {
  to: string;
  subject: string;
  html: string;
  text: string;
}): Promise<{ delivered: boolean }> {
  const apiKey = env.resendApiKey;

  if (!apiKey) {
    console.info(
      [
        "",
        "─".repeat(72),
        "  ✉  EMAIL NOT SENT — RESEND_API_KEY is not configured.",
        `     To:      ${options.to}`,
        `     Subject: ${options.subject}`,
        "",
        options.text,
        "─".repeat(72),
        "",
      ].join("\n"),
    );
    return { delivered: false };
  }

  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: env.emailFrom,
      to: [options.to],
      subject: options.subject,
      html: options.html,
      text: options.text,
    }),
  });

  if (!response.ok) {
    const detail = await response.text().catch(() => "");
    throw new Error(`Resend rejected the message (${response.status}): ${detail.slice(0, 300)}`);
  }

  return { delivered: true };
}

export function magicLinkEmail(url: string) {
  return {
    subject: "Your PrepPulse sign-in link",
    text: `Sign in to PrepPulse:\n\n${url}\n\nThis link expires in 10 minutes. If you didn't request it, you can ignore this email.`,
    html: `
<!doctype html>
<html>
  <body style="margin:0;padding:32px;background:#f6f6f7;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
      <tr><td align="center">
        <table role="presentation" width="100%" style="max-width:440px;background:#fff;border-radius:18px;padding:36px;box-shadow:0 1px 3px rgba(0,0,0,.06);">
          <tr><td>
            <p style="margin:0 0 6px;font-size:13px;letter-spacing:.08em;text-transform:uppercase;color:#8a8a8e;">PrepPulse</p>
            <h1 style="margin:0 0 14px;font-size:24px;line-height:1.25;color:#1c1c1e;font-weight:600;">Here's your sign-in link</h1>
            <p style="margin:0 0 26px;font-size:15px;line-height:1.6;color:#3a3a3c;">Tap the button below to sign in. The link works once and expires in 10 minutes.</p>
            <a href="${url}" style="display:inline-block;background:#1c1c1e;color:#fff;text-decoration:none;padding:13px 26px;border-radius:999px;font-size:15px;font-weight:500;">Sign in to PrepPulse</a>
            <p style="margin:26px 0 0;font-size:13px;line-height:1.6;color:#8a8a8e;">If the button doesn't work, paste this into your browser:<br><span style="color:#3a3a3c;word-break:break-all;">${url}</span></p>
          </td></tr>
        </table>
      </td></tr>
    </table>
  </body>
</html>`.trim(),
  };
}
