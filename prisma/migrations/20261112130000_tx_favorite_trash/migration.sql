-- CreateTable
CREATE TABLE "TxFavorite" (
    "id" TEXT NOT NULL,
    "householdId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "template" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TxFavorite_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "TxFavorite_householdId_userId_idx" ON "TxFavorite"("householdId", "userId");

-- CreateIndex
CREATE INDEX "Transaction_householdId_deletedAt_idx" ON "Transaction"("householdId", "deletedAt");

-- AddForeignKey
ALTER TABLE "TxFavorite" ADD CONSTRAINT "TxFavorite_householdId_fkey" FOREIGN KEY ("householdId") REFERENCES "Household"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TxFavorite" ADD CONSTRAINT "TxFavorite_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
