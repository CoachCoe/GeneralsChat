-- Deadline provenance on an obligation.
--
-- The deadline on a ComplianceAction is produced by a classification call that
-- was never shown a policy, so it is the model's recall of state law rather
-- than something a retrieved policy states -- while the UI told the
-- administrator it came from the policy. The row could not represent the
-- difference, which is why this is a schema change and not a UI fix. (OQ-5)
--
-- Nullable and defaulted so existing rows are valid: every obligation created
-- before this migration was produced without policy context, and 'model' is
-- the truthful description of all of them.

ALTER TABLE "public"."ComplianceAction" ADD COLUMN "deadlineSource" TEXT NOT NULL DEFAULT 'model';
ALTER TABLE "public"."ComplianceAction" ADD COLUMN "citation" TEXT;
ALTER TABLE "public"."ComplianceAction" ADD COLUMN "policyId" TEXT;

-- SetNull: deleting a policy must not delete obligations an administrator is
-- still accountable for. They lose the citation and fall back to unverified.
ALTER TABLE "public"."ComplianceAction"
  ADD CONSTRAINT "ComplianceAction_policyId_fkey"
  FOREIGN KEY ("policyId") REFERENCES "public"."Policy"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

CREATE INDEX "ComplianceAction_policyId_idx" ON "public"."ComplianceAction"("policyId");
