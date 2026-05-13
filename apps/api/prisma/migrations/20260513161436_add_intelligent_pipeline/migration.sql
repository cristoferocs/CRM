/*
  Warnings:

  - Made the column `value` on table `deals` required. This step will fail if there are existing NULL values in that column.
  - Added the required column `type` to the `pipelines` table without a default value. This is not possible if the table is not empty.
  - Added the required column `updatedAt` to the `pipelines` table without a default value. This is not possible if the table is not empty.

*/
-- CreateEnum
CREATE TYPE "PipelineType" AS ENUM ('SALES', 'PRODUCT', 'SERVICE', 'CAMPAIGN', 'PARTNERSHIP', 'RENEWAL', 'RECRUITMENT', 'CUSTOM');

-- CreateEnum
CREATE TYPE "PipelineVisibility" AS ENUM ('ALL', 'DEPARTMENT', 'ROLES');

-- CreateEnum
CREATE TYPE "StageType" AS ENUM ('REGULAR', 'ENTRY', 'NURTURING', 'DECISION', 'WON', 'LOST', 'ON_HOLD');

-- CreateEnum
CREATE TYPE "StageAgentTrigger" AS ENUM ('MANUAL', 'AUTO_ENTER', 'AUTO_ROTTING', 'SCHEDULED');

-- CreateEnum
CREATE TYPE "MovedByType" AS ENUM ('HUMAN', 'AGENT', 'AUTOMATION', 'SYSTEM');

-- DropIndex
DROP INDEX "deals_orgId_idx";

-- DropIndex
DROP INDEX "deals_ownerId_idx";

-- DropIndex
DROP INDEX "deals_stageId_idx";

-- DropIndex
DROP INDEX "pipeline_stages_pipelineId_idx";

-- DropIndex
DROP INDEX "pipelines_orgId_idx";

-- AlterTable (deals: update NULL values before making NOT NULL)
UPDATE "deals" SET "value" = 0 WHERE "value" IS NULL;

-- AlterTable
ALTER TABLE "deals" ADD COLUMN     "activeAgentSessionId" TEXT,
ADD COLUMN     "adId" TEXT,
ADD COLUMN     "agentHistory" JSONB NOT NULL DEFAULT '[]',
ADD COLUMN     "aiProbability" DOUBLE PRECISION,
ADD COLUMN     "isRotting" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "lastActivityAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN     "rottingDays" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "stageEnteredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN     "stageHistory" JSONB NOT NULL DEFAULT '[]',
ADD COLUMN     "utmCampaign" TEXT,
ADD COLUMN     "utmSource" TEXT,
ALTER COLUMN "value" SET NOT NULL,
ALTER COLUMN "value" SET DEFAULT 0;

-- AlterTable
ALTER TABLE "pipeline_stages" ADD COLUMN     "agentGoal" TEXT,
ADD COLUMN     "agentId" TEXT,
ADD COLUMN     "agentTrigger" "StageAgentTrigger" NOT NULL DEFAULT 'MANUAL',
ADD COLUMN     "avgDaysInStage" DOUBLE PRECISION,
ADD COLUMN     "description" TEXT,
ADD COLUMN     "maxDeals" INTEGER,
ADD COLUMN     "onEnterActions" JSONB NOT NULL DEFAULT '[]',
ADD COLUMN     "onExitActions" JSONB NOT NULL DEFAULT '[]',
ADD COLUMN     "onRottingActions" JSONB NOT NULL DEFAULT '[]',
ADD COLUMN     "requiredFields" JSONB NOT NULL DEFAULT '[]',
ADD COLUMN     "rottingDays" INTEGER,
ADD COLUMN     "type" "StageType" NOT NULL DEFAULT 'REGULAR',
ALTER COLUMN "color" SET DEFAULT '#7c5cfc';

-- AlterTable (pipelines: add type with temp default, populate, then keep as-is since we want 'SALES' default in prod)
ALTER TABLE "pipelines" ADD COLUMN     "allowedRoles" TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN     "color" TEXT NOT NULL DEFAULT '#7c5cfc',
ADD COLUMN     "context" JSONB,
ADD COLUMN     "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN     "currency" TEXT NOT NULL DEFAULT 'BRL',
ADD COLUMN     "customFieldSchema" JSONB NOT NULL DEFAULT '[]',
ADD COLUMN     "description" TEXT,
ADD COLUMN     "icon" TEXT,
ADD COLUMN     "isActive" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "rotting" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "rottingDays" INTEGER NOT NULL DEFAULT 7,
ADD COLUMN     "tags" TEXT[],
ADD COLUMN     "type" "PipelineType" NOT NULL DEFAULT 'SALES',
ADD COLUMN     "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN     "visibility" "PipelineVisibility" NOT NULL DEFAULT 'ALL',
ADD COLUMN     "winProbabilityAuto" BOOLEAN NOT NULL DEFAULT true;

-- Remove temporary defaults from pipelines (type and updatedAt are required fields managed by app)
ALTER TABLE "pipelines" ALTER COLUMN "type" DROP DEFAULT;
ALTER TABLE "pipelines" ALTER COLUMN "updatedAt" DROP DEFAULT;

-- CreateTable
CREATE TABLE "deal_stage_movements" (
    "id" TEXT NOT NULL,
    "dealId" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "fromStageId" TEXT,
    "toStageId" TEXT NOT NULL,
    "fromStageName" TEXT,
    "toStageName" TEXT NOT NULL,
    "movedBy" "MovedByType" NOT NULL,
    "userId" TEXT,
    "agentId" TEXT,
    "agentSessionId" TEXT,
    "reason" TEXT,
    "dataCollected" JSONB,
    "triggerEvent" TEXT,
    "daysInPreviousStage" DOUBLE PRECISION,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "deal_stage_movements_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "deal_stage_movements_dealId_idx" ON "deal_stage_movements"("dealId");

-- CreateIndex
CREATE INDEX "deal_stage_movements_orgId_createdAt_idx" ON "deal_stage_movements"("orgId", "createdAt");

-- CreateIndex
CREATE INDEX "deals_orgId_pipelineId_stageId_idx" ON "deals"("orgId", "pipelineId", "stageId");

-- CreateIndex
CREATE INDEX "deals_orgId_ownerId_idx" ON "deals"("orgId", "ownerId");

-- CreateIndex
CREATE INDEX "deals_orgId_isRotting_idx" ON "deals"("orgId", "isRotting");

-- CreateIndex
CREATE INDEX "pipeline_stages_pipelineId_order_idx" ON "pipeline_stages"("pipelineId", "order");

-- CreateIndex
CREATE INDEX "pipelines_orgId_isActive_idx" ON "pipelines"("orgId", "isActive");

-- RenameForeignKey
ALTER TABLE "pipeline_stages" RENAME CONSTRAINT "pipeline_stages_pipelineId_fkey" TO "stage_pipeline_fk";

-- AddForeignKey
ALTER TABLE "pipeline_stages" ADD CONSTRAINT "pipeline_stages_agentId_fkey" FOREIGN KEY ("agentId") REFERENCES "ai_agents"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "deal_stage_movements" ADD CONSTRAINT "deal_stage_movements_dealId_fkey" FOREIGN KEY ("dealId") REFERENCES "deals"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "deal_stage_movements" ADD CONSTRAINT "deal_stage_movements_fromStageId_fkey" FOREIGN KEY ("fromStageId") REFERENCES "pipeline_stages"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "deal_stage_movements" ADD CONSTRAINT "deal_stage_movements_toStageId_fkey" FOREIGN KEY ("toStageId") REFERENCES "pipeline_stages"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
