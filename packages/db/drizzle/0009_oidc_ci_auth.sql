ALTER TABLE "updates" ADD COLUMN "initiated_by" text;--> statement-breakpoint
ALTER TABLE "updates" ADD COLUMN "initiated_by_type" text;--> statement-breakpoint
ALTER TABLE "updates" ADD COLUMN "initiated_by_display" text;--> statement-breakpoint
ALTER TABLE "updates" ADD COLUMN "initiated_by_meta" jsonb;
