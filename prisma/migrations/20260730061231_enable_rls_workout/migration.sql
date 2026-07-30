-- Row-level security is opt-in: this policy exists in the schema for any
-- deployment that chooses to enforce it, but it only restricts connections
-- that are not superusers and do not own the table with BYPASSRLS granted.
-- The default dev/app role connects as the table owner, so this migration
-- alone does not change existing behavior; RLS only takes effect for a
-- role that has been explicitly restricted (see RLS_ENABLED in env.ts and
-- the tenant-rls spec for how the session variable is set per request).
ALTER TABLE "Workout" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Workout" FORCE ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation ON "Workout"
  USING ("tenantId" = current_setting('app.tenant_id', true))
  WITH CHECK ("tenantId" = current_setting('app.tenant_id', true));
