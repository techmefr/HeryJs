-- CreateTable
CREATE TABLE "Comment" (
    "id" TEXT NOT NULL,
    "commentableType" TEXT NOT NULL,
    "commentableId" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Comment_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Comment_commentableType_commentableId_idx" ON "Comment"("commentableType", "commentableId");
