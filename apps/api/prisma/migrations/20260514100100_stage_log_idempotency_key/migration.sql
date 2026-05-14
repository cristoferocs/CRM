-- Stage automation idempotency: lets the worker no-op on retries after a crash,
-- preventing duplicate side effects (send_email, send_whatsapp, etc).
ALTER TABLE "stage_automation_logs" ADD COLUMN "idempotencyKey" TEXT;
CREATE UNIQUE INDEX "stage_automation_logs_idempotencyKey_key"
  ON "stage_automation_logs" ("idempotencyKey");
