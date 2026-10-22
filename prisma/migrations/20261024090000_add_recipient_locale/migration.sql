-- AlterTable
ALTER TABLE "User" ADD COLUMN "locale" TEXT;

-- AlterTable
ALTER TABLE "OutboxMessage" ADD COLUMN "locale" TEXT;
