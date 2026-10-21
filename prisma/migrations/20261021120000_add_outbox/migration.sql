-- CreateTable
CREATE TABLE "OutboxMessage" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT,
    "name" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "nextAttemptAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastError" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deliveredAt" TIMESTAMP(3),
    "deadAt" TIMESTAMP(3),

    CONSTRAINT "OutboxMessage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OutboxReceipt" (
    "id" TEXT NOT NULL,
    "messageId" TEXT NOT NULL,
    "handler" TEXT NOT NULL,
    "completedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "OutboxReceipt_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "OutboxMessage_status_nextAttemptAt_idx" ON "OutboxMessage"("status", "nextAttemptAt");

-- CreateIndex
CREATE INDEX "OutboxMessage_status_deliveredAt_idx" ON "OutboxMessage"("status", "deliveredAt");

-- CreateIndex
CREATE INDEX "OutboxMessage_status_deadAt_idx" ON "OutboxMessage"("status", "deadAt");

-- CreateIndex
CREATE UNIQUE INDEX "OutboxReceipt_messageId_handler_key" ON "OutboxReceipt"("messageId", "handler");

-- AddForeignKey
ALTER TABLE "OutboxReceipt" ADD CONSTRAINT "OutboxReceipt_messageId_fkey" FOREIGN KEY ("messageId") REFERENCES "OutboxMessage"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
