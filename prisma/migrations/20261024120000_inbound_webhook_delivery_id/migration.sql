-- AlterTable
ALTER TABLE "WebhookEvent" ADD COLUMN "deliveryId" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "WebhookEvent_tenantId_endpointId_deliveryId_key" ON "WebhookEvent"("tenantId", "endpointId", "deliveryId");
