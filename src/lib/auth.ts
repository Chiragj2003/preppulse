import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { nextCookies } from "better-auth/next-js";
import { magicLink } from "better-auth/plugins/magic-link";

import { db, schema } from "@/db";
import { env } from "./env";
import { magicLinkEmail, sendEmail } from "./mailer";

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

  // Passwords are deliberately not supported - Google or a magic link only.
  emailAndPassword: { enabled: false },

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
