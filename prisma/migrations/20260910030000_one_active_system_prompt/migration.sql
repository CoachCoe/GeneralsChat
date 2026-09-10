-- Exactly one advisor profile may be active.
--
-- The chat path and the admin editor each resolved "the active profile" with
-- their own query, so with two active rows an admin could edit one while the
-- model was sent the other. They share one resolver now, but agreement by
-- convention is not the same as agreement by construction: this is what makes
-- the second row impossible rather than merely unlikely.
--
-- Prisma cannot express a partial unique index, so it is raw SQL. Any extra
-- active rows are stood down first, newest kept, or the index cannot be built.
UPDATE "SystemPrompt"
SET "isActive" = false
WHERE "isActive" = true
  AND id <> (
    SELECT id FROM "SystemPrompt"
    WHERE "isActive" = true
    ORDER BY "updatedAt" DESC, id ASC
    LIMIT 1
  );

CREATE UNIQUE INDEX "SystemPrompt_one_active"
  ON "SystemPrompt" ("isActive")
  WHERE "isActive";
