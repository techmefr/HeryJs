-- Row-level security for the tables the tenant-scoped Prisma client governs.
-- The application already filters every query by tenant; this is the second
-- line, enforced by Postgres itself for any role that does not own the table
-- with BYPASSRLS. current_setting('app.tenant_id', true) is NULL when unset,
-- and "tenantId" = NULL is never true, so an unset session variable hides
-- every row rather than exposing them: the policy fails closed.

ALTER TABLE "TwoFactorEnrolment" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "TwoFactorEnrolment" FORCE ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation ON "TwoFactorEnrolment"
  USING ("tenantId" = current_setting('app.tenant_id', true))
  WITH CHECK ("tenantId" = current_setting('app.tenant_id', true));

ALTER TABLE "TwoFactorRecoveryCode" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "TwoFactorRecoveryCode" FORCE ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation ON "TwoFactorRecoveryCode"
  USING ("tenantId" = current_setting('app.tenant_id', true))
  WITH CHECK ("tenantId" = current_setting('app.tenant_id', true));

ALTER TABLE "TwoFactorRoleRequirement" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "TwoFactorRoleRequirement" FORCE ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation ON "TwoFactorRoleRequirement"
  USING ("tenantId" = current_setting('app.tenant_id', true))
  WITH CHECK ("tenantId" = current_setting('app.tenant_id', true));

ALTER TABLE "TwoFactorVerifiedSession" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "TwoFactorVerifiedSession" FORCE ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation ON "TwoFactorVerifiedSession"
  USING ("tenantId" = current_setting('app.tenant_id', true))
  WITH CHECK ("tenantId" = current_setting('app.tenant_id', true));
