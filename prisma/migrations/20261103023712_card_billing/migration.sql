-- AlterTable
ALTER TABLE "Account" ADD COLUMN     "billingDay" INTEGER,
ADD COLUMN     "paymentAccountId" TEXT;

-- AddForeignKey
ALTER TABLE "Account" ADD CONSTRAINT "Account_paymentAccountId_fkey" FOREIGN KEY ("paymentAccountId") REFERENCES "Account"("id") ON DELETE SET NULL ON UPDATE CASCADE;
