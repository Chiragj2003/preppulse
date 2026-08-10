/**
 * Typed, lazily-resolved environment access.
 *
 * Everything is a getter so that importing this module never throws at build
 * time — `next build` runs without secrets present, and only the code paths
 * that actually need a variable will complain about it being missing.
 */

function requireEnv(name: string, hint: string): string {
  const value = process.env[name];
  if (!value || value.trim() === "") {
    throw new Error(
      `Missing required environment variable ${name}.\n${hint}\n` +
        `Add it to .env.local locally, and to Vercel → Settings → Environment Variables for deploys.`,
    );
  }
  return value;
}

function optionalEnv(name: string): string | undefined {
  const value = process.env[name];
  return value && value.trim() !== "" ? value : undefined;
}

function intEnv(name: string, fallback: number): number {
  const raw = optionalEnv(name);
  if (!raw) return fallback;
  const parsed = Number.parseInt(raw, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

export const env = {
  get databaseUrl() {
    return requireEnv("DATABASE_URL", "Get this from your Neon project's connection string (use the pooled one).");
  },
  get authSecret() {
    return requireEnv("BETTER_AUTH_SECRET", "Generate one with: openssl rand -base64 32");
  },
  get groqApiKey() {
    return requireEnv("GROQ_API_KEY", "Create a free key at https://console.groq.com → API Keys.");
  },
  get geminiApiKey() {
    return requireEnv("GEMINI_API_KEY", "Create a free key at https://aistudio.google.com → Get API Key.");
  },

  get google() {
    const clientId = optionalEnv("GOOGLE_CLIENT_ID");
    const clientSecret = optionalEnv("GOOGLE_CLIENT_SECRET");
    return clientId && clientSecret ? { clientId, clientSecret } : undefined;
  },
  get resendApiKey() {
    return optionalEnv("RESEND_API_KEY");
  },
  get emailFrom() {
    return optionalEnv("EMAIL_FROM") ?? "PrepPulse <onboarding@resend.dev>";
  },

  /** Public origin, used for auth callbacks and magic-link URLs. */
  get appUrl() {
    const explicit = optionalEnv("BETTER_AUTH_URL") ?? optionalEnv("NEXT_PUBLIC_APP_URL");
    if (explicit) return explicit.replace(/\/$/, "");
    // Vercel injects this on every deployment, including previews.
    const vercel = optionalEnv("VERCEL_PROJECT_PRODUCTION_URL") ?? optionalEnv("VERCEL_URL");
    if (vercel) return `https://${vercel}`;
    return "http://localhost:3000";
  },

  get rateLimit() {
    return {
      perMinute: intEnv("RATE_LIMIT_PER_MINUTE", 6),
      perDay: intEnv("RATE_LIMIT_PER_DAY", 60),
    };
  },

  get isProduction() {
    return process.env.NODE_ENV === "production";
  },

  /** Feature availability, used to render honest empty/disabled states in the UI. */
  get has() {
    return {
      database: Boolean(optionalEnv("DATABASE_URL")),
      groq: Boolean(optionalEnv("GROQ_API_KEY")),
      gemini: Boolean(optionalEnv("GEMINI_API_KEY")),
      google: Boolean(optionalEnv("GOOGLE_CLIENT_ID") && optionalEnv("GOOGLE_CLIENT_SECRET")),
      email: Boolean(optionalEnv("RESEND_API_KEY")),
    };
  },
};
