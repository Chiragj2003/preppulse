import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { nextCookies } from "better-auth/next-js";
import { emailOTP } from "better-auth/plugins/email-otp";
import { magicLink } from "better-auth/plugins/magic-link";

import { db, schema } from "@/db";
import { env } from "./env";
import { magicLinkEmail, otpEmail, sendEmail } from "./mailer";

export const auth = betterAuth({
  appName: "PrepPulse",
  baseURL: env.appUrl,
  secret: env.authSecret,

  database: drizzleAdapter(db, {
    provider: "pg",
    schema,
    // Our tables are `users`, `sessions`, `accounts`, `verifications`.
    usePlural: true,
    // Neon's HTTP driver has no interactive transactions; run statements serially.
    transaction: false,
  }),

  /**
   * Better Auth rejects requests whose Origin isn't trusted (CSRF protection),
   * and by default only trusts `baseURL`. Three cases need to work:
   *   - production: its own domain, and nothing else
   *   - Vercel previews: a unique URL per deploy, which Vercel injects
   *   - local dev: whatever port next picked when 3000 was taken
   * The localhost wildcard is gated on NODE_ENV so it never ships.
   */
  trustedOrigins: [
    env.appUrl,
    ...(process.env.VERCEL_URL ? [`https://${process.env.VERCEL_URL}`] : []),
    ...(process.env.VERCEL_BRANCH_URL ? [`https://${process.env.VERCEL_BRANCH_URL}`] : []),
    ...(process.env.NODE_ENV !== "production" ? ["http://localhost:*"] : []),
  ],

  emailAndPassword: {
    enabled: true,
    minPasswordLength: 8,
    maxPasswordLength: 128,
    // Sign straight in after signing up - a separate "now log in" step buys
    // nothing when we just verified the credentials.
    autoSignIn: true,
    // ponytail: unverified emails can sign up, because email delivery isn't
    // reliable yet (see mailer.ts). Safe for now - account linking still
    // requires a locally verified email, so a squatted address can't capture
    // someone's Google identity. Flip to true once a sending domain is verified.
    requireEmailVerification: false,
    revokeSessionsOnPasswordReset: true,
  },

  // Google is only offered when it's actually configured. With these unset the
  // app still signs people in via magic link, and the sign-in page says so
  // rather than showing a button that 500s.
  socialProviders: env.google
    ? {
        google: {
          clientId: env.google.clientId,
          clientSecret: env.google.clientSecret,
        },
      }
    : {},

  session: {
    expiresIn: 60 * 60 * 24 * 30, // 30 days
    updateAge: 60 * 60 * 24, // refresh at most once a day
    cookieCache: { enabled: true, maxAge: 5 * 60 },
  },

  account: {
    accountLinking: {
      enabled: true,
      // One human = one account, whichever door they come through.
      //
      //   magic link first, then Google  -> magic link sets emailVerified:true,
      //                                     Google is trusted, so it links in.
      //   Google first, then magic link  -> magic link resolves the existing
      //                                     user by email and signs into it.
      //
      // `allowDifferentEmails` stays at its default of false, so linking only
      // ever happens on an exact email match - never across addresses.
      trustedProviders: ["google"],
    },
  },

  plugins: [
    emailOTP({
      otpLength: 6,
      expiresIn: 60 * 5, // 5 minutes
      allowedAttempts: 3,
      // Codes are short enough to brute-force from a database dump; store the
      // hash, not the code.
      storeOTP: "hashed",
      sendVerificationOTP: async ({ email, otp, type }) => {
        const message = otpEmail(otp, type);
        await sendEmail({ to: email, ...message });
      },
    }),
    magicLink({
      expiresIn: 60 * 10, // 10 minutes
      sendMagicLink: async ({ email, url }) => {
        const message = magicLinkEmail(url);
        await sendEmail({ to: email, ...message });
      },
    }),
    // Must stay last: it lets server actions set auth cookies.
    nextCookies(),
  ],
});

export type Session = typeof auth.$Infer.Session;
