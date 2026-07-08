/**
 * Multipart upload of media into Supabase Storage (private bucket).
 */

import multipart from "@fastify/multipart";
import { randomUUID } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import type { ApiEnv } from "../env.js";
import { isAnimatedWebP } from "../lib/animatedWebp.js";

const MAX_BYTES = 16 * 1024 * 1024;

const UploadKindSchema = z.enum(["post", "reminder-image", "sticker"]);

const ALLOWED_PREFIXES = ["posts/", "reminders/", "stickers/"] as const;

function sanitizeFilename(name: string): string {
  const base = name.replace(/[^a-zA-Z0-9._-]/g, "_").slice(0, 200);
  return base.length > 0 ? base : "image.bin";
}

function prefixForKind(kind: z.infer<typeof UploadKindSchema>): string {
  switch (kind) {
    case "post":
      return "posts";
    case "reminder-image":
      return "reminders";
    case "sticker":
      return "stickers";
  }
}

function contentTypeForPath(objectPath: string): string {
  const lower = objectPath.toLowerCase();
  if (lower.endsWith(".png")) {
    return "image/png";
  }
  if (lower.endsWith(".webp")) {
    return "image/webp";
  }
  if (lower.endsWith(".gif")) {
    return "image/gif";
  }
  return "image/jpeg";
}

function isPathAllowedForProject(objectPath: string, projectId: string): boolean {
  for (const prefix of ALLOWED_PREFIXES) {
    if (objectPath.startsWith(`${prefix}${projectId}/`)) {
      return true;
    }
  }
  return false;
}

async function downloadMediaObject(
  env: ApiEnv,
  objectPath: string,
): Promise<{ buffer: Buffer; contentType: string } | null> {
  const supabase = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data, error } = await supabase.storage
    .from(env.NMCAS_POST_MEDIA_BUCKET)
    .download(objectPath);
  if (error !== null || data === null) {
    return null;
  }
  const buffer = Buffer.from(await data.arrayBuffer());
  return { buffer, contentType: contentTypeForPath(objectPath) };
}

export async function registerUploadRoutes(app: FastifyInstance, env: ApiEnv): Promise<void> {
  await app.register(multipart, {
    limits: { fileSize: MAX_BYTES },
  });

  app.post("/uploads/media", async (req: FastifyRequest, reply: FastifyReply) => {
    const kindParsed = UploadKindSchema.safeParse(
      (req.query as { kind?: string }).kind,
    );
    if (!kindParsed.success) {
      return reply.code(400).send({ error: "Invalid or missing kind query parameter" });
    }
    const kind = kindParsed.data;

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

    if (kind === "sticker") {
      const mime = (data.mimetype ?? "").toLowerCase();
      const filename = (data.filename ?? "").toLowerCase();
      if (mime !== "image/webp" && !filename.endsWith(".webp")) {
        return reply.code(400).send({ error: "Sticker uploads must be WebP" });
      }
      if (isAnimatedWebP(buffer)) {
        return reply
          .code(400)
          .send({ error: "Animated stickers are not supported. Export a static WebP." });
      }
    }

    const uploadId = randomUUID();
    const safeName = sanitizeFilename(data.filename);
    const objectPath = `${prefixForKind(kind)}/${projectId}/${uploadId}/${safeName}`;

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

  app.get("/uploads/media", async (req: FastifyRequest, reply: FastifyReply) => {
    const projectId = req.activeProjectId;
    if (projectId === undefined || projectId.length === 0) {
      return reply.code(500).send({ error: "Project scope missing" });
    }
    const raw = (req.query as { path?: string }).path;
    if (typeof raw !== "string" || raw.length === 0) {
      return reply.code(400).send({ error: "Missing path query parameter" });
    }
    const objectPath = decodeURIComponent(raw.trim());
    if (!isPathAllowedForProject(objectPath, projectId)) {
      return reply.code(403).send({ error: "Invalid path for this project" });
    }
    const result = await downloadMediaObject(env, objectPath);
    if (result === null) {
      return reply.code(404).send({ error: "Not found" });
    }
    reply.header("Content-Type", result.contentType);
    reply.header("Cache-Control", "private, max-age=3600");
    return reply.send(result.buffer);
  });

  /** @deprecated Use POST /uploads/media?kind=post */
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

  /** @deprecated Use GET /uploads/media?path=... */
  app.get("/uploads/post-media", async (req: FastifyRequest, reply: FastifyReply) => {
    const projectId = req.activeProjectId;
    if (projectId === undefined || projectId.length === 0) {
      return reply.code(500).send({ error: "Project scope missing" });
    }
    const raw = (req.query as { path?: string }).path;
    if (typeof raw !== "string" || raw.length === 0) {
      return reply.code(400).send({ error: "Missing path query parameter" });
    }
    const objectPath = decodeURIComponent(raw.trim());
    const prefix = `posts/${projectId}/`;
    if (!objectPath.startsWith(prefix)) {
      return reply.code(403).send({ error: "Invalid path for this project" });
    }
    const result = await downloadMediaObject(env, objectPath);
    if (result === null) {
      return reply.code(404).send({ error: errorMessageNotFound() });
    }
    reply.header("Content-Type", result.contentType);
    reply.header("Cache-Control", "private, max-age=3600");
    return reply.send(result.buffer);
  });
}

function errorMessageNotFound(): string {
  return "Not found";
}
