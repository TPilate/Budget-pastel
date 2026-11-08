CREATE TYPE "public"."transfer_endpoint_kind" AS ENUM('envelope', 'budget', 'account');--> statement-breakpoint
ALTER TABLE "transfers" ALTER COLUMN "from_envelope_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "transfers" ALTER COLUMN "to_envelope_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "transfers" ADD COLUMN "from_kind" "transfer_endpoint_kind" DEFAULT 'envelope' NOT NULL;--> statement-breakpoint
ALTER TABLE "transfers" ADD COLUMN "from_account_id" uuid;--> statement-breakpoint
ALTER TABLE "transfers" ADD COLUMN "to_kind" "transfer_endpoint_kind" DEFAULT 'envelope' NOT NULL;--> statement-breakpoint
ALTER TABLE "transfers" ADD COLUMN "to_account_id" uuid;--> statement-breakpoint
ALTER TABLE "transfers" ADD COLUMN "source" "savings_entry_source" DEFAULT 'manual' NOT NULL;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "transfers" ADD CONSTRAINT "transfers_from_account_id_accounts_id_fk" FOREIGN KEY ("from_account_id") REFERENCES "public"."accounts"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "transfers" ADD CONSTRAINT "transfers_to_account_id_accounts_id_fk" FOREIGN KEY ("to_account_id") REFERENCES "public"."accounts"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
ALTER TABLE "transfers" ADD CONSTRAINT "transfers_from_endpoint" CHECK ((from_kind='envelope' AND from_envelope_id IS NOT NULL AND from_account_id IS NULL) OR (from_kind='account' AND from_account_id IS NOT NULL AND from_envelope_id IS NULL) OR (from_kind='budget' AND from_envelope_id IS NULL AND from_account_id IS NULL));--> statement-breakpoint
ALTER TABLE "transfers" ADD CONSTRAINT "transfers_to_endpoint" CHECK ((to_kind='envelope' AND to_envelope_id IS NOT NULL AND to_account_id IS NULL) OR (to_kind='account' AND to_account_id IS NOT NULL AND to_envelope_id IS NULL) OR (to_kind='budget' AND to_envelope_id IS NULL AND to_account_id IS NULL));--> statement-breakpoint
ALTER TABLE "transfers" ADD CONSTRAINT "transfers_distinct_endpoints" CHECK (NOT (from_kind='budget' AND to_kind='budget') AND (from_envelope_id IS DISTINCT FROM to_envelope_id OR from_envelope_id IS NULL) AND (from_account_id IS DISTINCT FROM to_account_id OR from_account_id IS NULL));
