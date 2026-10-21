-- CreateTable
CREATE TABLE "SsoConnection" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "issuer" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "clientSecret" TEXT NOT NULL,
    "linkPolicy" TEXT NOT NULL DEFAULT 'refuse',
    "isEnabled" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SsoConnection_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SsoDomain" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "connectionId" TEXT NOT NULL,
    "domain" TEXT NOT NULL,
    "verificationToken" TEXT NOT NULL,
    "verifiedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SsoDomain_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SsoIdentity" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "connectionId" TEXT NOT NULL,
    "subject" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SsoIdentity_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "SsoConnection_tenantId_idx" ON "SsoConnection"("tenantId");

-- CreateIndex
CREATE INDEX "SsoDomain_tenantId_idx" ON "SsoDomain"("tenantId");

-- CreateIndex
CREATE INDEX "SsoDomain_domain_idx" ON "SsoDomain"("domain");

-- CreateIndex
CREATE UNIQUE INDEX "SsoDomain_connectionId_domain_key" ON "SsoDomain"("connectionId", "domain");

-- CreateIndex
CREATE INDEX "SsoIdentity_tenantId_idx" ON "SsoIdentity"("tenantId");

-- CreateIndex
CREATE INDEX "SsoIdentity_userId_idx" ON "SsoIdentity"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "SsoIdentity_connectionId_subject_key" ON "SsoIdentity"("connectionId", "subject");

-- AddForeignKey
ALTER TABLE "SsoDomain" ADD CONSTRAINT "SsoDomain_connectionId_fkey" FOREIGN KEY ("connectionId") REFERENCES "SsoConnection"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SsoIdentity" ADD CONSTRAINT "SsoIdentity_connectionId_fkey" FOREIGN KEY ("connectionId") REFERENCES "SsoConnection"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- CreateIndex
CREATE UNIQUE INDEX "SsoDomain_verified_domain_key" ON "SsoDomain"("domain") WHERE "verifiedAt" IS NOT NULL;
