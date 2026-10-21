ALTER TABLE "Snippet" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Snippet" FORCE ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation ON "Snippet"
  USING ("tenantId" = current_setting('app.tenant_id', true))
  WITH CHECK ("tenantId" = current_setting('app.tenant_id', true));
