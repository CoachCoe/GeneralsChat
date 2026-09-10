-- Whether a loaded document is read ('policy') or filled out and filed ('form').
--
-- Existing rows default to 'policy'. Nothing is backfilled by title: guessing
-- which documents are forms from their names is the bug this column replaces,
-- and a wrongly promoted document would print under "Mandatory report".
ALTER TABLE "Policy" ADD COLUMN "documentKind" TEXT NOT NULL DEFAULT 'policy';

CREATE INDEX "Policy_documentKind_category_isActive_idx"
  ON "Policy" ("documentKind", "category", "isActive");
