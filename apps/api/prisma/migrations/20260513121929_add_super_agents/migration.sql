/*
  Warnings:

  - You are about to drop the column `messagesHandled` on the `ai_agent_sessions` table. All the data in the column will be lost.
  - The `status` column on the `ai_agent_sessions` table would be dropped and recreated. This will lead to data loss if there is data in the column.
  - You are about to drop the column `tools` on the `ai_agents` table. All the data in the column will be lost.
  - The `status` column on the `ai_agents` table would be dropped and recreated. This will lead to data loss if there is data in the column.
  - Added the required column `goal` to the `ai_agents` table without a default value. This is not possible if the table is not empty.
  - Changed the type of `type` on the `ai_agents` table. No cast exists, the column would be dropped and recreated, which cannot be done if there is data, since the column is required.
  - Added the required column `orgId` to the `automation_logs` table without a default value. This is not possible if the table is not empty.

*/
-- CreateEnum
CREATE TYPE "AgentType" AS ENUM ('SALES', 'SUPPORT', 'SCHEDULER', 'QUALIFICATION', 'COLLECTIONS', 'ONBOARDING', 'CUSTOM');

-- CreateEnum
CREATE TYPE "AgentStatus" AS ENUM ('DRAFT', 'LEARNING', 'REVIEW', 'READY', 'ACTIVE', 'PAUSED', 'RETIRED');

-- CreateEnum
CREATE TYPE "AgentPhase" AS ENUM ('SETUP', 'OBSERVATION', 'LEARNING', 'VALIDATION', 'PRODUCTION');

-- CreateEnum
CREATE TYPE "SessionStatus" AS ENUM ('ACTIVE', 'THINKING', 'WAITING_USER', 'HANDOFF', 'ENDED');

-- DropIndex
DROP INDEX "ai_agent_sessions_agentId_idx";

-- AlterTable
ALTER TABLE "ai_agent_sessions" DROP COLUMN "messagesHandled",
ADD COLUMN     "collectedData" JSONB NOT NULL DEFAULT '{}',
ADD COLUMN     "completedSteps" JSONB NOT NULL DEFAULT '[]',
ADD COLUMN     "currentStep" TEXT,
ADD COLUMN     "goalAchieved" BOOLEAN,
ADD COLUMN     "handoffData" JSONB,
ADD COLUMN     "intent" TEXT,
ADD COLUMN     "intentConfidence" DOUBLE PRECISION,
ADD COLUMN     "lastActivityAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN     "outcome" TEXT,
ADD COLUMN     "pendingQuestions" JSONB NOT NULL DEFAULT '[]',
ADD COLUMN     "planSteps" JSONB NOT NULL DEFAULT '[]',
ADD COLUMN     "turnCount" INTEGER NOT NULL DEFAULT 0,
DROP COLUMN "status",
ADD COLUMN     "status" "SessionStatus" NOT NULL DEFAULT 'ACTIVE';

-- AlterTable
ALTER TABLE "ai_agents" DROP COLUMN "tools",
ADD COLUMN     "confidenceThreshold" DOUBLE PRECISION NOT NULL DEFAULT 0.75,
ADD COLUMN     "decisionRules" JSONB,
ADD COLUMN     "enabledTools" JSONB NOT NULL DEFAULT '{}',
ADD COLUMN     "flowTemplate" JSONB,
ADD COLUMN     "goal" TEXT NOT NULL,
ADD COLUMN     "learnedFromCount" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "learningCompletedAt" TIMESTAMP(3),
ADD COLUMN     "learningConfig" JSONB NOT NULL DEFAULT '{}',
ADD COLUMN     "maxTurnsBeforeHuman" INTEGER NOT NULL DEFAULT 20,
ADD COLUMN     "minimumLearningSample" INTEGER NOT NULL DEFAULT 30,
ADD COLUMN     "personality" JSONB NOT NULL DEFAULT '{}',
ADD COLUMN     "phase" "AgentPhase" NOT NULL DEFAULT 'SETUP',
ADD COLUMN     "requiredDataPoints" JSONB NOT NULL DEFAULT '[]',
ADD COLUMN     "successCriteria" JSONB NOT NULL DEFAULT '{}',
DROP COLUMN "type",
ADD COLUMN     "type" "AgentType" NOT NULL,
DROP COLUMN "status",
ADD COLUMN     "status" "AgentStatus" NOT NULL DEFAULT 'DRAFT',
ALTER COLUMN "provider" DROP NOT NULL,
ALTER COLUMN "provider" DROP DEFAULT,
ALTER COLUMN "temperature" SET DEFAULT 0.4,
ALTER COLUMN "isActive" SET DEFAULT false;

-- AlterTable
ALTER TABLE "automation_logs" ADD COLUMN     "orgId" TEXT NOT NULL;

-- DropEnum
DROP TYPE "AIAgentSessionStatus";

-- DropEnum
DROP TYPE "AIAgentStatus";

-- DropEnum
DROP TYPE "AIAgentType";

-- CreateTable
CREATE TABLE "ai_agent_turns" (
    "id" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "role" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "toolName" TEXT,
    "toolParams" JSONB,
    "toolResult" TEXT,
    "tokensUsed" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ai_agent_turns_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "agent_flow_versions" (
    "id" TEXT NOT NULL,
    "agentId" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "flowTemplate" JSONB NOT NULL,
    "notes" TEXT,
    "approvedBy" TEXT,
    "approvedAt" TIMESTAMP(3),
    "isActive" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "agent_flow_versions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "agent_learning_jobs" (
    "id" TEXT NOT NULL,
    "agentId" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "conversationIds" TEXT[],
    "analyzedCount" INTEGER NOT NULL DEFAULT 0,
    "result" JSONB,
    "error" TEXT,
    "startedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "agent_learning_jobs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ai_agent_turns_sessionId_idx" ON "ai_agent_turns"("sessionId");

-- CreateIndex
CREATE INDEX "agent_flow_versions_agentId_idx" ON "agent_flow_versions"("agentId");

-- CreateIndex
CREATE UNIQUE INDEX "agent_flow_versions_agentId_version_key" ON "agent_flow_versions"("agentId", "version");

-- CreateIndex
CREATE INDEX "agent_learning_jobs_agentId_idx" ON "agent_learning_jobs"("agentId");

-- CreateIndex
CREATE INDEX "agent_learning_jobs_orgId_idx" ON "agent_learning_jobs"("orgId");

-- CreateIndex
CREATE INDEX "ai_agent_sessions_agentId_status_idx" ON "ai_agent_sessions"("agentId", "status");

-- CreateIndex
CREATE INDEX "automation_logs_orgId_idx" ON "automation_logs"("orgId");

-- CreateIndex
CREATE INDEX "messages_conversationId_sentAt_idx" ON "messages"("conversationId", "sentAt");

-- CreateIndex
CREATE INDEX "users_branchId_idx" ON "users"("branchId");

-- AddForeignKey
ALTER TABLE "automation_logs" ADD CONSTRAINT "automation_logs_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ai_agent_turns" ADD CONSTRAINT "ai_agent_turns_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "ai_agent_sessions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "agent_flow_versions" ADD CONSTRAINT "agent_flow_versions_agentId_fkey" FOREIGN KEY ("agentId") REFERENCES "ai_agents"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "agent_learning_jobs" ADD CONSTRAINT "agent_learning_jobs_agentId_fkey" FOREIGN KEY ("agentId") REFERENCES "ai_agents"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "agent_learning_jobs" ADD CONSTRAINT "agent_learning_jobs_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
