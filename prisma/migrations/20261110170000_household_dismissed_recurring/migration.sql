-- AlterTable
ALTER TABLE "Household" ADD COLUMN     "dismissedRecurring" TEXT[] DEFAULT ARRAY[]::TEXT[];
