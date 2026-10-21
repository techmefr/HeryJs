-- CreateTable
CREATE TABLE "LogEntry" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "level" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "fields" JSONB,
    "loggedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LogEntry_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "LogEntry_tenantId_loggedAt_idx" ON "LogEntry"("tenantId", "loggedAt");

-- CreateIndex
CREATE INDEX "LogEntry_loggedAt_idx" ON "LogEntry"("loggedAt");
