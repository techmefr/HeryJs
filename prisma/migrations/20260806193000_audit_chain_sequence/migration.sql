-- The chain is ordered by an explicit sequence rather than by a millisecond
-- timestamp two entries can share.
CREATE SEQUENCE "AuditLog_sequence_seq";
ALTER TABLE "AuditLog" ADD COLUMN "sequence" INTEGER;

-- Rows written before this column existed have to be numbered in the only order
-- they ever recorded, timestamp first with the id as a stable tie-breaker.
-- Numbering them in physical order instead would hand the verifier a chain in an
-- order that never happened, and hand the next writer the wrong tail.
WITH ordered AS (
  SELECT "id", row_number() OVER (ORDER BY "createdAt", "id") AS position
  FROM "AuditLog"
)
UPDATE "AuditLog"
SET "sequence" = ordered.position
FROM ordered
WHERE "AuditLog"."id" = ordered."id";

SELECT setval(
  '"AuditLog_sequence_seq"',
  COALESCE((SELECT max("sequence") FROM "AuditLog"), 0) + 1,
  false
);

ALTER TABLE "AuditLog" ALTER COLUMN "sequence" SET NOT NULL;
ALTER TABLE "AuditLog" ALTER COLUMN "sequence" SET DEFAULT nextval('"AuditLog_sequence_seq"');
ALTER SEQUENCE "AuditLog_sequence_seq" OWNED BY "AuditLog"."sequence";

-- The genesis entry carries an empty predecessor rather than a null one, so the
-- unique constraint below caps a tenant at one genesis entry instead of allowing
-- any number of parallel chains: Postgres treats each NULL as distinct.
UPDATE "AuditLog" SET "previousHash" = '' WHERE "previousHash" IS NULL;
ALTER TABLE "AuditLog" ALTER COLUMN "previousHash" SET NOT NULL;

CREATE UNIQUE INDEX "AuditLog_sequence_key" ON "AuditLog"("sequence");

DROP INDEX "AuditLog_tenantId_idx";
CREATE INDEX "AuditLog_tenantId_sequence_idx" ON "AuditLog"("tenantId", "sequence");
