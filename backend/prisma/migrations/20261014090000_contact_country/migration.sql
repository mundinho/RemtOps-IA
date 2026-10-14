-- AlterTable
ALTER TABLE "Customer" ADD COLUMN     "country" TEXT NOT NULL DEFAULT 'MZ';

-- AlterTable
ALTER TABLE "Rental" ADD COLUMN     "contactCountry" TEXT;

