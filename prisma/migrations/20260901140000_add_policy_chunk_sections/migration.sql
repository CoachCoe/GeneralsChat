-- Section-level citation.
--
-- Citing a whole policy tells an administrator where to start reading; citing
-- the provision tells them what to rely on. School board policies carry
-- lettered sections whose headers frequently name the statute they implement,
-- so a chunk can be attributed to "JICK §F — Investigative Procedures
-- (RSA 193-F:4, II(k))" rather than just "JICK".
--
-- Nullable throughout: a document with no parseable structure keeps being cited
-- at policy level, which is the honest fallback.

ALTER TABLE "public"."PolicyChunk" ADD COLUMN "sectionLabel" TEXT;
ALTER TABLE "public"."PolicyChunk" ADD COLUMN "sectionTitle" TEXT;
ALTER TABLE "public"."PolicyChunk" ADD COLUMN "sectionStatute" TEXT;
