-- AlterTable
ALTER TABLE "Notification" ADD COLUMN     "deliveryError" TEXT,
ADD COLUMN     "providerMessageId" TEXT,
ADD COLUMN     "sentAt" TIMESTAMP(3);

