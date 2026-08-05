-- RenameTable
ALTER TABLE "Workout" RENAME TO "BlogPost";
ALTER TABLE "WorkoutNote" RENAME TO "BlogPostNote";
ALTER TABLE "WorkoutTag" RENAME TO "BlogPostTag";

-- RenameColumn
ALTER TABLE "BlogPostNote" RENAME COLUMN "workoutId" TO "blogPostId";
ALTER TABLE "BlogPostTag" RENAME COLUMN "workoutId" TO "blogPostId";

-- RenameConstraint / RenameIndex
ALTER TABLE "BlogPost" RENAME CONSTRAINT "Workout_pkey" TO "BlogPost_pkey";
ALTER INDEX "Workout_tenantId_idx" RENAME TO "BlogPost_tenantId_idx";
ALTER TABLE "BlogPost" RENAME CONSTRAINT "Workout_ownerId_fkey" TO "BlogPost_ownerId_fkey";

ALTER TABLE "BlogPostNote" RENAME CONSTRAINT "WorkoutNote_pkey" TO "BlogPostNote_pkey";
ALTER INDEX "WorkoutNote_workoutId_idx" RENAME TO "BlogPostNote_blogPostId_idx";
ALTER TABLE "BlogPostNote" RENAME CONSTRAINT "WorkoutNote_workoutId_fkey" TO "BlogPostNote_blogPostId_fkey";

ALTER TABLE "BlogPostTag" RENAME CONSTRAINT "WorkoutTag_pkey" TO "BlogPostTag_pkey";
ALTER TABLE "BlogPostTag" RENAME CONSTRAINT "WorkoutTag_workoutId_fkey" TO "BlogPostTag_blogPostId_fkey";
ALTER TABLE "BlogPostTag" RENAME CONSTRAINT "WorkoutTag_tagId_fkey" TO "BlogPostTag_tagId_fkey";
