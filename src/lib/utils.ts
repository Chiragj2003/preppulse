import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/**
 * A name we can actually greet someone by.
 *
 * Magic-link signups have no name at all - Better Auth stores an empty string,
 * not null, so `??` slides straight past it. Fall back to the email's local
 * part, which is usually closer to a real name than "there".
 */
export function displayName(user: { name?: string | null; email?: string | null }) {
  const given = user.name?.trim();
  if (given) return given;

  const local = user.email?.split("@")[0]?.trim();
  if (!local) return "there";

  // "chirag.j2003" -> "Chirag"
  const first = local.split(/[._-]/)[0].replace(/\d+$/, "");
  return first ? first.charAt(0).toUpperCase() + first.slice(1) : "there";
}

export function formatDuration(seconds: number) {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}
