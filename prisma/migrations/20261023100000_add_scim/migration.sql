-- CreateTable
CREATE TABLE "ScimToken" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "prefix" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "rotatedAt" TIMESTAMP(3),
    "lastUsedAt" TIMESTAMP(3),

    CONSTRAINT "ScimToken_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ScimIdentity" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "resourceId" TEXT NOT NULL,
    "externalId" TEXT,
    "givenName" TEXT,
    "familyName" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ScimIdentity_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ScimToken_tenantId_key" ON "ScimToken"("tenantId");

-- CreateIndex
CREATE UNIQUE INDEX "ScimToken_tokenHash_key" ON "ScimToken"("tokenHash");

-- CreateIndex
CREATE INDEX "ScimIdentity_tenantId_idx" ON "ScimIdentity"("tenantId");

-- CreateIndex
CREATE UNIQUE INDEX "ScimIdentity_tenantId_kind_resourceId_key" ON "ScimIdentity"("tenantId", "kind", "resourceId");

-- CreateIndex
CREATE UNIQUE INDEX "ScimIdentity_tenantId_kind_externalId_key" ON "ScimIdentity"("tenantId", "kind", "externalId");
