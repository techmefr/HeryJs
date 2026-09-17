-- Postgres treats every NULL as distinct, so @@unique([key, tenantId]) never
-- constrained the global flags: two concurrent set() calls with no tenant both
-- passed the findFirst and both inserted, after which isEnabled() returned an
-- arbitrary one of the duplicates and the flag's value became nondeterministic.
--
-- A partial index is the constraint that actually holds for those rows. Prisma
-- cannot express it in schema.prisma, which is why this migration is written by
-- hand rather than generated.
CREATE UNIQUE INDEX IF NOT EXISTS "FeatureFlag_key_global_key"
  ON "FeatureFlag" ("key")
  WHERE "tenantId" IS NULL;
