import { Loader2 } from "lucide-react";

import { cn } from "@/lib/utils";

/**
 * Every state is defined here once: idle, hover, focus, pressed, loading,
 * disabled. A component that only styles idle is the single most common way
 * an interface starts feeling cheap.
 *
 * There is exactly one accent-filled variant. If two solid lavender buttons
 * appear on a screen, the accent budget has been blown and neither reads as
 * the primary action.
 */
type Variant = "primary" | "glass" | "ghost" | "critical";
type Size = "sm" | "md" | "lg";

const VARIANT: Record<Variant, string> = {
  primary: cn(
    "bg-accent text-void font-medium",
    "shadow-[var(--shadow-accent)]",
    "hover:brightness-110",
  ),
  glass: cn(
    "material m-dense text-ink",
    "hover:bg-[oklch(26%_0.01_285_/_0.8)]",
  ),
  ghost: cn("text-ink-2", "hover:bg-[oklch(100%_0_0_/_0.05)] hover:text-ink"),
  critical: cn("bg-[oklch(30%_0.09_22)] text-[var(--color-critical)]", "hover:brightness-125"),
};

const SIZE: Record<Size, string> = {
  sm: "h-9 px-4 text-[13.5px] gap-1.5 rounded-full",
  md: "h-11 px-5 text-[14.5px] gap-2 rounded-full",
  lg: "h-[52px] px-7 text-[15.5px] gap-2.5 rounded-full",
};

export function Button({
  variant = "glass",
  size = "md",
  loading = false,
  icon,
  className,
  children,
  disabled,
  ...rest
}: React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: Variant;
  size?: Size;
  loading?: boolean;
  icon?: React.ReactNode;
}) {
  return (
    <button
      className={cn(
        "pressable relative inline-flex shrink-0 items-center justify-center",
        "whitespace-nowrap select-none",
        "disabled:pointer-events-none disabled:opacity-45",
        SIZE[size],
        VARIANT[variant],
        className,
      )}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      {...rest}
    >
      {/* The label holds its position while loading — the button must not
          resize and shove neighbouring layout around mid-interaction. */}
      <span
        className={cn(
          "inline-flex items-center gap-[inherit] transition-opacity",
          loading && "opacity-0",
        )}
      >
        {icon}
        {children}
      </span>

      {loading && (
        <span className="absolute inset-0 grid place-items-center">
          <Loader2 className="size-4 animate-spin" />
        </span>
      )}
    </button>
  );
}

export function IconButton({
  label,
  size = "md",
  variant = "ghost",
  className,
  children,
  ...rest
}: React.ButtonHTMLAttributes<HTMLButtonElement> & {
  label: string;
  size?: Size;
  variant?: Variant;
}) {
  const box = { sm: "size-8", md: "size-10", lg: "size-12" }[size];

  return (
    <button
      aria-label={label}
      title={label}
      className={cn(
        "pressable grid shrink-0 place-items-center rounded-full",
        "disabled:pointer-events-none disabled:opacity-45",
        box,
        VARIANT[variant],
        className,
      )}
      {...rest}
    >
      {children}
    </button>
  );
}
