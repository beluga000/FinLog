-- v3 §2-10 확인할 일: 정기 규칙으로 생성된 거래 표시
ALTER TABLE "Transaction" ADD COLUMN "needsReview" BOOLEAN NOT NULL DEFAULT false;
