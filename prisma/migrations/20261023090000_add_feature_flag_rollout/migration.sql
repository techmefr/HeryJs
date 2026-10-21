-- AlterTable
ALTER TABLE "FeatureFlag" ADD COLUMN "rolloutPercentage" INTEGER NOT NULL DEFAULT 100,
ADD COLUMN "rolloutBy" TEXT NOT NULL DEFAULT 'user',
ADD COLUMN "rules" JSONB NOT NULL DEFAULT '[]';

ALTER TABLE "FeatureFlag" ADD CONSTRAINT "FeatureFlag_rolloutPercentage_check" CHECK ("rolloutPercentage" BETWEEN 0 AND 100);
ALTER TABLE "FeatureFlag" ADD CONSTRAINT "FeatureFlag_rolloutBy_check" CHECK ("rolloutBy" IN ('user', 'tenant'));
