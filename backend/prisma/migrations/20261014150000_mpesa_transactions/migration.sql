-- CreateEnum
CREATE TYPE "MpesaStatus" AS ENUM ('PENDING', 'SUCCESS', 'FAILED');

-- CreateTable
CREATE TABLE "MpesaTransaction" (
    "id" TEXT NOT NULL,
    "rentalId" TEXT NOT NULL,
    "msisdn" TEXT NOT NULL,
    "amount" DECIMAL(12,2) NOT NULL,
    "status" "MpesaStatus" NOT NULL DEFAULT 'PENDING',
    "transactionReference" TEXT NOT NULL,
    "thirdPartyReference" TEXT NOT NULL,
    "providerTransactionId" TEXT,
    "conversationId" TEXT,
    "responseCode" TEXT,
    "responseDesc" TEXT,
    "paymentReference" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMP(3),

    CONSTRAINT "MpesaTransaction_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "MpesaTransaction_thirdPartyReference_key" ON "MpesaTransaction"("thirdPartyReference");

-- CreateIndex
CREATE INDEX "MpesaTransaction_rentalId_createdAt_idx" ON "MpesaTransaction"("rentalId", "createdAt");

-- AddForeignKey
ALTER TABLE "MpesaTransaction" ADD CONSTRAINT "MpesaTransaction_rentalId_fkey" FOREIGN KEY ("rentalId") REFERENCES "Rental"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

