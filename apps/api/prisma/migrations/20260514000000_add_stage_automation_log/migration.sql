-- CreateTable
CREATE TABLE "stage_automation_logs" (
    "id" TEXT NOT NULL,
    "dealId" TEXT NOT NULL,
    "stageId" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "ruleId" TEXT NOT NULL,
    "ruleName" TEXT NOT NULL,
    "trigger" TEXT NOT NULL,
    "status" "AutomationLogStatus" NOT NULL,
    "executedActions" JSONB NOT NULL DEFAULT '[]',
    "error" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "stage_automation_logs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "stage_automation_logs_dealId_createdAt_idx" ON "stage_automation_logs"("dealId", "createdAt");

-- CreateIndex
CREATE INDEX "stage_automation_logs_stageId_createdAt_idx" ON "stage_automation_logs"("stageId", "createdAt");

-- CreateIndex
CREATE INDEX "stage_automation_logs_orgId_createdAt_idx" ON "stage_automation_logs"("orgId", "createdAt");

-- AddForeignKey
ALTER TABLE "stage_automation_logs" ADD CONSTRAINT "stage_automation_logs_dealId_fkey" FOREIGN KEY ("dealId") REFERENCES "deals"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stage_automation_logs" ADD CONSTRAINT "stage_automation_logs_stageId_fkey" FOREIGN KEY ("stageId") REFERENCES "pipeline_stages"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stage_automation_logs" ADD CONSTRAINT "stage_automation_logs_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
