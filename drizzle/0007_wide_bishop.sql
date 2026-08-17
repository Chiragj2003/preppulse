CREATE TYPE "public"."answer_status" AS ENUM('pending', 'scored', 'failed');--> statement-breakpoint
ALTER TABLE "interview_answers" ALTER COLUMN "scores" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "interview_answers" ALTER COLUMN "overall_score" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "interview_answers" ALTER COLUMN "feedback" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "interview_answers" ADD COLUMN "status" "answer_status" DEFAULT 'pending' NOT NULL;--> statement-breakpoint
ALTER TABLE "interview_answers" ADD COLUMN "failure_reason" text;--> statement-breakpoint
ALTER TABLE "practice_sessions" ADD COLUMN "presence_summary" jsonb;--> statement-breakpoint
-- Backfill: every row written before this migration was scored synchronously
-- at submit time, so if it already has a score it is 'scored', full stop. The
-- new column's default of 'pending' is correct only for rows inserted from
-- here on; applying it retroactively would relabel a whole history of
-- already-graded interviews as still waiting to be graded.
UPDATE "interview_answers" SET "status" = 'scored' WHERE "overall_score" IS NOT NULL;