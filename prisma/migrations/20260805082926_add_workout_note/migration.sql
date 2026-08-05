-- CreateTable
CREATE TABLE "WorkoutNote" (
    "id" TEXT NOT NULL,
    "workoutId" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WorkoutNote_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "WorkoutNote_workoutId_idx" ON "WorkoutNote"("workoutId");

-- AddForeignKey
ALTER TABLE "WorkoutNote" ADD CONSTRAINT "WorkoutNote_workoutId_fkey" FOREIGN KEY ("workoutId") REFERENCES "Workout"("id") ON DELETE CASCADE ON UPDATE CASCADE;
