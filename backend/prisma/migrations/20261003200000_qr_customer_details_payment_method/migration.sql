-- CreateEnum
CREATE TYPE "PaymentMethod" AS ENUM ('MPESA', 'EMOLA', 'BANK_TRANSFER', 'CARD', 'CASH');

-- AlterTable
ALTER TABLE "Payment" DROP COLUMN "method",
ADD COLUMN     "method" "PaymentMethod";

-- AlterTable
ALTER TABLE "Rental" ADD COLUMN     "contactEmail" TEXT,
ADD COLUMN     "contactName" TEXT,
ADD COLUMN     "contactPhone" TEXT,
ADD COLUMN     "paymentMethod" "PaymentMethod";

