import { cn } from "@/lib/utils";
import { Button } from "./button";

/**
 * Loading, empty and error are designed states, not afterthoughts. Each one
 * is a real moment in the product and gets the same typographic treatment as
 * everything else.
 */

/**
 * A loading state that says what is happening. "Loading..." tells the user
 * nothing; "Listening" and "Reading your answer" tell them where they are.
 * The mark breathes rather than spinning — a spinner implies indeterminate
 * waiting, and we know exactly what we're doing.
 */
export function LoadingState({
  title,
  detail,
  className,
}: {
  title: string;
  detail?: string;
  className?: string;
}) {
  return (
    <div className={cn("flex flex-col items-center py-14 text-center", className)}>
      <div className="relative grid size-12 place-items-center">
        <span
          className="absolute size-3 rounded-full bg-accent"
          style={{ animation: "breathe 1.6s var(--ease-in-out) infinite" }}
        />
        <span
          className="absolute size-12 rounded-full border border-accent/25"
          style={{ animation: "breathe 1.6s var(--ease-in-out) infinite 200ms" }}
        />
      </div>
      <p className="t-heading mt-6">{title}</p>
      {detail && <p className="t-meta mt-2 max-w-xs">{detail}</p>}
    </div>
  );
}

/**
 * Empty states are an invitation, not an apology. Oversized type carries the
 * message and a single action carries the user out of the state.
 */
export function EmptyState({
  eyebrow,
  title,
  body,
  action,
  className,
}: {
  eyebrow?: string;
  title: string;
  body?: string;
  action?: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("px-6 py-20 text-center", className)}>
      {eyebrow && <p className="t-micro mb-5">{eyebrow}</p>}
      <h3 className="t-title mx-auto max-w-md text-ink-2">{title}</h3>
      {body && <p className="t-body mx-auto mt-4 max-w-sm text-ink-3">{body}</p>}
      {action && <div className="mt-8 flex justify-center">{action}</div>}
    </div>
  );
}

/**
 * Errors state what happened, what it means for the user's work, and what to
 * do next — in that order. No stack traces, no red panic, no apology theatre.
 */
export function ErrorState({
  title = "That didn't go through",
  message,
  onRetry,
  retryLabel = "Try again",
  className,
}: {
  title?: string;
  message: string;
  onRetry?: () => void;
  retryLabel?: string;
  className?: string;
}) {
  return (
    <div className={cn("flex flex-col items-center py-10 text-center", className)} role="alert">
      <span
        className="h-8 w-px"
        style={{
          background: "linear-gradient(180deg, transparent, var(--color-caution))",
        }}
      />
      <p className="t-heading mt-5 text-ink">{title}</p>
      <p className="t-body mt-2 max-w-sm text-ink-2">{message}</p>
      {onRetry && (
        <Button variant="glass" size="md" onClick={onRetry} className="mt-6">
          {retryLabel}
        </Button>
      )}
    </div>
  );
}
