-- CreateTable
CREATE TABLE "AuditSink" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "url" TEXT,
    "authToken" TEXT,
    "storageDriver" TEXT,
    "keyPrefix" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "cursor" INTEGER NOT NULL DEFAULT 0,
    "lastError" TEXT,
    "lastDeliveredAt" TIMESTAMP(3),
    "lastDeliveredSequence" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AuditSink_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "AuditSink_tenantId_idx" ON "AuditSink"("tenantId");

-- CreateIndex
CREATE INDEX "AuditSink_active_idx" ON "AuditSink"("active");

-- CreateIndex
CREATE INDEX "AuditLog_tenantId_createdAt_idx" ON "AuditLog"("tenantId", "createdAt");
