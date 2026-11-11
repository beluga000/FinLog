-- AlterTable
ALTER TABLE "Transaction" ADD COLUMN     "installmentMonths" INTEGER;

-- 캡처로 기록하며 메모 끝에 붙인 "N개월 할부"를 칸으로 옮긴다 (신용카드 지출만).
-- 메모에서는 그 글자만 떼고, 남는 게 없으면 메모를 비운다 (목록은 칸 값으로 "N개월 할부"를 보여 준다)
UPDATE "Transaction" t
SET "installmentMonths" = substring(t."memo" from '(\d+)개월 할부$')::int,
    "memo" = NULLIF(regexp_replace(t."memo", '\s*·?\s*\d+개월 할부$', ''), '')
FROM "Account" a
WHERE a."id" = t."fromAccountId"
  AND a."type" = 'CREDIT_CARD'
  AND t."type" = 'EXPENSE'
  AND t."memo" ~ '\d+개월 할부$'
  AND substring(t."memo" from '(\d+)개월 할부$')::int BETWEEN 2 AND 60;
