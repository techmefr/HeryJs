
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

-- CreateIndex
CREATE UNIQUE INDEX "RecordSnapshot_sequence_key" ON "RecordSnapshot"("sequence");

-- CreateIndex
CREATE INDEX "RecordSnapshot_tenantId_model_recordId_sequence_idx" ON "RecordSnapshot"("tenantId", "model", "recordId", "sequence");

-- CreateIndex
CREATE INDEX "RecordSnapshot_createdAt_idx" ON "RecordSnapshot"("createdAt");

