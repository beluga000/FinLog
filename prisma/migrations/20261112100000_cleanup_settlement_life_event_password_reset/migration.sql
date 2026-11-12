-- 쓰지 않던 테이블 정리(예산·성향 진단·포트폴리오·자산군 가정치·세율 — 세율은 src/lib/finance/tax-accounts.ts 표가 유일한 출처)
-- + 부부 정산(Settlement 달마다 하나) · 생활 변화(LifeEvent) · 비밀번호 재설정 링크(User)

-- DropForeignKey
ALTER TABLE "AssetGoal" DROP CONSTRAINT "AssetGoal_planId_fkey";

-- DropForeignKey
ALTER TABLE "Budget" DROP CONSTRAINT "Budget_householdId_fkey";

-- DropForeignKey
ALTER TABLE "PortfolioPlan" DROP CONSTRAINT "PortfolioPlan_householdId_fkey";

-- DropForeignKey
ALTER TABLE "RiskAssessment" DROP CONSTRAINT "RiskAssessment_userId_fkey";

-- AlterTable
ALTER TABLE "AssetGoal" DROP COLUMN "planId";

-- AlterTable
ALTER TABLE "LifeEvent" ADD COLUMN     "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "passwordResetExp" TIMESTAMP(3),
ADD COLUMN     "passwordResetHash" TEXT;

-- DropTable
DROP TABLE "AssetClassAssumption";

-- DropTable
DROP TABLE "Budget";

-- DropTable
DROP TABLE "PortfolioPlan";

-- DropTable
DROP TABLE "RiskAssessment";

-- DropTable
DROP TABLE "TaxRuleSet";

-- DropEnum
DROP TYPE "PlanSource";

-- DropEnum
DROP TYPE "RiskProfile";

-- CreateIndex
CREATE INDEX "LifeEvent_householdId_idx" ON "LifeEvent"("householdId");

-- CreateIndex
CREATE UNIQUE INDEX "Settlement_householdId_month_key" ON "Settlement"("householdId", "month");

-- CreateIndex
CREATE INDEX "SplitRule_householdId_idx" ON "SplitRule"("householdId");

-- CreateIndex
CREATE UNIQUE INDEX "User_passwordResetHash_key" ON "User"("passwordResetHash");

