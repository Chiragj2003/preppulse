/**
 * The PrepPulse mark.
 *
 * A speech-bubble silhouette whose lower edge is a pulse trace: the two things
 * the product is about — talking, and a reading on how it went — as one shape
 * rather than a bubble with an icon dropped inside it.
 *
 * Drawn, not imported. It stays crisp at any size, inherits `currentColor` so
 * it works on any surface, and costs no network request. The same geometry is
 * reused for the favicon and the social card, so the mark is identical
 * everywhere instead of three files drifting apart.
 */
export function LogoMark({
  className = "size-7",
  title,
}: {
  className?: string;
  title?: string;
}) {
  return (
    <svg
      viewBox="0 0 32 32"
      className={className}
      fill="none"
      role={title ? "img" : "presentation"}
      aria-hidden={title ? undefined : true}
      aria-label={title}
    >
      {/* The bubble. Tail at the lower-left, so the pulse reads left-to-right
          out of the point of speech. */}
      <path
        d="M6.6 4.5h18.8a2.1 2.1 0 0 1 2.1 2.1v13.2a2.1 2.1 0 0 1-2.1 2.1H12.9l-5.4 5.1a.9.9 0 0 1-1.5-.65V21.9H6.6a2.1 2.1 0 0 1-2.1-2.1V6.6a2.1 2.1 0 0 1 2.1-2.1Z"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinejoin="round"
      />
      {/* The trace. Flat, spike, overshoot, settle — the shape of a scored
          answer, and the reason the logo is not just a bubble. */}
      <path
        d="M8.6 13.2h3.1l2-5.1 3.1 10.1 2.2-6 1.5 2.6h2.9"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

/** Mark plus wordmark, for the header and any place needing the full lockup. */
export function Logo({ className = "" }: { className?: string }) {
  return (
    <span className={`inline-flex items-center gap-2.5 ${className}`}>
      <span className="relative grid size-7 shrink-0 place-items-center">
        <span className="absolute inset-0 rounded-[9px] bg-accent/12" aria-hidden />
        <LogoMark className="relative size-[18px] text-accent" />
      </span>
      <span className="font-display text-[15.5px] font-medium tracking-[-0.02em]">PrepPulse</span>
    </span>
  );
}
