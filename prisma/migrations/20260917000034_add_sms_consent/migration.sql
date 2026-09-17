-- CreateTable
CREATE TABLE "SmsConsent" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "granted" BOOLEAN NOT NULL,
    "source" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SmsConsent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "SmsConsent_tenantId_phone_createdAt_idx" ON "SmsConsent"("tenantId", "phone", "createdAt");
