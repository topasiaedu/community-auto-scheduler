-- One Telegram Community Reminder board per campaign.
CREATE TABLE IF NOT EXISTS "CampaignReminderBoard" (
  "campaignId" TEXT NOT NULL,
  "chatId" TEXT NOT NULL,
  "messageId" INTEGER,
  "lines" JSONB NOT NULL,
  "error" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "CampaignReminderBoard_pkey" PRIMARY KEY ("campaignId")
);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'CampaignReminderBoard_campaignId_fkey'
  ) THEN
    ALTER TABLE "CampaignReminderBoard"
      ADD CONSTRAINT "CampaignReminderBoard_campaignId_fkey"
      FOREIGN KEY ("campaignId") REFERENCES "Campaign"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;
