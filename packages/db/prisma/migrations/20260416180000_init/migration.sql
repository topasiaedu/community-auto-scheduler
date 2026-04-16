-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "MessageType" AS ENUM ('POST', 'POLL');

-- CreateEnum
CREATE TYPE "MessageStatus" AS ENUM ('PENDING', 'SENDING', 'SENT', 'FAILED');

-- CreateTable
CREATE TABLE "Project" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Project_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "NotifyRecipient" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "waNumber" TEXT NOT NULL,
    "label" TEXT,

    CONSTRAINT "NotifyRecipient_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ScheduledMessage" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "groupJid" TEXT NOT NULL,
    "groupName" TEXT NOT NULL,
    "type" "MessageType" NOT NULL,
    "copyText" TEXT,
    "imageUrl" TEXT,
    "pollQuestion" TEXT,
    "pollOptions" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "pollMultiSelect" BOOLEAN NOT NULL DEFAULT false,
    "scheduledAt" TIMESTAMP(3) NOT NULL,
    "status" "MessageStatus" NOT NULL DEFAULT 'PENDING',
    "sentAt" TIMESTAMP(3),
    "error" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ScheduledMessage_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "NotifyRecipient_projectId_idx" ON "NotifyRecipient"("projectId");

-- CreateIndex
CREATE INDEX "ScheduledMessage_projectId_scheduledAt_idx" ON "ScheduledMessage"("projectId", "scheduledAt");

-- AddForeignKey
ALTER TABLE "NotifyRecipient" ADD CONSTRAINT "NotifyRecipient_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ScheduledMessage" ADD CONSTRAINT "ScheduledMessage_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;
