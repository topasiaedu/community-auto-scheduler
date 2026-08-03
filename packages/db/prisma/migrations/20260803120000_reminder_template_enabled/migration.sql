-- Per-project reminder rhythm: disable slots a project does not use.
ALTER TABLE "ReminderTemplate" ADD COLUMN "enabled" BOOLEAN NOT NULL DEFAULT true;
