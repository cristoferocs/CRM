/*
  Warnings:

  - Changed the type of `status` on the `automation_logs` table. No cast exists, the column would be dropped and recreated, which cannot be done if there is data, since the column is required.
  - Added the required column `triggerType` to the `automations` table without a default value. This is not possible if the table is not empty.

*/
-- CreateEnum
CREATE TYPE "AutomationTriggerEnum" AS ENUM ('CONTACT_CREATED', 'CONTACT_UPDATED', 'CONTACT_TAG_ADDED', 'LEAD_SCORE_CHANGED', 'DEAL_CREATED', 'DEAL_STAGE_CHANGED', 'DEAL_WON', 'DEAL_LOST', 'DEAL_ROTTING', 'MESSAGE_RECEIVED', 'MESSAGE_KEYWORD', 'CONVERSATION_OPENED', 'CONVERSATION_RESOLVED', 'TIME_DELAY', 'SCHEDULED', 'DATE_FIELD', 'PAYMENT_RECEIVED', 'PAYMENT_OVERDUE', 'PAYMENT_FAILED', 'AGENT_HANDOFF', 'AGENT_GOAL_ACHIEVED');

-- CreateEnum
CREATE TYPE "NotificationType" AS ENUM ('MENTION', 'DEAL_ASSIGNED', 'DEAL_MOVED', 'COMMENT_REPLY', 'AGENT_HANDOFF', 'PAYMENT_RECEIVED', 'TASK_DUE', 'AUTOMATION_FAILED', 'LEAD_HOT', 'ACHIEVEMENT_UNLOCKED');

-- CreateEnum
CREATE TYPE "DocumentType" AS ENUM ('PROPOSAL', 'CONTRACT', 'NDA', 'INVOICE', 'ONBOARDING', 'OTHER');

