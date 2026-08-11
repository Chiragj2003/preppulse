import { cn } from "@/lib/utils";

/**
 * The five material levels of the system. Choosing a material is choosing what
 * a thing physically *is*, not how it's decorated:
 *
 *   clear   floating chrome — navigation, toolbars, pills
 *   dense   important interactive surfaces you can act on
 *   frost   modals and sheets, which push their context away
 *   liquid  the main application surface that holds content
 *   solid   maximum readability, for critical information
 *
 * Glass is rare on purpose. It reads as expensive because it sits against
 * solids, not because it's everywhere.
 */
export type Material = "clear" | "dense" | "frost" | "liquid" | "solid";

const MATERIAL: Record<Material, string> = {
  clear: "m-clear",
  dense: "m-dense",
  frost: "m-frost",
  liquid: "m-liquid",
  solid: "m-solid",
};

const RADIUS = {
  xs: "rounded-[var(--radius-xs)]",
  sm: "rounded-[var(--radius-sm)]",
  md: "rounded-[var(--radius-md)]",
  lg: "rounded-[var(--radius-lg)]",
  xl: "rounded-[var(--radius-xl)]",
  full: "rounded-full",
} as const;

export function Surface({
  material = "liquid",
  radius = "md",
  refract = false,
  lift = false,
  className,
  children,
  ...rest
}: React.HTMLAttributes<HTMLDivElement> & {
  material?: Material;
  radius?: keyof typeof RADIUS;
  /** One faint chromatic wash. At most one per screen. */
  refract?: boolean;
  /** Rises toward the viewer on hover instead of changing colour. */
  lift?: boolean;
}) {
  return (
    <div
      className={cn(
        "material",
        MATERIAL[material],
        RADIUS[radius],
        refract && "m-refract",
        lift && "liftable",
        className,
      )}
      {...rest}
    >
      {children}
    </div>
  );
}
