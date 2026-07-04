-- Per-project whatsmeow SQLite session files, persisted as bytea so Render can use the
-- Supabase session pooler (direct Postgres is often IPv6-only; pooler ignores search_path).
CREATE TABLE "WhatsAppSessionBlob" (
    "projectId" TEXT NOT NULL,
    "data" BYTEA NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WhatsAppSessionBlob_pkey" PRIMARY KEY ("projectId")
);
