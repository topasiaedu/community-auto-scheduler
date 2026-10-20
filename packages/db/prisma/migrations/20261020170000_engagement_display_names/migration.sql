-- Display names captured from reaction and reply events (optional).
ALTER TABLE "MessageReaction" ADD COLUMN "reactorName" TEXT;
ALTER TABLE "MessageReply" ADD COLUMN "replierName" TEXT;
