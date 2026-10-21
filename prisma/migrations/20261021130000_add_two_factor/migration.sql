-- CreateTable
CREATE TABLE "TwoFactorEnrolment" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "secret" TEXT NOT NULL,
    "confirmedAt" TIMESTAMP(3),
    "lastUsedStep" INTEGER,
    "failedAttempts" INTEGER NOT NULL DEFAULT 0,
    "lockedUntil" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TwoFactorEnrolment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TwoFactorRecoveryCode" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "codeHash" TEXT NOT NULL,
    "usedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TwoFactorRecoveryCode_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TwoFactorRoleRequirement" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "role" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TwoFactorRoleRequirement_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TwoFactorVerifiedSession" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TwoFactorVerifiedSession_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "TwoFactorEnrolment_userId_key" ON "TwoFactorEnrolment"("userId");

-- CreateIndex
CREATE INDEX "TwoFactorEnrolment_tenantId_idx" ON "TwoFactorEnrolment"("tenantId");

-- CreateIndex
CREATE INDEX "TwoFactorRecoveryCode_tenantId_userId_idx" ON "TwoFactorRecoveryCode"("tenantId", "userId");

-- CreateIndex
CREATE UNIQUE INDEX "TwoFactorRoleRequirement_tenantId_role_key" ON "TwoFactorRoleRequirement"("tenantId", "role");

-- CreateIndex
CREATE UNIQUE INDEX "TwoFactorVerifiedSession_tokenHash_key" ON "TwoFactorVerifiedSession"("tokenHash");

-- CreateIndex
CREATE INDEX "TwoFactorVerifiedSession_tenantId_userId_idx" ON "TwoFactorVerifiedSession"("tenantId", "userId");

-- AddForeignKey
ALTER TABLE "TwoFactorEnrolment" ADD CONSTRAINT "TwoFactorEnrolment_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TwoFactorRecoveryCode" ADD CONSTRAINT "TwoFactorRecoveryCode_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TwoFactorVerifiedSession" ADD CONSTRAINT "TwoFactorVerifiedSession_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
