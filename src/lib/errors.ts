/**
 * One error type for everything the user might see.
 *
 * Rule for the whole app: a raw provider/database error never reaches the UI.
 * Route handlers catch, translate through here, and return `{ error: { code,
 * message } }` so the client always has something human to render.
 */
export type AppErrorCode =
  | "unauthorized"
  | "not_found"
  | "invalid_input"
  | "rate_limited"
  | "provider_unavailable"
  | "provider_timeout"
  | "quota_exhausted"
  | "not_configured"
  | "internal";

export class AppError extends Error {
  readonly code: AppErrorCode;
  readonly status: number;
  readonly retryAfterSeconds?: number;

  constructor(
    code: AppErrorCode,
    message: string,
    options: { status?: number; retryAfterSeconds?: number; cause?: unknown } = {},
  ) {
    super(message, { cause: options.cause });
    this.name = "AppError";
    this.code = code;
    this.status = options.status ?? defaultStatus(code);
    this.retryAfterSeconds = options.retryAfterSeconds;
  }
}

function defaultStatus(code: AppErrorCode): number {
  switch (code) {
    case "unauthorized":
      return 401;
    case "not_found":
      return 404;
    case "invalid_input":
      return 422;
    case "rate_limited":
      return 429;
    case "quota_exhausted":
      return 429;
    case "provider_timeout":
      return 504;
    case "provider_unavailable":
      return 503;
    case "not_configured":
      return 503;
    default:
      return 500;
  }
}

/**
 * Translate anything thrown by a provider SDK into an AppError with copy that
 * is safe and useful to show a user.
 */
export function toAppError(error: unknown, context: string): AppError {
  if (error instanceof AppError) return error;

  const status = readStatus(error);
  const raw = error instanceof Error ? error.message : String(error);

  if (status === 429) {
    return new AppError(
      "quota_exhausted",
      "The AI service is at its free-tier limit right now. Your answer is saved — try scoring it again in a minute.",
      { retryAfterSeconds: 60, cause: error },
    );
  }

  if (status === 401 || status === 403) {
    return new AppError(
      "not_configured",
      "The AI service rejected our credentials. Check that the API key is set correctly.",
      { cause: error },
    );
  }

  if (status !== undefined && status >= 500) {
    return new AppError(
      "provider_unavailable",
      "The AI service is having a moment. Your answer is saved — try again shortly.",
      { retryAfterSeconds: 15, cause: error },
    );
  }

  if (/timeout|timed out|aborted|ETIMEDOUT/i.test(raw)) {
    return new AppError(
      "provider_timeout",
      "Scoring took too long to come back. Your answer is saved — give it another go.",
      { retryAfterSeconds: 10, cause: error },
    );
  }

  if (/fetch failed|ENOTFOUND|ECONNREFUSED|network/i.test(raw)) {
    return new AppError(
      "provider_unavailable",
      "We couldn't reach the AI service. Check your connection and try again.",
      { retryAfterSeconds: 10, cause: error },
    );
  }

  if (/Missing required environment variable/i.test(raw)) {
    return new AppError("not_configured", raw, { cause: error });
  }

  console.error(`[${context}]`, error);
  return new AppError("internal", "Something went wrong on our side. Please try again.", {
    cause: error,
  });
}

function readStatus(error: unknown): number | undefined {
  if (typeof error !== "object" || error === null) return undefined;
  const candidate = error as { status?: unknown; statusCode?: unknown; response?: { status?: unknown } };
  for (const value of [candidate.status, candidate.statusCode, candidate.response?.status]) {
    if (typeof value === "number") return value;
  }
  return undefined;
}

/** Shape returned by every API route on failure. */
export interface ApiErrorBody {
  error: { code: AppErrorCode; message: string; retryAfterSeconds?: number };
}

export function errorResponse(error: unknown, context: string): Response {
  const appError = toAppError(error, context);
  const body: ApiErrorBody = {
    error: {
      code: appError.code,
      message: appError.message,
      ...(appError.retryAfterSeconds ? { retryAfterSeconds: appError.retryAfterSeconds } : {}),
    },
  };
  const headers = new Headers({ "Content-Type": "application/json" });
  if (appError.retryAfterSeconds) headers.set("Retry-After", String(appError.retryAfterSeconds));
  return new Response(JSON.stringify(body), { status: appError.status, headers });
}
