-- Idempotency: prevent duplicate inbound webhook messages (same external provider id within a conversation).
--
-- IMPORTANT: This migration will FAIL if duplicate (conversationId, externalId) pairs already exist.
-- If that happens in production, run the dedupe block below manually (or as a separate migration) BEFORE
-- re-running this one. The dedupe keeps the earliest-arriving row.
--
-- WITH ranked AS (
--   SELECT id, ROW_NUMBER() OVER (
--     PARTITION BY "conversationId", "externalId"
--     ORDER BY "sentAt" ASC, id ASC
--   ) AS rn
--   FROM messages
--   WHERE "externalId" IS NOT NULL
-- )
-- DELETE FROM messages WHERE id IN (SELECT id FROM ranked WHERE rn > 1);

-- NULL values are treated as DISTINCT under default Postgres semantics, so this constraint
-- does NOT collide on outbound/internal messages that have no externalId.
CREATE UNIQUE INDEX "messages_conversation_externalId_unique"
  ON "messages" ("conversationId", "externalId");
