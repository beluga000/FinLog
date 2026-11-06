-- AlterTable
ALTER TABLE "Account" ADD COLUMN     "taxWrapper" TEXT;

-- 기존 계좌 이름으로 채우기 (사용자가 계좌 수정 창에서 바꿀 수 있다)
UPDATE "Account" SET "taxWrapper" = 'IRP' WHERE "type" = 'PENSION' AND "name" ILIKE '%IRP%';
UPDATE "Account" SET "taxWrapper" = 'PENSION_SAVINGS' WHERE "type" = 'PENSION' AND "taxWrapper" IS NULL AND "name" LIKE '%연금저축%';
UPDATE "Account" SET "taxWrapper" = 'ISA' WHERE "type" IN ('INVESTMENT', 'SAVINGS') AND "name" ILIKE '%ISA%';
