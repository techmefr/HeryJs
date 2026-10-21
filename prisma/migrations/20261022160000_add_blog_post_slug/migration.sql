-- AlterTable
ALTER TABLE "BlogPost" ADD COLUMN     "slug" TEXT;

-- Existing rows get their id as slug: unique already, and a valid slug.
UPDATE "BlogPost" SET "slug" = lower("id") WHERE "slug" IS NULL;

ALTER TABLE "BlogPost" ALTER COLUMN "slug" SET NOT NULL;

-- CreateIndex
CREATE UNIQUE INDEX "BlogPost_tenantId_slug_key" ON "BlogPost"("tenantId", "slug");
