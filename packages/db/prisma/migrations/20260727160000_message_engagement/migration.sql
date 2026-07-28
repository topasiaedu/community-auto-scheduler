-- CreateTable: engagement tracker foundation (reactions + quoted replies)
CREATE TABLE IF NOT EXISTS "MessageReaction" (
    "id" TEXT NOT NULL,
    "scheduledMessageId" TEXT NOT NULL,
    "reactorJid" TEXT NOT NULL,
    "emoji" TEXT NOT NULL,
    "waReactionId" TEXT,
    "reactedAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MessageReaction_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "MessageReply" (
    "id" TEXT NOT NULL,
    "scheduledMessageId" TEXT NOT NULL,
    "replyWaMessageId" TEXT NOT NULL,
    "replierJid" TEXT NOT NULL,
    "bodyPreview" TEXT,
    "repliedAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MessageReply_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "MessageReaction_scheduledMessageId_reactorJid_key"
  ON "MessageReaction"("scheduledMessageId", "reactorJid");

CREATE INDEX IF NOT EXISTS "MessageReaction_scheduledMessageId_idx"
  ON "MessageReaction"("scheduledMessageId");

CREATE UNIQUE INDEX IF NOT EXISTS "MessageReply_scheduledMessageId_replyWaMessageId_key"
  ON "MessageReply"("scheduledMessageId", "replyWaMessageId");

CREATE INDEX IF NOT EXISTS "MessageReply_scheduledMessageId_idx"
  ON "MessageReply"("scheduledMessageId");

-- AddForeignKey
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'MessageReaction_scheduledMessageId_fkey'
  ) THEN
    ALTER TABLE "MessageReaction"
      ADD CONSTRAINT "MessageReaction_scheduledMessageId_fkey"
      FOREIGN KEY ("scheduledMessageId") REFERENCES "ScheduledMessage"("id")
      ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'MessageReply_scheduledMessageId_fkey'
  ) THEN
    ALTER TABLE "MessageReply"
      ADD CONSTRAINT "MessageReply_scheduledMessageId_fkey"
      FOREIGN KEY ("scheduledMessageId") REFERENCES "ScheduledMessage"("id")
      ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;
