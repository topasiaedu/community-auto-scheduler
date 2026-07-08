-- P7 Phase 1: campaign scheduler schema, legacy backfill, reminder template seed.

-- CreateEnum
CREATE TYPE "OperatorKind" AS ENUM ('REMINDER', 'VALUE');
CREATE TYPE "ValueFormat" AS ENUM ('IMAGE_CAPTION', 'TEXT_ONLY', 'POLL');
CREATE TYPE "ReminderFormat" AS ENUM ('IMAGE', 'TEXT', 'STICKER');
CREATE TYPE "ScheduleRuleKind" AS ENUM ('WEBINAR_DATE_OFFSET', 'EVENT_START_OFFSET');

-- AlterTable
ALTER TABLE "Project" ADD COLUMN "sopUrl" TEXT;
ALTER TABLE "Project" ADD COLUMN "campaignNote" TEXT;

-- CreateTable
CREATE TABLE "Campaign" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "webinarDate" DATE NOT NULL,
    "eventStartTimeMyt" TEXT NOT NULL,
    "reminderGroupJid" TEXT NOT NULL,
    "reminderGroupName" TEXT NOT NULL,
    "customValues" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Campaign_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ReminderTemplate" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "slotKey" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "reminderFormat" "ReminderFormat" NOT NULL,
    "mediaUrl" TEXT,
    "stickerUrl" TEXT,
    "bodyTemplate" TEXT,
    "scheduleRuleKind" "ScheduleRuleKind" NOT NULL,
    "dayOffset" INTEGER,
    "clockTimeMyt" TEXT,
    "startOffsetMinutes" INTEGER,
    "sortOrder" INTEGER NOT NULL,

    CONSTRAINT "ReminderTemplate_pkey" PRIMARY KEY ("id")
);

-- AlterTable
ALTER TABLE "ScheduledMessage" ADD COLUMN "operatorKind" "OperatorKind";
ALTER TABLE "ScheduledMessage" ADD COLUMN "valueFormat" "ValueFormat";
ALTER TABLE "ScheduledMessage" ADD COLUMN "reminderFormat" "ReminderFormat";
ALTER TABLE "ScheduledMessage" ADD COLUMN "reminderTemplateId" TEXT;
ALTER TABLE "ScheduledMessage" ADD COLUMN "campaignId" TEXT;
ALTER TABLE "ScheduledMessage" ADD COLUMN "stickerUrl" TEXT;

-- Backfill legacy ScheduledMessage rows
UPDATE "ScheduledMessage"
SET
    "operatorKind" = 'VALUE',
    "valueFormat" = 'POLL'
WHERE "type" = 'POLL';

UPDATE "ScheduledMessage"
SET
    "operatorKind" = 'VALUE',
    "valueFormat" = CASE
        WHEN "imageUrl" IS NOT NULL AND btrim("imageUrl") <> '' THEN 'IMAGE_CAPTION'::"ValueFormat"
        ELSE 'TEXT_ONLY'::"ValueFormat"
    END
WHERE "type" = 'POST';

-- CreateIndex
CREATE INDEX "Campaign_projectId_idx" ON "Campaign"("projectId");
CREATE INDEX "ReminderTemplate_projectId_idx" ON "ReminderTemplate"("projectId");
CREATE UNIQUE INDEX "ReminderTemplate_projectId_slotKey_key" ON "ReminderTemplate"("projectId", "slotKey");
CREATE INDEX "ScheduledMessage_campaignId_idx" ON "ScheduledMessage"("campaignId");

-- AddForeignKey
ALTER TABLE "Campaign" ADD CONSTRAINT "Campaign_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ReminderTemplate" ADD CONSTRAINT "ReminderTemplate_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ScheduledMessage" ADD CONSTRAINT "ScheduledMessage_reminderTemplateId_fkey" FOREIGN KEY ("reminderTemplateId") REFERENCES "ReminderTemplate"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "ScheduledMessage" ADD CONSTRAINT "ScheduledMessage_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "Campaign"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Seed six ReminderTemplate slots for every existing project (idempotent).
INSERT INTO "ReminderTemplate" (
    "id",
    "projectId",
    "slotKey",
    "name",
    "reminderFormat",
    "bodyTemplate",
    "scheduleRuleKind",
    "dayOffset",
    "clockTimeMyt",
    "startOffsetMinutes",
    "sortOrder"
)
SELECT
    p."id" || '-' || s."slotKey",
    p."id",
    s."slotKey",
    s."name",
    s."reminderFormat"::"ReminderFormat",
    s."bodyTemplate",
    s."scheduleRuleKind"::"ScheduleRuleKind",
    s."dayOffset",
    s."clockTimeMyt",
    s."startOffsetMinutes",
    s."sortOrder"
FROM "Project" p
CROSS JOIN (
    VALUES
        (
            'welcome',
            'Welcome',
            'IMAGE',
            E'Hi! Welcome to our workshop community 🎉\n\nOur next session is on {{workshopDay}}, {{workshopDate}} at {{workshopTime}}.\n\nZoom link: {{zoomLink}}',
            'WEBINAR_DATE_OFFSET',
            -4,
            '15:00',
            NULL::INTEGER,
            1
        ),
        (
            'countdown_2d',
            '2-Day Countdown',
            'IMAGE',
            E'⏰ 2 days to go!\n\n{{workshopDay}}, {{workshopDate}} @ {{workshopTime}}',
            'WEBINAR_DATE_OFFSET',
            -2,
            '15:00',
            NULL::INTEGER,
            2
        ),
        (
            'countdown_1d',
            '1-Day Countdown',
            'IMAGE',
            E'⏰ Tomorrow!\n\nJoin us at {{workshopTime}}: {{zoomLink}}',
            'WEBINAR_DATE_OFFSET',
            -1,
            '20:00',
            NULL::INTEGER,
            3
        ),
        (
            'starting_soon',
            'Starting Soon',
            'IMAGE',
            E'Starting soon! Today {{sessionDate}}, {{sessionTime}}\n\nJoin: {{zoomLink}}\nMeeting ID: {{zoomId}}\nPasscode: {{zoomPasscode}}',
            'WEBINAR_DATE_OFFSET',
            0,
            '11:00',
            NULL::INTEGER,
            4
        ),
        (
            'live_now',
            'LIVE NOW',
            'TEXT',
            E'🔴 We are LIVE! Join now: {{zoomLink}}',
            'EVENT_START_OFFSET',
            NULL::INTEGER,
            NULL,
            -2,
            5
        ),
        (
            'post_live_sticker',
            'Post-Live Sticker',
            'STICKER',
            NULL,
            'EVENT_START_OFFSET',
            NULL::INTEGER,
            NULL,
            18,
            6
        )
) AS s(
    "slotKey",
    "name",
    "reminderFormat",
    "bodyTemplate",
    "scheduleRuleKind",
    "dayOffset",
    "clockTimeMyt",
    "startOffsetMinutes",
    "sortOrder"
)
ON CONFLICT ("projectId", "slotKey") DO NOTHING;
