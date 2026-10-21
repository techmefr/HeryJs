-- CreateTable
CREATE TABLE "DevtoolsEntry" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "status" TEXT,
    "durationMs" DOUBLE PRECISION,
    "requestId" TEXT,
    "detail" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DevtoolsEntry_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "DevtoolsEntry_tenantId_kind_createdAt_idx" ON "DevtoolsEntry"("tenantId", "kind", "createdAt");

-- CreateIndex
CREATE INDEX "DevtoolsEntry_createdAt_idx" ON "DevtoolsEntry"("createdAt");
