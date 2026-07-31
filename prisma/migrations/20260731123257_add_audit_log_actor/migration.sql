-- AlterTable
ALTER TABLE "AuditLog" ADD COLUMN     "impersonatedBy" TEXT,
ADD COLUMN     "userId" TEXT;
