-- CreateTable
CREATE TABLE "JobFlow" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "queue" TEXT NOT NULL,
    "rootJobId" TEXT NOT NULL,
    "steps" JSONB NOT NULL,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "cancelledAt" TIMESTAMP(3),

    CONSTRAINT "JobFlow_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "JobFlow_tenantId_createdAt_idx" ON "JobFlow"("tenantId", "createdAt");

-- CreateIndex
CREATE INDEX "JobFlow_createdAt_idx" ON "JobFlow"("createdAt");

