ALTER TABLE "QuotaOverride" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "QuotaOverride" FORCE ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation ON "QuotaOverride"
  USING ("tenantId" = current_setting('app.tenant_id', true))
  WITH CHECK ("tenantId" = current_setting('app.tenant_id', true));

ALTER TABLE "QuotaUsage" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "QuotaUsage" FORCE ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation ON "QuotaUsage"
  USING ("tenantId" = current_setting('app.tenant_id', true))
  WITH CHECK ("tenantId" = current_setting('app.tenant_id', true));

