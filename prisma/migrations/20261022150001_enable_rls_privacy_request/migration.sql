ALTER TABLE "PrivacyRequest" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "PrivacyRequest" FORCE ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation ON "PrivacyRequest"
  USING ("tenantId" = current_setting('app.tenant_id', true))
  WITH CHECK ("tenantId" = current_setting('app.tenant_id', true));
