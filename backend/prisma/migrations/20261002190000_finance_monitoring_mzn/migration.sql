-- CreateEnum
CREATE TYPE "MaintenanceOrderType" AS ENUM ('PREVENTIVE', 'CORRECTIVE', 'INSPECTION');

-- CreateEnum
CREATE TYPE "MaintenanceOrderStatus" AS ENUM ('OPEN', 'SCHEDULED', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "PaymentStatus" AS ENUM ('PENDING', 'PAID', 'OVERDUE', 'CANCELLED');

-- CreateEnum
CREATE TYPE "AlertCategory" AS ENUM ('MAINTENANCE', 'FINANCE', 'RISK', 'OPERATIONS');

-- CreateEnum
CREATE TYPE "ReviewKind" AS ENUM ('RENTAL_DECISION', 'ANOMALY');

-- AlterEnum
ALTER TYPE "AgentName" ADD VALUE 'FINANCE';

-- AlterEnum
ALTER TYPE "EquipmentStatus" ADD VALUE 'MAINTENANCE_PENDING';

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "NotificationType" ADD VALUE 'RETURN_REMINDER';
ALTER TYPE "NotificationType" ADD VALUE 'RETURN_OVERDUE';
ALTER TYPE "NotificationType" ADD VALUE 'PAYMENT_ALERT';
ALTER TYPE "NotificationType" ADD VALUE 'MAINTENANCE_DUE';
ALTER TYPE "NotificationType" ADD VALUE 'ANOMALY_REVIEW';

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "WorkflowStep" ADD VALUE 'FINANCE_CHECK';
ALTER TYPE "WorkflowStep" ADD VALUE 'BILLING';

-- DropForeignKey
ALTER TABLE "HumanReview" DROP CONSTRAINT "HumanReview_rentalId_fkey";

-- AlterTable
ALTER TABLE "Alert" ADD COLUMN     "category" "AlertCategory" NOT NULL DEFAULT 'OPERATIONS',
ADD COLUMN     "customerId" TEXT,
ADD COLUMN     "dedupeKey" TEXT;

-- AlterTable
ALTER TABLE "Equipment" ADD COLUMN     "hoursAtLastService" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "serviceIntervalHours" INTEGER,
ADD COLUMN     "usageHours" INTEGER NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "HumanReview" ADD COLUMN     "customerId" TEXT,
ADD COLUMN     "dedupeKey" TEXT,
ADD COLUMN     "equipmentId" TEXT,
ADD COLUMN     "kind" "ReviewKind" NOT NULL DEFAULT 'RENTAL_DECISION',
ALTER COLUMN "rentalId" DROP NOT NULL;

-- AlterTable
ALTER TABLE "Notification" ADD COLUMN     "dedupeKey" TEXT,
ADD COLUMN     "priority" "Severity" NOT NULL DEFAULT 'MEDIUM';

-- AlterTable
ALTER TABLE "Rental" ADD COLUMN     "hoursUsed" INTEGER;

-- CreateTable
CREATE TABLE "MaintenanceOrder" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "equipmentId" TEXT NOT NULL,
    "type" "MaintenanceOrderType" NOT NULL,
    "status" "MaintenanceOrderStatus" NOT NULL DEFAULT 'OPEN',
    "priority" "Severity" NOT NULL DEFAULT 'MEDIUM',
    "reason" TEXT NOT NULL,
    "createdByAgent" "AgentName",
    "dueBy" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MaintenanceOrder_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Payment" (
    "id" TEXT NOT NULL,
    "reference" TEXT NOT NULL,
    "rentalId" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "amount" DECIMAL(12,2) NOT NULL,
    "dueDate" TIMESTAMP(3) NOT NULL,
    "status" "PaymentStatus" NOT NULL DEFAULT 'PENDING',
    "paidAt" TIMESTAMP(3),
    "method" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Payment_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "MaintenanceOrder_code_key" ON "MaintenanceOrder"("code");

-- CreateIndex
CREATE INDEX "MaintenanceOrder_equipmentId_status_idx" ON "MaintenanceOrder"("equipmentId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "Payment_reference_key" ON "Payment"("reference");

-- CreateIndex
CREATE INDEX "Payment_status_dueDate_idx" ON "Payment"("status", "dueDate");

-- CreateIndex
CREATE INDEX "Payment_customerId_idx" ON "Payment"("customerId");

-- CreateIndex
CREATE UNIQUE INDEX "Alert_dedupeKey_key" ON "Alert"("dedupeKey");

-- CreateIndex
CREATE UNIQUE INDEX "HumanReview_dedupeKey_key" ON "HumanReview"("dedupeKey");

-- CreateIndex
CREATE UNIQUE INDEX "Notification_dedupeKey_key" ON "Notification"("dedupeKey");

-- CreateIndex
CREATE INDEX "Notification_priority_createdAt_idx" ON "Notification"("priority", "createdAt");

-- AddForeignKey
ALTER TABLE "MaintenanceOrder" ADD CONSTRAINT "MaintenanceOrder_equipmentId_fkey" FOREIGN KEY ("equipmentId") REFERENCES "Equipment"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Payment" ADD CONSTRAINT "Payment_rentalId_fkey" FOREIGN KEY ("rentalId") REFERENCES "Rental"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Payment" ADD CONSTRAINT "Payment_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HumanReview" ADD CONSTRAINT "HumanReview_rentalId_fkey" FOREIGN KEY ("rentalId") REFERENCES "Rental"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HumanReview" ADD CONSTRAINT "HumanReview_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HumanReview" ADD CONSTRAINT "HumanReview_equipmentId_fkey" FOREIGN KEY ("equipmentId") REFERENCES "Equipment"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Alert" ADD CONSTRAINT "Alert_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE SET NULL ON UPDATE CASCADE;

