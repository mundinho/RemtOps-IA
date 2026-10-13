-- CreateEnum
CREATE TYPE "ToolCallSource" AS ENUM ('LLM', 'POLICY', 'AGENT');

-- AlterTable
ALTER TABLE "AgentToolCall" ADD COLUMN     "source" "ToolCallSource" NOT NULL DEFAULT 'AGENT';
