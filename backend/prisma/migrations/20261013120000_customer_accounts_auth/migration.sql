-- CreateEnum
CREATE TYPE "AccountStatus" AS ENUM ('PENDING', 'ACTIVE', 'REJECTED');

-- AlterEnum
ALTER TYPE "AgentName" ADD VALUE 'ONBOARDING';

-- AlterTable
ALTER TABLE "Customer" ADD COLUMN     "accountDecisionReason" TEXT,
ADD COLUMN     "accountRequestedAt" TIMESTAMP(3),
ADD COLUMN     "accountStatus" "AccountStatus",
ADD COLUMN     "loginEmail" TEXT,
ADD COLUMN     "passwordHash" TEXT;

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "isActive" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "lastLoginAt" TIMESTAMP(3),
ADD COLUMN     "passwordHash" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "Customer_loginEmail_key" ON "Customer"("loginEmail");

