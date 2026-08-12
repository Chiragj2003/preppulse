ALTER TABLE "profiles" ADD COLUMN IF NOT EXISTS "username" text;--> statement-breakpoint
ALTER TABLE "profiles" ADD COLUMN IF NOT EXISTS "age" integer;--> statement-breakpoint
ALTER TABLE "profiles" ADD COLUMN IF NOT EXISTS "onboarding_completed" boolean DEFAULT false NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "profiles_username_unique" ON "profiles" USING btree ("username");