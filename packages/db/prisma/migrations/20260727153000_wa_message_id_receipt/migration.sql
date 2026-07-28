-- AlterTable: store WhatsApp message ids for receipt-gated SENT + future engagement tracker
ALTER TABLE "ScheduledMessage" ADD COLUMN IF NOT EXISTS "waMessageId" TEXT;
ALTER TABLE "ScheduledMessage" ADD COLUMN IF NOT EXISTS "waAcceptedAt" TIMESTAMP(3);
ALTER TABLE "ScheduledMessage" ADD COLUMN IF NOT EXISTS "waAckedAt" TIMESTAMP(3);

-- CreateIndex
CREATE INDEX IF NOT EXISTS "ScheduledMessage_waMessageId_idx" ON "ScheduledMessage"("waMessageId");
