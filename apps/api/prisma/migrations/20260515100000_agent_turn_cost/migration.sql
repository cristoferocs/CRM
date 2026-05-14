-- Track LLM cost per turn so we can roll up daily / per-agent spend
-- without re-querying provider billing APIs.
ALTER TABLE "ai_agent_turns" ADD COLUMN "inputTokens" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "ai_agent_turns" ADD COLUMN "outputTokens" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "ai_agent_turns" ADD COLUMN "model" TEXT;
ALTER TABLE "ai_agent_turns" ADD COLUMN "costUsd" DECIMAL(12, 6) NOT NULL DEFAULT 0;
ALTER TABLE "ai_agent_turns" ADD COLUMN "durationMs" INTEGER;

-- Supports `createdAt` range queries for cost rollups.
CREATE INDEX "ai_agent_turns_createdAt_idx" ON "ai_agent_turns" ("createdAt");
