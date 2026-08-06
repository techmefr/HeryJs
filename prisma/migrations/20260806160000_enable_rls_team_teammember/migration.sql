-- Row-level security for the tables the tenant-scoped Prisma client governs.
-- The application already filters every query by tenant; this is the second
-- line, enforced by Postgres itself for any role that does not own the table
-- with BYPASSRLS. current_setting('app.tenant_id', true) is NULL when unset,
-- and "tenantId" = NULL is never true, so an unset session variable hides
-- every row rather than exposing them: the policy fails closed.

ALTER TABLE "Team" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Team" FORCE ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation ON "Team"
  USING ("tenantId" = current_setting('app.tenant_id', true))
  WITH CHECK ("tenantId" = current_setting('app.tenant_id', true));

ALTER TABLE "TeamMember" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "TeamMember" FORCE ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation ON "TeamMember"
  USING ("tenantId" = current_setting('app.tenant_id', true))
  WITH CHECK ("tenantId" = current_setting('app.tenant_id', true));
