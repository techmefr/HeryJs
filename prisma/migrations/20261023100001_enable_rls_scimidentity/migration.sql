ALTER TABLE "ScimIdentity" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "ScimIdentity" FORCE ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation ON "ScimIdentity"
  USING ("tenantId" = current_setting('app.tenant_id', true))
  WITH CHECK ("tenantId" = current_setting('app.tenant_id', true));
