-- AlterTable
ALTER TABLE "Account" ADD COLUMN     "balanceCheckYearly" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "MerchantCategoryRule" (
    "id" TEXT NOT NULL,
    "householdId" TEXT NOT NULL,
    "merchantKey" TEXT NOT NULL,
    "merchant" TEXT NOT NULL,
    "categoryId" TEXT NOT NULL,
    "createdByUserId" TEXT NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MerchantCategoryRule_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Challenge" (
    "id" TEXT NOT NULL,
    "householdId" TEXT NOT NULL,
    "month" TEXT NOT NULL,
    "merchantKey" TEXT NOT NULL,
    "merchant" TEXT NOT NULL,
    "limitCount" INTEGER NOT NULL,
    "baselineCount" INTEGER NOT NULL,
    "baselineAmount" BIGINT NOT NULL,
    "createdByUserId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Challenge_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "MerchantCategoryRule_householdId_merchantKey_key" ON "MerchantCategoryRule"("householdId", "merchantKey");

-- CreateIndex
CREATE UNIQUE INDEX "Challenge_householdId_month_merchantKey_key" ON "Challenge"("householdId", "month", "merchantKey");

-- AddForeignKey
ALTER TABLE "MerchantCategoryRule" ADD CONSTRAINT "MerchantCategoryRule_householdId_fkey" FOREIGN KEY ("householdId") REFERENCES "Household"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MerchantCategoryRule" ADD CONSTRAINT "MerchantCategoryRule_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "Category"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Challenge" ADD CONSTRAINT "Challenge_householdId_fkey" FOREIGN KEY ("householdId") REFERENCES "Household"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- 부동산·보증금은 거의 안 바뀌므로 1년에 한 번만 묻는다 (계좌 수정 창에서 바꿀 수 있다)
UPDATE "Account" SET "balanceCheckYearly" = true WHERE "type" = 'REAL_ESTATE';
