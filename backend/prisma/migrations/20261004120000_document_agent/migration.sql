-- AlterEnum
ALTER TYPE "AgentName" ADD VALUE 'DOCUMENTS';

-- AlterEnum
ALTER TYPE "WorkflowStep" ADD VALUE 'DOCUMENT_CHECK';

-- AlterTable
ALTER TABLE "RentalDocument" ADD COLUMN     "extractedData" JSONB,
ADD COLUMN     "verificationNotes" TEXT;

