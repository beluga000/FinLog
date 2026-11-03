-- AlterTable
ALTER TABLE "User" ADD COLUMN     "approvedAt" TIMESTAMP(3);

-- 기존 사용자는 승인된 것으로 본다 (승인 기능 도입 전 가입자)
UPDATE "User" SET "approvedAt" = "createdAt" WHERE "approvedAt" IS NULL;
