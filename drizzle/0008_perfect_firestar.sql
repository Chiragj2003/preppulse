ALTER TYPE "public"."ai_provider" ADD VALUE 'openrouter';--> statement-breakpoint
ALTER TABLE "interview_questions" ADD COLUMN "difficulty" "difficulty" DEFAULT 'medium' NOT NULL;