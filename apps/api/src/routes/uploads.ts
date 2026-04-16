/**
 * Multipart upload of post images into Supabase Storage (private bucket).
 */

import multipart from "@fastify/multipart";
import { randomUUID } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import type { ApiEnv } from "../env.js";

const MAX_BYTES = 16 * 1024 * 1024;

function sanitizeFilename(name: string): string {
  const base = name.replace(/[^a-zA-Z0-9._-]/g, "_").slice(0, 200);
  return base.length > 0 ? base : "image.bin";
}

export async function registerUploadRoutes(app: FastifyInstance, env: ApiEnv): Promise<void> {
  await app.register(multipart, {
    limits: { fileSize: MAX_BYTES },
  });

  app.post("/uploads/post-image", async (req: FastifyRequest, reply: FastifyReply) => {
    const data = await req.file();
    if (data === undefined) {
      return reply.code(400).send({ error: "Expected one file field in multipart body" });
    }
    const buffer = await data.toBuffer();
    if (buffer.length === 0) {
      return reply.code(400).send({ error: "Empty file" });
    }
    if (buffer.length > MAX_BYTES) {
      return reply.code(400).send({ error: "File exceeds 16 MB" });
    }

    const projectId = req.activeProjectId;
    if (projectId === undefined || projectId.length === 0) {
      return reply.code(500).send({ error: "Project scope missing" });
    }
    const uploadId = randomUUID();
    const safeName = sanitizeFilename(data.filename);
    const objectPath = `posts/${projectId}/${uploadId}/${safeName}`;

    const supabase = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    const { error } = await supabase.storage
      .from(env.NMCAS_POST_MEDIA_BUCKET)
      .upload(objectPath, buffer, {
        upsert: true,
        contentType: data.mimetype || "application/octet-stream",
      });
    if (error !== null) {
      return reply.code(500).send({ error: error.message });
    }

    return { path: objectPath };
  });
}
