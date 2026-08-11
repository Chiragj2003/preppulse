/**
 * Seed values for the plans table.
 *
 * These are *seed* values, not the source of truth. The application reads
 * prices, limits and unlocked modes from the database at request time, so a
 * price change is a row update rather than a deploy. Nothing in the UI ever
 * hardcodes a number that appears on the pricing page.
 */
export interface SeedPlan {
  slug: string;
  name: string;
  tagline: string;
  /** Minor units. Money is never a float. */
  priceMonthly: number;
  currency: string;
  features: string[];
  dailySessionLimit: number | null;
  unlockedModes: string[];
  sortOrder: number;
}

export const SEED_PLANS: SeedPlan[] = [
  {
    slug: "free",
    name: "Free",
    tagline: "The daily habit, in full.",
    priceMonthly: 0,
    currency: "INR",
    features: [
      "Today's topic, every day",
      "Three sessions a day",
      "Full scoring and coaching",
      "Filler words and pace",
      "Streaks and progress",
    ],
    dailySessionLimit: 3,
    unlockedModes: [],
    sortOrder: 0,
  },
  {
    slug: "pro",
    name: "Pro",
    tagline: "Every room, no limits.",
    priceMonthly: 49900,
    currency: "INR",
    features: [
      "Everything in Free",
      "Unlimited sessions",
      "Mock interviews from your resume",
      "Group discussion and debate",
      "Conversation practice",
      "Shareable result cards",
    ],
    dailySessionLimit: null,
    unlockedModes: ["interview", "group_discussion", "debate", "conversation"],
    sortOrder: 1,
  },
  {
    slug: "premium",
    name: "Premium",
    tagline: "For the month before it matters.",
    priceMonthly: 99900,
    currency: "INR",
    features: [
      "Everything in Pro",
      "Real-world scenario rooms",
      "Longer interview rounds",
      "Priority scoring queue",
      "Weekly progress digest",
    ],
    dailySessionLimit: null,
    unlockedModes: ["interview", "group_discussion", "debate", "conversation", "scenario"],
    sortOrder: 2,
  },
];
