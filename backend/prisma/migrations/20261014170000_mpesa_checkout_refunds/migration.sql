-- DropForeignKey
ALTER TABLE "MpesaTransaction" DROP CONSTRAINT "MpesaTransaction_rentalId_fkey";

-- AlterTable
ALTER TABLE "MpesaTransaction" ADD COLUMN     "equipmentCode" TEXT,
ADD COLUMN     "refundNote" TEXT,
ADD COLUMN     "refundedAt" TIMESTAMP(3),
ADD COLUMN     "refundedBy" TEXT,
ADD COLUMN     "requestPayload" JSONB,
ALTER COLUMN "rentalId" DROP NOT NULL;

-- AddForeignKey
ALTER TABLE "MpesaTransaction" ADD CONSTRAINT "MpesaTransaction_rentalId_fkey" FOREIGN KEY ("rentalId") REFERENCES "Rental"("id") ON DELETE SET NULL ON UPDATE CASCADE;

