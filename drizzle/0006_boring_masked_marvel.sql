CREATE TYPE "public"."reading_kind" AS ENUM('tongue_twister', 'passage');--> statement-breakpoint
ALTER TYPE "public"."practice_mode" ADD VALUE 'reading';--> statement-breakpoint
CREATE TABLE "reading_attempts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"session_id" uuid NOT NULL,
	"piece_id" uuid NOT NULL,
	"attempt" integer DEFAULT 1 NOT NULL,
	"transcript" text NOT NULL,
	"overall_score" integer NOT NULL,
	"accuracy" integer NOT NULL,
	"pace_score" integer NOT NULL,
	"completion" integer NOT NULL,
	"words_per_minute" integer NOT NULL,
	"stumbles" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"duration_seconds" integer NOT NULL,
	"verdict" text,
	"pattern" text,
	"drill" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "reading_pieces" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"kind" "reading_kind" DEFAULT 'passage' NOT NULL,
	"difficulty" "difficulty" DEFAULT 'medium' NOT NULL,
	"title" text NOT NULL,
	"body" text NOT NULL,
	"focus" text,
	"pace_min" integer DEFAULT 140 NOT NULL,
	"pace_max" integer DEFAULT 170 NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "reading_attempts" ADD CONSTRAINT "reading_attempts_session_id_practice_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."practice_sessions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reading_attempts" ADD CONSTRAINT "reading_attempts_piece_id_reading_pieces_id_fk" FOREIGN KEY ("piece_id") REFERENCES "public"."reading_pieces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "reading_attempts_slot_unique" ON "reading_attempts" USING btree ("session_id","attempt");--> statement-breakpoint
CREATE INDEX "reading_attempts_session_idx" ON "reading_attempts" USING btree ("session_id");--> statement-breakpoint
CREATE UNIQUE INDEX "reading_pieces_title_unique" ON "reading_pieces" USING btree ("title");--> statement-breakpoint
CREATE INDEX "reading_pieces_kind_idx" ON "reading_pieces" USING btree ("kind");