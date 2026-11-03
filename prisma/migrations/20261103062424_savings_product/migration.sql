-- AlterTable
ALTER TABLE "Account" ADD COLUMN     "interestRate" DECIMAL(9,6),
ADD COLUMN     "maturityDate" DATE,
ADD COLUMN     "openedOn" DATE;
