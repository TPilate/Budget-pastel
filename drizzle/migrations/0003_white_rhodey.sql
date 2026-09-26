CREATE TYPE "public"."account_kind" AS ENUM('courant', 'epargne');--> statement-breakpoint
ALTER TABLE "accounts" ADD COLUMN "kind" "account_kind" DEFAULT 'courant' NOT NULL;--> statement-breakpoint
ALTER TABLE "wishlist_items" ADD COLUMN "envelope_id" uuid;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "wishlist_items" ADD CONSTRAINT "wishlist_items_envelope_id_envelopes_id_fk" FOREIGN KEY ("envelope_id") REFERENCES "public"."envelopes"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
