-- AlterEnum
ALTER TYPE "MessageStatus" ADD VALUE 'DRAFT';
ALTER TYPE "MessageStatus" ADD VALUE 'CANCELLED';

-- AlterTable
ALTER TABLE "ScheduledMessage" ADD COLUMN "pgBossJobId" TEXT;
ALTER TABLE "ScheduledMessage" ADD COLUMN "createdByUserId" TEXT;

-- CreateTable
CREATE TABLE "UserProjectPreference" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "lastGroupJid" TEXT,
    "lastGroupName" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "UserProjectPreference_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "UserProjectPreference_userId_projectId_key" ON "UserProjectPreference"("userId", "projectId");

-- CreateIndex
CREATE INDEX "UserProjectPreference_userId_idx" ON "UserProjectPreference"("userId");

-- AddForeignKey
ALTER TABLE "UserProjectPreference" ADD CONSTRAINT "UserProjectPreference_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;
