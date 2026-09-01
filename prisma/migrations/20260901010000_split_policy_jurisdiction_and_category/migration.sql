-- Policy.policyType conflated two orthogonal facets.
--
-- The schema comment said "federal, state, district, school" (provenance) while
-- the upload documentation defined twenty subject-matter categories, and the
-- ingestion scripts wrote values from BOTH vocabularies into the same column.
-- Policies genuinely come from all four levels of government and school
-- administration, and a single incident normally implicates several at once --
-- a federal Title IX rule, a state reporting statute, and the district policy
-- that implements them. Those are two independent dimensions, so they are now
-- two columns.

ALTER TABLE "public"."Policy" ADD COLUMN "jurisdiction" TEXT NOT NULL DEFAULT 'district';
ALTER TABLE "public"."Policy" ADD COLUMN "category" TEXT NOT NULL DEFAULT 'other';

-- Backfill: a provenance value moves to jurisdiction and leaves category
-- unknown; anything else was a subject-matter value, so it moves to category
-- and the jurisdiction defaults to 'district' (the level nearly all locally
-- uploaded policies came from).
UPDATE "public"."Policy"
   SET "jurisdiction" = "policyType"
 WHERE "policyType" IN ('federal', 'state', 'district', 'school');

UPDATE "public"."Policy"
   SET "category" = "policyType"
 WHERE "policyType" NOT IN ('federal', 'state', 'district', 'school');

ALTER TABLE "public"."Policy" DROP COLUMN "policyType";

DROP INDEX IF EXISTS "public"."Policy_policyType_idx";
CREATE INDEX "Policy_jurisdiction_idx" ON "public"."Policy"("jurisdiction");
CREATE INDEX "Policy_category_idx" ON "public"."Policy"("category");
CREATE INDEX "Policy_category_isActive_idx" ON "public"."Policy"("category", "isActive");
