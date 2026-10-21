-- CreateTable
CREATE TABLE "OauthIdentity" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "providerUserId" TEXT NOT NULL,
    "email" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "OauthIdentity_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "OauthIdentity_userId_idx" ON "OauthIdentity"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "OauthIdentity_provider_providerUserId_key" ON "OauthIdentity"("provider", "providerUserId");
