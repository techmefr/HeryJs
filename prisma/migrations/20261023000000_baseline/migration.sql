-- One migration for the whole schema as it stood after the history it
-- replaces: what Prisma derives from prisma/schema/, then what the schema
-- cannot say -- the pgvector extension, the checks and partial unique indexes,
-- and the row-level policy of every /// @hery.tenantScoped table.
CREATE EXTENSION IF NOT EXISTS vector;

-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "emailVerified" BOOLEAN NOT NULL DEFAULT false,
    "name" TEXT,
    "image" TEXT,
    "tenantId" TEXT NOT NULL DEFAULT 'default',
    "currentTeamId" TEXT,
    "role" TEXT,
    "banned" BOOLEAN NOT NULL DEFAULT false,
    "banReason" TEXT,
    "banExpires" TIMESTAMP(3),
    "twoFactorEnabled" BOOLEAN NOT NULL DEFAULT false,
    "phoneNumber" TEXT,
    "phoneNumberVerified" BOOLEAN NOT NULL DEFAULT false,
    "isAnonymous" BOOLEAN NOT NULL DEFAULT false,
    "locale" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ApiKey" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "prefix" TEXT NOT NULL,
    "hashedKey" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "revokedAt" TIMESTAMP(3),

    CONSTRAINT "ApiKey_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Team" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL DEFAULT 'default',
    "name" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Team_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TeamMember" (
    "teamId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL DEFAULT 'default',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TeamMember_pkey" PRIMARY KEY ("teamId","userId")
);

-- CreateTable
CREATE TABLE "Session" (
    "id" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "ipAddress" TEXT,
    "userAgent" TEXT,
    "impersonatedBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Session_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Account" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "providerId" TEXT NOT NULL,
    "password" TEXT,
    "accessToken" TEXT,
    "refreshToken" TEXT,
    "idToken" TEXT,
    "accessTokenExpiresAt" TIMESTAMP(3),
    "refreshTokenExpiresAt" TIMESTAMP(3),
    "scope" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Account_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Verification" (
    "id" TEXT NOT NULL,
    "identifier" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Verification_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FeatureFlag" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "tenantId" TEXT,
    "enabled" BOOLEAN NOT NULL DEFAULT false,
    "rolloutPercentage" INTEGER NOT NULL DEFAULT 100,
    "rolloutBy" TEXT NOT NULL DEFAULT 'user',
    "rules" JSONB NOT NULL DEFAULT '[]',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FeatureFlag_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AppNotification" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "readAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AppNotification_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AuditLog" (
    "id" TEXT NOT NULL,
    "sequence" SERIAL NOT NULL,
    "tenantId" TEXT NOT NULL,
    "model" TEXT NOT NULL,
    "operation" TEXT NOT NULL,
    "recordId" TEXT,
    "data" JSONB NOT NULL,
    "userId" TEXT,
    "impersonatedBy" TEXT,
    "hash" TEXT NOT NULL,
    "previousHash" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "redactedAt" TIMESTAMP(3),

    CONSTRAINT "AuditLog_pkey" PRIMARY KEY ("id")
);

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

-- CreateTable
CREATE TABLE "RecordSnapshot" (
    "id" TEXT NOT NULL,
    "sequence" SERIAL NOT NULL,
    "tenantId" TEXT NOT NULL,
    "model" TEXT NOT NULL,
    "recordId" TEXT NOT NULL,
    "operation" TEXT NOT NULL,
    "snapshot" JSONB NOT NULL,
    "userId" TEXT,
    "impersonatedBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RecordSnapshot_pkey" PRIMARY KEY ("id")
);

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
    "locale" TEXT,

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

