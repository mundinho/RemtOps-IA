-- AlterEnum
ALTER TYPE "AgentName" ADD VALUE 'APPROVAL';

-- AlterTable
ALTER TABLE "HumanReview" ADD COLUMN     "resolvedByAgent" "AgentName";

-- AlterTable
ALTER TABLE "Rental" ADD COLUMN     "approvalConditions" TEXT[] DEFAULT ARRAY[]::TEXT[];

