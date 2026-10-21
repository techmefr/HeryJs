-- AlterTable
ALTER TABLE "Snippet" ADD COLUMN     "status" TEXT NOT NULL DEFAULT 'draft',
ADD COLUMN     "summary" TEXT;
