-- CreateIndex
CREATE INDEX "Transaction_householdId_needsReview_date_idx" ON "Transaction"("householdId", "needsReview", "date");

-- CreateIndex
CREATE INDEX "Transaction_fromAccountId_date_idx" ON "Transaction"("fromAccountId", "date");

-- CreateIndex
CREATE INDEX "Transaction_toAccountId_date_idx" ON "Transaction"("toAccountId", "date");

-- CreateIndex
CREATE INDEX "RecurringRule_householdId_idx" ON "RecurringRule"("householdId");
