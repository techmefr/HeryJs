-- Row-level security for the tables the tenant-scoped Prisma client governs.
-- The application already filters every query by tenant; this is the second
-- line, enforced by Postgres itself for any role that does not own the table
-- with BYPASSRLS. current_setting('app.tenant_id', true) is NULL when unset,
-- and "tenantId" = NULL is never true, so an unset session variable hides
-- every row rather than exposing them: the policy fails closed.

ALTER TABLE "AppNotification" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "AppNotification" FORCE ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation ON "AppNotification"
  USING ("tenantId" = current_setting('app.tenant_id', true))
  WITH CHECK ("tenantId" = current_setting('app.tenant_id', true));

ALTER TABLE "BlogPostTag" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "BlogPostTag" FORCE ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation ON "BlogPostTag"
  USING ("tenantId" = current_setting('app.tenant_id', true))
  WITH CHECK ("tenantId" = current_setting('app.tenant_id', true));

ALTER TABLE "Tag" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Tag" FORCE ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation ON "Tag"
  USING ("tenantId" = current_setting('app.tenant_id', true))
  WITH CHECK ("tenantId" = current_setting('app.tenant_id', true));

ALTER TABLE "BlogPostNote" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "BlogPostNote" FORCE ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation ON "BlogPostNote"
  USING ("tenantId" = current_setting('app.tenant_id', true))
  WITH CHECK ("tenantId" = current_setting('app.tenant_id', true));

ALTER TABLE "Comment" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Comment" FORCE ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation ON "Comment"
  USING ("tenantId" = current_setting('app.tenant_id', true))
  WITH CHECK ("tenantId" = current_setting('app.tenant_id', true));
