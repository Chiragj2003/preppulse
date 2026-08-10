CREATE TYPE "public"."input_mode" AS ENUM('speech', 'typed');--> statement-breakpoint
ALTER TABLE "evaluations" ADD COLUMN "input_mode" "input_mode" DEFAULT 'speech' NOT NULL;