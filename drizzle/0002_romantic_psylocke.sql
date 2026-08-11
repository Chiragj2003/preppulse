CREATE TYPE "public"."interviewer_persona" AS ENUM('friendly', 'professional', 'challenging', 'stress');--> statement-breakpoint
CREATE TYPE "public"."question_kind" AS ENUM('behavioural', 'technical', 'situational', 'motivational');--> statement-breakpoint
CREATE TABLE "discussion_turns" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"session_id" uuid NOT NULL,
	"position" integer NOT NULL,
	"speaker" text,
	"role" text NOT NULL,
	"content" text NOT NULL,
	"stage" text,
	"is_rebuttal" boolean DEFAULT false NOT NULL,
	"word_count" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "interview_answers" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"question_id" uuid NOT NULL,
	"session_id" uuid NOT NULL,
	"attempt" integer DEFAULT 1 NOT NULL,
	"transcript" text NOT NULL,
	"input_mode" "input_mode" DEFAULT 'speech' NOT NULL,
	"scores" jsonb NOT NULL,
	"overall_score" integer NOT NULL,
	"feedback" text NOT NULL,
	"strengths" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"improvements" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"ideal_answer" text,
	"duration_seconds" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "interview_questions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"session_id" uuid NOT NULL,
	"position" integer NOT NULL,
	"question" text NOT NULL,
	"kind" "question_kind" DEFAULT 'behavioural' NOT NULL,
	"rationale" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "practice_sessions" ADD COLUMN "config" jsonb;--> statement-breakpoint
ALTER TABLE "discussion_turns" ADD CONSTRAINT "discussion_turns_session_id_practice_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."practice_sessions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "interview_answers" ADD CONSTRAINT "interview_answers_question_id_interview_questions_id_fk" FOREIGN KEY ("question_id") REFERENCES "public"."interview_questions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "interview_answers" ADD CONSTRAINT "interview_answers_session_id_practice_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."practice_sessions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "interview_questions" ADD CONSTRAINT "interview_questions_session_id_practice_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."practice_sessions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "discussion_turns_slot_unique" ON "discussion_turns" USING btree ("session_id","position");--> statement-breakpoint
CREATE INDEX "interview_answers_session_idx" ON "interview_answers" USING btree ("session_id");--> statement-breakpoint
CREATE UNIQUE INDEX "interview_answers_attempt_unique" ON "interview_answers" USING btree ("question_id","attempt");--> statement-breakpoint
CREATE UNIQUE INDEX "interview_questions_slot_unique" ON "interview_questions" USING btree ("session_id","position");