-- AlterTable
ALTER TABLE "AssetGoal" ADD COLUMN     "baseSetOn" DATE,
ADD COLUMN     "milestoneSeen" INTEGER NOT NULL DEFAULT 0;
