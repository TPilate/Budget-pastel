ALTER TYPE "public"."closure_destination" ADD VALUE 'account';--> statement-breakpoint
ALTER TABLE "closure_envelope_decisions" ADD COLUMN "destination_account_id" uuid;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "closure_envelope_decisions" ADD CONSTRAINT "closure_envelope_decisions_destination_account_id_accounts_id_fk" FOREIGN KEY ("destination_account_id") REFERENCES "public"."accounts"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
