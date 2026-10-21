-- CreateTable
CREATE TABLE "QuotaOverride" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "limit" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "QuotaOverride_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "QuotaUsage" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "period" TEXT NOT NULL,
    "used" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "QuotaUsage_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "QuotaOverride_tenantId_name_key" ON "QuotaOverride"("tenantId", "name");

-- CreateIndex
CREATE UNIQUE INDEX "QuotaUsage_tenantId_name_period_key" ON "QuotaUsage"("tenantId", "name", "period");
