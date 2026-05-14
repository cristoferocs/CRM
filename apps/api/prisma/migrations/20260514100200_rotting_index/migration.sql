-- Supports the rotting-sweep query in PipelineRepository.checkRottingDeals
-- (stageId, isActive, isRotting, lastActivityAt < threshold).
CREATE INDEX "deals_stageId_isActive_isRotting_lastActivityAt_idx"
  ON "deals" ("stageId", "isActive", "isRotting", "lastActivityAt");