-- CreateTable
CREATE TABLE "TwoFactor" (
    "id" TEXT NOT NULL,
    "secret" TEXT NOT NULL,
    "backupCodes" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "verified" BOOLEAN NOT NULL DEFAULT true,
    "failedVerificationCount" INTEGER NOT NULL DEFAULT 0,
    "lockedUntil" TIMESTAMP(3),

    CONSTRAINT "TwoFactor_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Passkey" (
    "id" TEXT NOT NULL,
    "name" TEXT,
    "publicKey" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "credentialID" TEXT NOT NULL,
    "counter" INTEGER NOT NULL,
    "deviceType" TEXT NOT NULL,
    "backedUp" BOOLEAN NOT NULL,
    "transports" TEXT,
    "createdAt" TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP,
    "aaguid" TEXT,

    CONSTRAINT "Passkey_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "QuotaOverride" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "limit" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "QuotaOverride_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "QuotaUsage" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "period" TEXT NOT NULL,
    "used" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "QuotaUsage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "IdempotencyKey" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "route" TEXT NOT NULL,
    "bodyHash" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "statusCode" INTEGER,
    "responseBody" JSONB,
    "responseHeaders" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "IdempotencyKey_pkey" PRIMARY KEY ("id")
);

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

-- CreateTable
CREATE TABLE "JobFlow" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "queue" TEXT NOT NULL,
    "rootJobId" TEXT NOT NULL,
    "steps" JSONB NOT NULL,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "cancelledAt" TIMESTAMP(3),

    CONSTRAINT "JobFlow_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RecordShare" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "resource" TEXT NOT NULL,
    "recordId" TEXT NOT NULL,
    "granteeType" TEXT NOT NULL,
    "granteeId" TEXT NOT NULL,
    "access" TEXT NOT NULL,
    "grantedById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RecordShare_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PrivacyRequest" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "subjectId" TEXT NOT NULL,
    "requestedBy" TEXT,
    "summary" JSONB,
    "result" JSONB,
    "error" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMP(3),
    "deliveredAt" TIMESTAMP(3),

    CONSTRAINT "PrivacyRequest_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BlogPost" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "ownerId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "summary" JSONB,
    "body" TEXT,
    "privateNote" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "BlogPost_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BlogPostTag" (
    "tenantId" TEXT NOT NULL,
    "blogPostId" TEXT NOT NULL,
    "tagId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BlogPostTag_pkey" PRIMARY KEY ("blogPostId","tagId")
);

-- CreateTable
CREATE TABLE "Tag" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Tag_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BlogPostNote" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "blogPostId" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "rating" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BlogPostNote_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Comment" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "commentableType" TEXT NOT NULL,
    "commentableId" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Comment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Snippet" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "ownerId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "summary" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),
    "version" INTEGER NOT NULL DEFAULT 1,
    "status" TEXT NOT NULL DEFAULT 'draft',

    CONSTRAINT "Snippet_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BillingSubscription" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "providerSubscriptionId" TEXT NOT NULL,
    "plan" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "currentPeriodEnd" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BillingSubscription_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MailLog" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "to" TEXT NOT NULL,
    "subject" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'queued',
    "error" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "sentAt" TIMESTAMP(3),

    CONSTRAINT "MailLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "NotificationPreference" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "channel" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "digest" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "NotificationPreference_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "NotificationSetting" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "timezone" TEXT NOT NULL DEFAULT 'UTC',
    "quietHoursStart" TEXT,
    "quietHoursEnd" TEXT,
    "digestHour" INTEGER NOT NULL DEFAULT 8,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "NotificationSetting_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "NotificationDigestEntry" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "subject" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "NotificationDigestEntry_pkey" PRIMARY KEY ("id")
);

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

-- CreateTable
CREATE TABLE "PushToken" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "platform" TEXT NOT NULL,
    "lastSeenAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PushToken_pkey" PRIMARY KEY ("id")
);

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

-- CreateTable
CREATE TABLE "SsoConnection" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "protocol" TEXT NOT NULL DEFAULT 'oidc',
    "issuer" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "clientSecret" TEXT,
    "samlEntryPoint" TEXT,
    "samlCertificate" TEXT,
    "samlAttributeMapping" TEXT,
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

