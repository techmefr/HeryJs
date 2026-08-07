-- Multi-tenancy is the shape of every table, not a feature added later. These
-- five carried no tenantId: the child and pivot tables were only ever reached
-- through a tenant-scoped parent, and AppNotification only through its user --
-- reachable-through-something is not a boundary, and a raw query or a future
-- refactor goes straight past it.
--
-- Existing rows are backfilled from whatever already knows their tenant, so the
-- column starts out true rather than defaulted to a guess. The default is
-- temporary for exactly that reason, and dropped at the end: from here on the
-- Prisma extension stamps the tenant on every insert.

ALTER TABLE "AppNotification" ADD COLUMN "tenantId" TEXT NOT NULL DEFAULT 'default';
UPDATE "AppNotification" SET "tenantId" = "User"."tenantId"
FROM "User" WHERE "AppNotification"."userId" = "User"."id";
ALTER TABLE "AppNotification" ALTER COLUMN "tenantId" DROP DEFAULT;
CREATE INDEX "AppNotification_tenantId_idx" ON "AppNotification"("tenantId");

ALTER TABLE "BlogPostNote" ADD COLUMN "tenantId" TEXT NOT NULL DEFAULT 'default';
UPDATE "BlogPostNote" SET "tenantId" = "BlogPost"."tenantId"
FROM "BlogPost" WHERE "BlogPostNote"."blogPostId" = "BlogPost"."id";
ALTER TABLE "BlogPostNote" ALTER COLUMN "tenantId" DROP DEFAULT;
CREATE INDEX "BlogPostNote_tenantId_idx" ON "BlogPostNote"("tenantId");

ALTER TABLE "BlogPostTag" ADD COLUMN "tenantId" TEXT NOT NULL DEFAULT 'default';
UPDATE "BlogPostTag" SET "tenantId" = "BlogPost"."tenantId"
FROM "BlogPost" WHERE "BlogPostTag"."blogPostId" = "BlogPost"."id";
ALTER TABLE "BlogPostTag" ALTER COLUMN "tenantId" DROP DEFAULT;
CREATE INDEX "BlogPostTag_tenantId_idx" ON "BlogPostTag"("tenantId");

-- A tag has no parent to read the tenant from, and a comment's parent is
-- polymorphic with no foreign key to join on, so both keep the default they were
-- created under. Every row written from now on carries the real one.
ALTER TABLE "Tag" ADD COLUMN "tenantId" TEXT NOT NULL DEFAULT 'default';
ALTER TABLE "Tag" ALTER COLUMN "tenantId" DROP DEFAULT;
CREATE INDEX "Tag_tenantId_idx" ON "Tag"("tenantId");

ALTER TABLE "Comment" ADD COLUMN "tenantId" TEXT NOT NULL DEFAULT 'default';
ALTER TABLE "Comment" ALTER COLUMN "tenantId" DROP DEFAULT;
CREATE INDEX "Comment_tenantId_idx" ON "Comment"("tenantId");