-- CreateEnum
CREATE TYPE "DocumentStatus" AS ENUM ('DRAFT', 'SENT', 'PARTIALLY_SIGNED', 'SIGNED', 'EXPIRED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "AchievementType" AS ENUM ('FIRST_DEAL_WON', 'DEAL_STREAK', 'REVENUE_MILESTONE', 'FAST_CLOSER', 'RESPONSE_MASTER', 'OBJECTION_CRUSHER', 'AI_DELEGATOR', 'TOP_PERFORMER', 'COMEBACK_KID');

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "AgentType" ADD VALUE 'CUSTOMER_SUCCESS';
ALTER TYPE "AgentType" ADD VALUE 'RETENTION';
ALTER TYPE "AgentType" ADD VALUE 'UPSELL';

-- DropIndex
DROP INDEX "automation_logs_automationId_idx";

-- DropIndex
DROP INDEX "automation_logs_orgId_idx";

-- DropIndex
DROP INDEX "automations_orgId_idx";

-- AlterTable
ALTER TABLE "automation_logs" ADD COLUMN     "conversationId" TEXT,
ADD COLUMN     "duration" INTEGER,
ADD COLUMN     "nodesExecuted" JSONB NOT NULL DEFAULT '[]',
ADD COLUMN     "triggerData" JSONB NOT NULL DEFAULT '{}';
ALTER TABLE "automation_logs" ALTER COLUMN "status" DROP DEFAULT;
ALTER TABLE "automation_logs" ALTER COLUMN "status" TYPE TEXT USING status::TEXT;

-- AlterTable
ALTER TABLE "automations" ADD COLUMN     "edges" JSONB NOT NULL DEFAULT '[]',
ADD COLUMN     "executionCount" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "failureCount" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "lastExecutedAt" TIMESTAMP(3),
ADD COLUMN     "nodes" JSONB NOT NULL DEFAULT '[]',
ADD COLUMN     "successCount" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "triggerConfig" JSONB NOT NULL DEFAULT '{}',
ADD COLUMN     "triggerType" "AutomationTriggerEnum" NOT NULL DEFAULT 'CONTACT_CREATED',
ALTER COLUMN "isActive" SET DEFAULT false,
ALTER COLUMN "trigger" SET DEFAULT '{}';

-- AlterTable
ALTER TABLE "contacts" ADD COLUMN     "lastScoredAt" TIMESTAMP(3),
ADD COLUMN     "leadScore" INTEGER,
ADD COLUMN     "leadTemperature" TEXT,
ADD COLUMN     "scoreHistory" JSONB NOT NULL DEFAULT '[]';

-- CreateTable
CREATE TABLE "lead_scoring_configs" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "demographicRules" JSONB NOT NULL DEFAULT '[]',
    "behavioralRules" JSONB NOT NULL DEFAULT '[]',
    "aiScoringEnabled" BOOLEAN NOT NULL DEFAULT true,
    "aiWeight" DOUBLE PRECISION NOT NULL DEFAULT 0.4,
    "hotThreshold" INTEGER NOT NULL DEFAULT 80,
    "warmThreshold" INTEGER NOT NULL DEFAULT 50,
    "coldThreshold" INTEGER NOT NULL DEFAULT 0,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "lead_scoring_configs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "comments" (
    "id" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "mentions" TEXT[],
    "isResolved" BOOLEAN NOT NULL DEFAULT false,
    "isInternal" BOOLEAN NOT NULL DEFAULT true,
    "dealId" TEXT,
    "contactId" TEXT,
    "conversationId" TEXT,
    "orgId" TEXT NOT NULL,
    "authorId" TEXT NOT NULL,
    "parentId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "comments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "notifications" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "type" "NotificationType" NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "metadata" JSONB NOT NULL DEFAULT '{}',
    "isRead" BOOLEAN NOT NULL DEFAULT false,
    "readAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "notifications_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "documents" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "type" "DocumentType" NOT NULL,
    "status" "DocumentStatus" NOT NULL DEFAULT 'DRAFT',
    "fileUrl" TEXT,
    "fileSize" INTEGER,
    "mimeType" TEXT,
    "version" INTEGER NOT NULL DEFAULT 1,
    "templateId" TEXT,
    "variables" JSONB NOT NULL DEFAULT '{}',
    "signers" JSONB NOT NULL DEFAULT '[]',
    "signedAt" TIMESTAMP(3),
    "dealId" TEXT,
    "contactId" TEXT,
    "orgId" TEXT NOT NULL,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "expiresAt" TIMESTAMP(3),

    CONSTRAINT "documents_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "document_versions" (
    "id" TEXT NOT NULL,
    "documentId" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "fileUrl" TEXT NOT NULL,
    "createdById" TEXT NOT NULL,
    "changes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "document_versions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "document_templates" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "type" "DocumentType" NOT NULL,
    "content" TEXT NOT NULL,
    "variables" JSONB NOT NULL DEFAULT '[]',
    "thumbnail" TEXT,
    "orgId" TEXT NOT NULL,
    "isPublic" BOOLEAN NOT NULL DEFAULT false,
    "usageCount" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "document_templates_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "achievements" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "type" "AchievementType" NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "icon" TEXT NOT NULL,
    "points" INTEGER NOT NULL,
    "unlockedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "metadata" JSONB NOT NULL DEFAULT '{}',

    CONSTRAINT "achievements_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "goals" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "userId" TEXT,
    "title" TEXT NOT NULL,
    "metric" TEXT NOT NULL,
    "target" DOUBLE PRECISION NOT NULL,
    "current" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "period" TEXT NOT NULL,
    "startDate" TIMESTAMP(3) NOT NULL,
    "endDate" TIMESTAMP(3) NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "goals_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "zapier_subscriptions" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "event" TEXT NOT NULL,
    "targetUrl" TEXT NOT NULL,
    "provider" TEXT NOT NULL DEFAULT 'zapier',
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "zapier_subscriptions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "lead_scoring_configs_orgId_key" ON "lead_scoring_configs"("orgId");

-- CreateIndex
CREATE INDEX "comments_dealId_idx" ON "comments"("dealId");

-- CreateIndex
CREATE INDEX "comments_contactId_idx" ON "comments"("contactId");

-- CreateIndex
CREATE INDEX "comments_orgId_createdAt_idx" ON "comments"("orgId", "createdAt");

-- CreateIndex
CREATE INDEX "notifications_userId_isRead_idx" ON "notifications"("userId", "isRead");

-- CreateIndex
CREATE INDEX "notifications_userId_createdAt_idx" ON "notifications"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "notifications_orgId_idx" ON "notifications"("orgId");

-- CreateIndex
CREATE INDEX "documents_orgId_type_idx" ON "documents"("orgId", "type");

-- CreateIndex
CREATE INDEX "documents_dealId_idx" ON "documents"("dealId");

-- CreateIndex
CREATE INDEX "document_versions_documentId_idx" ON "document_versions"("documentId");

-- CreateIndex
CREATE INDEX "document_templates_orgId_idx" ON "document_templates"("orgId");

-- CreateIndex
CREATE INDEX "achievements_userId_idx" ON "achievements"("userId");

-- CreateIndex
CREATE INDEX "achievements_orgId_type_idx" ON "achievements"("orgId", "type");

-- CreateIndex
CREATE INDEX "goals_orgId_isActive_idx" ON "goals"("orgId", "isActive");

-- CreateIndex
CREATE INDEX "zapier_subscriptions_orgId_event_idx" ON "zapier_subscriptions"("orgId", "event");

-- CreateIndex
CREATE INDEX "automation_logs_automationId_createdAt_idx" ON "automation_logs"("automationId", "createdAt");

-- CreateIndex
CREATE INDEX "automation_logs_orgId_createdAt_idx" ON "automation_logs"("orgId", "createdAt");

-- CreateIndex
CREATE INDEX "automations_orgId_isActive_idx" ON "automations"("orgId", "isActive");

-- CreateIndex
CREATE INDEX "contacts_orgId_leadScore_idx" ON "contacts"("orgId", "leadScore");

-- AddForeignKey
ALTER TABLE "lead_scoring_configs" ADD CONSTRAINT "lead_scoring_configs_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "comments" ADD CONSTRAINT "comments_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "comments" ADD CONSTRAINT "comments_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "comments" ADD CONSTRAINT "comments_dealId_fkey" FOREIGN KEY ("dealId") REFERENCES "deals"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "comments" ADD CONSTRAINT "comments_contactId_fkey" FOREIGN KEY ("contactId") REFERENCES "contacts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "comments" ADD CONSTRAINT "comments_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "comments"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "documents" ADD CONSTRAINT "documents_dealId_fkey" FOREIGN KEY ("dealId") REFERENCES "deals"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "documents" ADD CONSTRAINT "documents_contactId_fkey" FOREIGN KEY ("contactId") REFERENCES "contacts"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "documents" ADD CONSTRAINT "documents_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "document_versions" ADD CONSTRAINT "document_versions_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "documents"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "document_templates" ADD CONSTRAINT "document_templates_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "achievements" ADD CONSTRAINT "achievements_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "achievements" ADD CONSTRAINT "achievements_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "goals" ADD CONSTRAINT "goals_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "goals" ADD CONSTRAINT "goals_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "zapier_subscriptions" ADD CONSTRAINT "zapier_subscriptions_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
