-- One id per scheduled post (fan-out siblings share it) and one notice row after the ops DM is sent.
ALTER TABLE "ScheduledMessage" ADD COLUMN IF NOT EXISTS "fanOutBatchId" TEXT;

CREATE INDEX IF NOT EXISTS "ScheduledMessage_fanOutBatchId_idx" ON "ScheduledMessage"("fanOutBatchId");

CREATE TABLE IF NOT EXISTS "PostStatusNotice" (
  "id" TEXT NOT NULL,
  "batchId" TEXT NOT NULL,
  "postedAt" TIMESTAMP(3),
  "body" TEXT NOT NULL DEFAULT '',
  "error" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "PostStatusNotice_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "PostStatusNotice_batchId_key" ON "PostStatusNotice"("batchId");
