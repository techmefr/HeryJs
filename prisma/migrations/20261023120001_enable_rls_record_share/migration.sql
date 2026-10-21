ALTER TABLE "RecordShare" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "RecordShare" FORCE ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation ON "RecordShare"
  USING ("tenantId" = current_setting('app.tenant_id', true))
  WITH CHECK ("tenantId" = current_setting('app.tenant_id', true));