-- CreateTable
CREATE TABLE "WebhookEndpoint" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "secret" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WebhookEndpoint_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WebhookEvent" (
    "id" TEXT NOT NULL,
    "endpointId" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "deliveryId" TEXT,
    "payload" JSONB NOT NULL,
    "receivedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "processedAt" TIMESTAMP(3),

    CONSTRAINT "WebhookEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WebhookSubscription" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "description" TEXT,
    "events" TEXT[],
    "secret" TEXT NOT NULL,
    "previousSecret" TEXT,
    "previousSecretExpiresAt" TIMESTAMP(3),
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WebhookSubscription_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WebhookDelivery" (
    "id" TEXT NOT NULL,
    "subscriptionId" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "messageId" TEXT NOT NULL,
    "event" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "round" INTEGER NOT NULL DEFAULT 0,
    "lastStatusCode" INTEGER,
    "lastError" TEXT,
    "lastAttemptAt" TIMESTAMP(3),
    "deliveredAt" TIMESTAMP(3),
    "deadAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WebhookDelivery_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE UNIQUE INDEX "User_phoneNumber_key" ON "User"("phoneNumber");

-- CreateIndex
CREATE UNIQUE INDEX "ApiKey_prefix_key" ON "ApiKey"("prefix");

-- CreateIndex
CREATE UNIQUE INDEX "Session_token_key" ON "Session"("token");

-- CreateIndex
CREATE UNIQUE INDEX "FeatureFlag_key_tenantId_key" ON "FeatureFlag"("key", "tenantId");

-- CreateIndex
CREATE INDEX "AppNotification_userId_idx" ON "AppNotification"("userId");

-- CreateIndex
CREATE INDEX "AppNotification_tenantId_idx" ON "AppNotification"("tenantId");

-- CreateIndex
CREATE UNIQUE INDEX "AuditLog_sequence_key" ON "AuditLog"("sequence");

-- CreateIndex
CREATE INDEX "AuditLog_tenantId_sequence_idx" ON "AuditLog"("tenantId", "sequence");

