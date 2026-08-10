import type { Difficulty } from "@/lib/types";

/**
 * Seed topics for the Daily Roll.
 *
 * The brief was explicit: genuinely wide-ranging, not career-adjacent. A good
 * extempore prompt is one you have an opinion about within five seconds but
 * can't recite an answer to - which rules out both trivia and "tell me about
 * yourself". Mix of philosophy, science, history, culture and daily dilemmas.
 */
export interface SeedTopic {
  category: string;
  difficulty: Difficulty;
  promptText: string;
}

export const SEED_TOPICS: SeedTopic[] = [
  // --- Everyday dilemmas -----------------------------------------------------
  { category: "Everyday", difficulty: "easy", promptText: "Is procrastination ever useful?" },
  { category: "Everyday", difficulty: "easy", promptText: "Would you rather have more time or more money?" },
  { category: "Everyday", difficulty: "easy", promptText: "Is being busy the same as being productive?" },
  { category: "Everyday", difficulty: "easy", promptText: "The best advice you've ever ignored." },
  { category: "Everyday", difficulty: "medium", promptText: "Should you finish a book you're not enjoying?" },
  { category: "Everyday", difficulty: "easy", promptText: "Is small talk a waste of time?" },
  { category: "Everyday", difficulty: "medium", promptText: "Do we own too many things we never use?" },

  // --- Philosophy & psychology ----------------------------------------------
  { category: "Philosophy", difficulty: "medium", promptText: "Is nostalgia healthy?" },
  { category: "Philosophy", difficulty: "hard", promptText: "Can a person be truly selfless?" },
  { category: "Philosophy", difficulty: "medium", promptText: "Does having more choices make us happier?" },
  { category: "Philosophy", difficulty: "hard", promptText: "If you could erase one memory, should you?" },
  { category: "Philosophy", difficulty: "medium", promptText: "Is it better to be respected or liked?" },
  { category: "Philosophy", difficulty: "hard", promptText: "Does luck deserve more credit than talent?" },
  { category: "Psychology", difficulty: "medium", promptText: "Why do we enjoy being scared?" },
  { category: "Psychology", difficulty: "medium", promptText: "Is boredom necessary for creativity?" },

  // --- Science ---------------------------------------------------------------
  { category: "Science", difficulty: "hard", promptText: "Explain black holes simply." },
  { category: "Science", difficulty: "medium", promptText: "Why is the sky blue? Explain it to a ten-year-old." },
  { category: "Science", difficulty: "hard", promptText: "Should we spend money on space when Earth has problems?" },
  { category: "Science", difficulty: "medium", promptText: "What would you change about the human body?" },
  { category: "Science", difficulty: "hard", promptText: "Is there a limit to what science can explain?" },
  { category: "Science", difficulty: "medium", promptText: "Why do we sleep? Make the case for it." },

  // --- History ---------------------------------------------------------------
  { category: "History", difficulty: "medium", promptText: "How was the lightbulb invented?" },
  { category: "History", difficulty: "hard", promptText: "Was Napoleon a good leader?" },
  { category: "History", difficulty: "medium", promptText: "Which invention changed daily life the most?" },
  { category: "History", difficulty: "hard", promptText: "Do we learn anything from history, or just repeat it?" },
  { category: "History", difficulty: "medium", promptText: "Pick a decade you'd want to live through, and defend it." },

  // --- Technology ------------------------------------------------------------
  { category: "Technology", difficulty: "medium", promptText: "Has social media made us better or worse at talking?" },
  { category: "Technology", difficulty: "hard", promptText: "Should AI be allowed to make medical decisions?" },
  { category: "Technology", difficulty: "medium", promptText: "Would you give up your smartphone for a year for a large sum of money?" },
  { category: "Technology", difficulty: "hard", promptText: "Is privacy a fair price for convenience?" },
  { category: "Technology", difficulty: "medium", promptText: "Will remote work still exist in twenty years?" },
  { category: "Technology", difficulty: "hard", promptText: "Should self-driving cars choose who to protect in a crash?" },

  // --- Society & ethics ------------------------------------------------------
  { category: "Society", difficulty: "hard", promptText: "Should voting be compulsory?" },
  { category: "Society", difficulty: "medium", promptText: "Is competition good for children?" },
  { category: "Ethics", difficulty: "hard", promptText: "Is it ever right to break a promise?" },
  { category: "Ethics", difficulty: "hard", promptText: "Should billionaires exist?" },
  { category: "Society", difficulty: "medium", promptText: "Does where you grow up matter more than how hard you work?" },
  { category: "Society", difficulty: "hard", promptText: "Should exams be replaced by something else?" },
  { category: "Ethics", difficulty: "medium", promptText: "Is honesty always the kind option?" },

  // --- Culture & art ---------------------------------------------------------
  { category: "Culture", difficulty: "medium", promptText: "Why do old songs feel better than new ones?" },
  { category: "Culture", difficulty: "medium", promptText: "Does a film need a happy ending to be satisfying?" },
  { category: "Culture", difficulty: "hard", promptText: "Can art be separated from the artist?" },
  { category: "Culture", difficulty: "easy", promptText: "Describe your city to someone who has never been." },
  { category: "Culture", difficulty: "medium", promptText: "Is street food the truest food of a place?" },
  { category: "Culture", difficulty: "medium", promptText: "Should every child learn a second language?" },

  // --- Business & money ------------------------------------------------------
  { category: "Business", difficulty: "medium", promptText: "Is the customer always right?" },
  { category: "Business", difficulty: "hard", promptText: "Should a four-day work week be standard?" },
  { category: "Business", difficulty: "medium", promptText: "Sell me something on this desk in sixty seconds." },
  { category: "Business", difficulty: "hard", promptText: "Is failure genuinely a good teacher, or do we just say that?" },
  { category: "Business", difficulty: "medium", promptText: "Would you rather run a small business or lead a big team?" },
];
