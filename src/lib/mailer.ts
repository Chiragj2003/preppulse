import { env } from "./env";

function logToConsole(reason: string, options: { to: string; subject: string; text: string }) {
  console.info(
    [
      "",
      "=".repeat(74),
      `  EMAIL NOT DELIVERED - ${reason}`,
      `  To:      ${options.to}`,
      `  Subject: ${options.subject}`,
      "",
      options.text,
      "=".repeat(74),
      "",
    ].join("\n"),
  );
}

/**
 * Minimal transactional email via Resend's REST API - no SDK dependency.
 *
 * Two deliberate fallbacks, both so that local sign-in is never blocked by
 * email configuration:
 *
 *   1. No RESEND_API_KEY  -> print the message to the server console.
 *   2. Provider rejects it in development -> print it and carry on. Resend
 *      only delivers to the account owner's own address until a domain is
 *      verified, which would otherwise make magic-link sign-in untestable
 *      with any other address.
 *
 * In production a rejection still throws, because there it is a real failure.
 */
export async function sendEmail(options: {
  to: string;
  subject: string;
  html: string;
  text: string;
}): Promise<{ delivered: boolean }> {
  const apiKey = env.resendApiKey;

  if (!apiKey) {
    logToConsole("RESEND_API_KEY is not configured", options);
    return { delivered: false };
  }

  let response: Response;
  try {
    response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        from: env.emailFrom,
        to: [options.to],
        subject: options.subject,
        html: options.html,
        text: options.text,
      }),
    });
  } catch (error) {
    if (env.isProduction) throw error;
    logToConsole("could not reach Resend", options);
    return { delivered: false };
  }

  if (response.ok) return { delivered: true };

  const detail = await response.text().catch(() => "");
  const restricted = /only send testing emails|verify a domain/i.test(detail);

  if (!env.isProduction) {
    logToConsole(
      restricted
        ? "Resend is in testing mode (verify a domain to reach other addresses)"
        : `Resend returned ${response.status}`,
      options,
    );
    return { delivered: false };
  }

  throw new Error(
    restricted
      ? "Email is not configured for this domain yet. Verify a sending domain at resend.com/domains and set EMAIL_FROM to an address on it."
      : `Resend rejected the message (${response.status}): ${detail.slice(0, 200)}`,
  );
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