-- CreateIndex
CREATE INDEX "AuditLog_tenantId_createdAt_idx" ON "AuditLog"("tenantId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "AuditLog_tenantId_previousHash_key" ON "AuditLog"("tenantId", "previousHash");

-- CreateIndex
CREATE INDEX "AuditSink_tenantId_idx" ON "AuditSink"("tenantId");

-- CreateIndex
CREATE INDEX "AuditSink_active_idx" ON "AuditSink"("active");

-- CreateIndex
CREATE UNIQUE INDEX "RecordSnapshot_sequence_key" ON "RecordSnapshot"("sequence");

-- CreateIndex
CREATE INDEX "RecordSnapshot_tenantId_model_recordId_sequence_idx" ON "RecordSnapshot"("tenantId", "model", "recordId", "sequence");

-- CreateIndex
CREATE INDEX "RecordSnapshot_createdAt_idx" ON "RecordSnapshot"("createdAt");

-- CreateIndex
CREATE INDEX "OutboxMessage_status_nextAttemptAt_idx" ON "OutboxMessage"("status", "nextAttemptAt");

-- CreateIndex
CREATE INDEX "OutboxMessage_status_deliveredAt_idx" ON "OutboxMessage"("status", "deliveredAt");

-- CreateIndex
CREATE INDEX "OutboxMessage_status_deadAt_idx" ON "OutboxMessage"("status", "deadAt");

-- CreateIndex
CREATE UNIQUE INDEX "OutboxReceipt_messageId_handler_key" ON "OutboxReceipt"("messageId", "handler");

-- CreateIndex
CREATE INDEX "TwoFactor_secret_idx" ON "TwoFactor"("secret");

-- CreateIndex
CREATE INDEX "TwoFactor_userId_idx" ON "TwoFactor"("userId");

-- CreateIndex
CREATE INDEX "Passkey_userId_idx" ON "Passkey"("userId");

-- CreateIndex
CREATE INDEX "Passkey_credentialID_idx" ON "Passkey"("credentialID");

-- CreateIndex
CREATE UNIQUE INDEX "QuotaOverride_tenantId_name_key" ON "QuotaOverride"("tenantId", "name");

-- CreateIndex
CREATE UNIQUE INDEX "QuotaUsage_tenantId_name_period_key" ON "QuotaUsage"("tenantId", "name", "period");

-- CreateIndex
CREATE INDEX "IdempotencyKey_tenantId_idx" ON "IdempotencyKey"("tenantId");

-- CreateIndex
CREATE UNIQUE INDEX "IdempotencyKey_tenantId_key_key" ON "IdempotencyKey"("tenantId", "key");

-- CreateIndex
CREATE INDEX "DevtoolsEntry_tenantId_kind_createdAt_idx" ON "DevtoolsEntry"("tenantId", "kind", "createdAt");

-- CreateIndex
CREATE INDEX "DevtoolsEntry_createdAt_idx" ON "DevtoolsEntry"("createdAt");

-- CreateIndex
CREATE INDEX "LogEntry_tenantId_loggedAt_idx" ON "LogEntry"("tenantId", "loggedAt");

-- CreateIndex
CREATE INDEX "LogEntry_loggedAt_idx" ON "LogEntry"("loggedAt");

-- CreateIndex
CREATE INDEX "JobFlow_tenantId_createdAt_idx" ON "JobFlow"("tenantId", "createdAt");

-- CreateIndex
CREATE INDEX "JobFlow_createdAt_idx" ON "JobFlow"("createdAt");

-- CreateIndex
CREATE INDEX "RecordShare_tenantId_resource_granteeType_granteeId_idx" ON "RecordShare"("tenantId", "resource", "granteeType", "granteeId");

-- CreateIndex
CREATE INDEX "RecordShare_tenantId_resource_recordId_idx" ON "RecordShare"("tenantId", "resource", "recordId");

-- CreateIndex
CREATE UNIQUE INDEX "RecordShare_grant_key" ON "RecordShare"("tenantId", "resource", "recordId", "granteeType", "granteeId");

-- CreateIndex
CREATE INDEX "PrivacyRequest_tenantId_idx" ON "PrivacyRequest"("tenantId");

-- CreateIndex
CREATE INDEX "BlogPost_tenantId_idx" ON "BlogPost"("tenantId");

-- CreateIndex
CREATE UNIQUE INDEX "BlogPost_tenantId_slug_key" ON "BlogPost"("tenantId", "slug");

-- CreateIndex
CREATE INDEX "BlogPostTag_tenantId_idx" ON "BlogPostTag"("tenantId");

-- CreateIndex
CREATE INDEX "Tag_tenantId_idx" ON "Tag"("tenantId");

-- CreateIndex
CREATE INDEX "BlogPostNote_blogPostId_idx" ON "BlogPostNote"("blogPostId");

-- CreateIndex
CREATE INDEX "BlogPostNote_tenantId_idx" ON "BlogPostNote"("tenantId");

-- CreateIndex
CREATE INDEX "Comment_commentableType_commentableId_idx" ON "Comment"("commentableType", "commentableId");

-- CreateIndex
CREATE INDEX "Comment_tenantId_idx" ON "Comment"("tenantId");

-- CreateIndex
CREATE INDEX "Snippet_tenantId_idx" ON "Snippet"("tenantId");

-- CreateIndex
CREATE INDEX "Snippet_tenantId_deletedAt_idx" ON "Snippet"("tenantId", "deletedAt");

-- CreateIndex
CREATE INDEX "BillingSubscription_tenantId_idx" ON "BillingSubscription"("tenantId");

-- CreateIndex
CREATE UNIQUE INDEX "BillingSubscription_provider_providerSubscriptionId_key" ON "BillingSubscription"("provider", "providerSubscriptionId");

-- CreateIndex
CREATE INDEX "MailLog_tenantId_idx" ON "MailLog"("tenantId");

-- CreateIndex
CREATE INDEX "NotificationPreference_tenantId_idx" ON "NotificationPreference"("tenantId");

-- CreateIndex
CREATE UNIQUE INDEX "NotificationPreference_userId_channel_type_key" ON "NotificationPreference"("userId", "channel", "type");

-- CreateIndex
CREATE UNIQUE INDEX "NotificationSetting_userId_key" ON "NotificationSetting"("userId");

-- CreateIndex
CREATE INDEX "NotificationSetting_tenantId_idx" ON "NotificationSetting"("tenantId");

-- CreateIndex
CREATE INDEX "NotificationDigestEntry_tenantId_idx" ON "NotificationDigestEntry"("tenantId");

-- CreateIndex
CREATE INDEX "NotificationDigestEntry_userId_idx" ON "NotificationDigestEntry"("userId");

-- CreateIndex
CREATE INDEX "OauthIdentity_userId_idx" ON "OauthIdentity"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "OauthIdentity_provider_providerUserId_key" ON "OauthIdentity"("provider", "providerUserId");

-- CreateIndex
CREATE UNIQUE INDEX "PushToken_token_key" ON "PushToken"("token");

-- CreateIndex
CREATE INDEX "PushToken_tenantId_userId_idx" ON "PushToken"("tenantId", "userId");

-- CreateIndex
CREATE INDEX "PushToken_lastSeenAt_idx" ON "PushToken"("lastSeenAt");

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

-- CreateIndex
CREATE INDEX "SmsConsent_tenantId_phone_createdAt_idx" ON "SmsConsent"("tenantId", "phone", "createdAt");

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

-- CreateIndex
CREATE INDEX "WebhookEndpoint_tenantId_idx" ON "WebhookEndpoint"("tenantId");

-- CreateIndex
CREATE INDEX "WebhookEvent_tenantId_idx" ON "WebhookEvent"("tenantId");

-- CreateIndex
CREATE INDEX "WebhookEvent_endpointId_idx" ON "WebhookEvent"("endpointId");

-- CreateIndex
CREATE UNIQUE INDEX "WebhookEvent_tenantId_endpointId_deliveryId_key" ON "WebhookEvent"("tenantId", "endpointId", "deliveryId");

-- CreateIndex
CREATE INDEX "WebhookSubscription_tenantId_idx" ON "WebhookSubscription"("tenantId");

-- CreateIndex
CREATE INDEX "WebhookDelivery_tenantId_status_idx" ON "WebhookDelivery"("tenantId", "status");

-- CreateIndex
CREATE INDEX "WebhookDelivery_subscriptionId_idx" ON "WebhookDelivery"("subscriptionId");

-- CreateIndex
CREATE UNIQUE INDEX "WebhookDelivery_subscriptionId_messageId_key" ON "WebhookDelivery"("subscriptionId", "messageId");

-- AddForeignKey
ALTER TABLE "User" ADD CONSTRAINT "User_currentTeamId_fkey" FOREIGN KEY ("currentTeamId") REFERENCES "Team"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ApiKey" ADD CONSTRAINT "ApiKey_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TeamMember" ADD CONSTRAINT "TeamMember_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "Team"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TeamMember" ADD CONSTRAINT "TeamMember_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Session" ADD CONSTRAINT "Session_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Account" ADD CONSTRAINT "Account_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AppNotification" ADD CONSTRAINT "AppNotification_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OutboxReceipt" ADD CONSTRAINT "OutboxReceipt_messageId_fkey" FOREIGN KEY ("messageId") REFERENCES "OutboxMessage"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TwoFactor" ADD CONSTRAINT "TwoFactor_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Passkey" ADD CONSTRAINT "Passkey_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BlogPost" ADD CONSTRAINT "BlogPost_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BlogPostTag" ADD CONSTRAINT "BlogPostTag_blogPostId_fkey" FOREIGN KEY ("blogPostId") REFERENCES "BlogPost"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BlogPostTag" ADD CONSTRAINT "BlogPostTag_tagId_fkey" FOREIGN KEY ("tagId") REFERENCES "Tag"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BlogPostNote" ADD CONSTRAINT "BlogPostNote_blogPostId_fkey" FOREIGN KEY ("blogPostId") REFERENCES "BlogPost"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Snippet" ADD CONSTRAINT "Snippet_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "NotificationPreference" ADD CONSTRAINT "NotificationPreference_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "NotificationSetting" ADD CONSTRAINT "NotificationSetting_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "NotificationDigestEntry" ADD CONSTRAINT "NotificationDigestEntry_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PushToken" ADD CONSTRAINT "PushToken_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SsoDomain" ADD CONSTRAINT "SsoDomain_connectionId_fkey" FOREIGN KEY ("connectionId") REFERENCES "SsoConnection"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SsoIdentity" ADD CONSTRAINT "SsoIdentity_connectionId_fkey" FOREIGN KEY ("connectionId") REFERENCES "SsoConnection"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TwoFactorEnrolment" ADD CONSTRAINT "TwoFactorEnrolment_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TwoFactorRecoveryCode" ADD CONSTRAINT "TwoFactorRecoveryCode_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TwoFactorVerifiedSession" ADD CONSTRAINT "TwoFactorVerifiedSession_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WebhookEvent" ADD CONSTRAINT "WebhookEvent_endpointId_fkey" FOREIGN KEY ("endpointId") REFERENCES "WebhookEndpoint"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WebhookDelivery" ADD CONSTRAINT "WebhookDelivery_subscriptionId_fkey" FOREIGN KEY ("subscriptionId") REFERENCES "WebhookSubscription"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- CreateCheck
ALTER TABLE "FeatureFlag" ADD CONSTRAINT "FeatureFlag_rolloutPercentage_check" CHECK ("rolloutPercentage" BETWEEN 0 AND 100);
ALTER TABLE "FeatureFlag" ADD CONSTRAINT "FeatureFlag_rolloutBy_check" CHECK ("rolloutBy" IN ('user', 'tenant'));
ALTER TABLE "RecordShare" ADD CONSTRAINT "RecordShare_granteeType_check" CHECK ("granteeType" IN ('user', 'team'));
ALTER TABLE "RecordShare" ADD CONSTRAINT "RecordShare_access_check" CHECK ("access" IN ('read', 'write'));

-- CreatePartialIndex
CREATE UNIQUE INDEX "FeatureFlag_key_global_key" ON "FeatureFlag"("key") WHERE "tenantId" IS NULL;
CREATE UNIQUE INDEX "SsoDomain_verified_domain_key" ON "SsoDomain"("domain") WHERE "verifiedAt" IS NOT NULL;

-- EnableRowLevelSecurity
ALTER TABLE "AppNotification" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "AppNotification" FORCE ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation ON "AppNotification"
  USING ("tenantId" = current_setting('app.tenant_id', true))
  WITH CHECK ("tenantId" = current_setting('app.tenant_id', true));

ALTER TABLE "BillingSubscription" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "BillingSubscription" FORCE ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation ON "BillingSubscription"
  USING ("tenantId" = current_setting('app.tenant_id', true))
  WITH CHECK ("tenantId" = current_setting('app.tenant_id', true));

ALTER TABLE "BlogPost" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "BlogPost" FORCE ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation ON "BlogPost"
  USING ("tenantId" = current_setting('app.tenant_id', true))
  WITH CHECK ("tenantId" = current_setting('app.tenant_id', true));

ALTER TABLE "BlogPostNote" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "BlogPostNote" FORCE ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation ON "BlogPostNote"
  USING ("tenantId" = current_setting('app.tenant_id', true))
  WITH CHECK ("tenantId" = current_setting('app.tenant_id', true));

ALTER TABLE "BlogPostTag" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "BlogPostTag" FORCE ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation ON "BlogPostTag"
  USING ("tenantId" = current_setting('app.tenant_id', true))
  WITH CHECK ("tenantId" = current_setting('app.tenant_id', true));

ALTER TABLE "Comment" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Comment" FORCE ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation ON "Comment"
  USING ("tenantId" = current_setting('app.tenant_id', true))
  WITH CHECK ("tenantId" = current_setting('app.tenant_id', true));

ALTER TABLE "NotificationPreference" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "NotificationPreference" FORCE ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation ON "NotificationPreference"
  USING ("tenantId" = current_setting('app.tenant_id', true))
  WITH CHECK ("tenantId" = current_setting('app.tenant_id', true));

ALTER TABLE "NotificationSetting" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "NotificationSetting" FORCE ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation ON "NotificationSetting"
  USING ("tenantId" = current_setting('app.tenant_id', true))
  WITH CHECK ("tenantId" = current_setting('app.tenant_id', true));

ALTER TABLE "PrivacyRequest" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "PrivacyRequest" FORCE ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation ON "PrivacyRequest"
  USING ("tenantId" = current_setting('app.tenant_id', true))
  WITH CHECK ("tenantId" = current_setting('app.tenant_id', true));

ALTER TABLE "PushToken" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "PushToken" FORCE ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation ON "PushToken"
  USING ("tenantId" = current_setting('app.tenant_id', true))
  WITH CHECK ("tenantId" = current_setting('app.tenant_id', true));

ALTER TABLE "QuotaOverride" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "QuotaOverride" FORCE ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation ON "QuotaOverride"
  USING ("tenantId" = current_setting('app.tenant_id', true))
  WITH CHECK ("tenantId" = current_setting('app.tenant_id', true));

ALTER TABLE "QuotaUsage" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "QuotaUsage" FORCE ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation ON "QuotaUsage"
  USING ("tenantId" = current_setting('app.tenant_id', true))
  WITH CHECK ("tenantId" = current_setting('app.tenant_id', true));

ALTER TABLE "RecordShare" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "RecordShare" FORCE ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation ON "RecordShare"
  USING ("tenantId" = current_setting('app.tenant_id', true))
  WITH CHECK ("tenantId" = current_setting('app.tenant_id', true));

ALTER TABLE "ScimIdentity" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "ScimIdentity" FORCE ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation ON "ScimIdentity"
  USING ("tenantId" = current_setting('app.tenant_id', true))
  WITH CHECK ("tenantId" = current_setting('app.tenant_id', true));

ALTER TABLE "SmsConsent" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "SmsConsent" FORCE ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation ON "SmsConsent"
  USING ("tenantId" = current_setting('app.tenant_id', true))
  WITH CHECK ("tenantId" = current_setting('app.tenant_id', true));

ALTER TABLE "Snippet" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Snippet" FORCE ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation ON "Snippet"
  USING ("tenantId" = current_setting('app.tenant_id', true))
  WITH CHECK ("tenantId" = current_setting('app.tenant_id', true));

ALTER TABLE "Tag" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Tag" FORCE ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation ON "Tag"
  USING ("tenantId" = current_setting('app.tenant_id', true))
  WITH CHECK ("tenantId" = current_setting('app.tenant_id', true));

ALTER TABLE "Team" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Team" FORCE ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation ON "Team"
  USING ("tenantId" = current_setting('app.tenant_id', true))
  WITH CHECK ("tenantId" = current_setting('app.tenant_id', true));

ALTER TABLE "TeamMember" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "TeamMember" FORCE ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation ON "TeamMember"
  USING ("tenantId" = current_setting('app.tenant_id', true))
  WITH CHECK ("tenantId" = current_setting('app.tenant_id', true));

ALTER TABLE "TwoFactorEnrolment" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "TwoFactorEnrolment" FORCE ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation ON "TwoFactorEnrolment"
  USING ("tenantId" = current_setting('app.tenant_id', true))
  WITH CHECK ("tenantId" = current_setting('app.tenant_id', true));

ALTER TABLE "TwoFactorRecoveryCode" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "TwoFactorRecoveryCode" FORCE ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation ON "TwoFactorRecoveryCode"
  USING ("tenantId" = current_setting('app.tenant_id', true))
  WITH CHECK ("tenantId" = current_setting('app.tenant_id', true));

ALTER TABLE "TwoFactorRoleRequirement" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "TwoFactorRoleRequirement" FORCE ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation ON "TwoFactorRoleRequirement"
  USING ("tenantId" = current_setting('app.tenant_id', true))
  WITH CHECK ("tenantId" = current_setting('app.tenant_id', true));

ALTER TABLE "TwoFactorVerifiedSession" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "TwoFactorVerifiedSession" FORCE ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation ON "TwoFactorVerifiedSession"
  USING ("tenantId" = current_setting('app.tenant_id', true))
  WITH CHECK ("tenantId" = current_setting('app.tenant_id', true));
