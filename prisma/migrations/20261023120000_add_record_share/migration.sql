-- CreateTable
CREATE TABLE "RecordShare" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "resource" TEXT NOT NULL,
    "recordId" TEXT NOT NULL,
    "granteeType" TEXT NOT NULL,
    "granteeId" TEXT NOT NULL,
    "access" TEXT NOT NULL,
    "grantedById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RecordShare_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "RecordShare_granteeType_check" CHECK ("granteeType" IN ('user', 'team')),
    CONSTRAINT "RecordShare_access_check" CHECK ("access" IN ('read', 'write'))
);

-- CreateIndex
CREATE UNIQUE INDEX "RecordShare_grant_key" ON "RecordShare"("tenantId", "resource", "recordId", "granteeType", "granteeId");

-- CreateIndex
CREATE INDEX "RecordShare_tenantId_resource_granteeType_granteeId_idx" ON "RecordShare"("tenantId", "resource", "granteeType", "granteeId");

-- CreateIndex
CREATE INDEX "RecordShare_tenantId_resource_recordId_idx" ON "RecordShare"("tenantId", "resource", "recordId");
