/**
 * One-off: seed Lucas project reminder copy + images from operator assets.
 *
 * Usage (from repo root, with .env loaded):
 *   npx tsx scripts/seed-lucas-reminders.ts
 *
 * Expects migration `enabled` column already applied.
 */

import { createClient } from "@supabase/supabase-js";
import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { PrismaClient } from "@nmcas/db";
import {
  LUCAS_COUNTDOWN_1D,
  LUCAS_COUNTDOWN_1H,
  LUCAS_COUNTDOWN_2D,
  LUCAS_LIVE_NOW,
  LUCAS_PROJECT_ID,
  LUCAS_STARTING_SOON,
  LUCAS_WELCOME,
} from "./lucasReminderBodies.js";

const WELCOME = LUCAS_WELCOME;
const COUNTDOWN_2D = LUCAS_COUNTDOWN_2D;
const COUNTDOWN_1D = LUCAS_COUNTDOWN_1D;
const LIVE_NOW = LUCAS_LIVE_NOW;
const STARTING_SOON = LUCAS_STARTING_SOON;
const COUNTDOWN_1H = LUCAS_COUNTDOWN_1H;
async function uploadPng(
  supabaseUrl: string,
  serviceKey: string,
  bucket: string,
  projectId: string,
  filePath: string,
): Promise<string> {
  const buffer = await readFile(filePath);
  const objectPath = `reminders/${projectId}/${randomUUID()}/${path.basename(filePath)}`;
  const supabase = createClient(supabaseUrl, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { error } = await supabase.storage.from(bucket).upload(objectPath, buffer, {
    upsert: true,
    contentType: "image/png",
  });
  if (error !== null) {
    throw new Error(`Upload failed for ${filePath}: ${error.message}`);
  }
  return objectPath;
}

async function main(): Promise<void> {
  const databaseUrl = process.env.DATABASE_URL;
  const supabaseUrl = process.env.SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const bucket = process.env.NMCAS_POST_MEDIA_BUCKET;
  if (
    databaseUrl === undefined ||
    supabaseUrl === undefined ||
    serviceKey === undefined ||
    bucket === undefined
  ) {
    throw new Error("Missing DATABASE_URL / SUPABASE_* / NMCAS_POST_MEDIA_BUCKET");
  }

  const downloads = path.join(process.env.HOME ?? "", "Downloads");
  const prisma = new PrismaClient();
  const project = await prisma.project.findUnique({ where: { id: LUCAS_PROJECT_ID } });
  if (project === null) {
    throw new Error(`Lucas project not found: ${LUCAS_PROJECT_ID}`);
  }
  console.log(`Updating project: ${project.name} (${project.id})`);

  const welcomePath = await uploadPng(
    supabaseUrl,
    serviceKey,
    bucket,
    LUCAS_PROJECT_ID,
    path.join(downloads, "Untitled design.png"),
  );
  await prisma.reminderTemplate.update({
    where: { projectId_slotKey: { projectId: LUCAS_PROJECT_ID, slotKey: "welcome" } },
    data: { mediaUrl: welcomePath, bodyTemplate: WELCOME, enabled: true },
  });
  console.log(`✓ welcome`);

  const c2dPath = await uploadPng(
    supabaseUrl,
    serviceKey,
    bucket,
    LUCAS_PROJECT_ID,
    path.join(downloads, "逆转糖尿病", "1.png"),
  );
  await prisma.reminderTemplate.update({
    where: { projectId_slotKey: { projectId: LUCAS_PROJECT_ID, slotKey: "countdown_2d" } },
    data: { mediaUrl: c2dPath, bodyTemplate: COUNTDOWN_2D, enabled: true },
  });
  console.log(`✓ countdown_2d`);

  const c1dPath = await uploadPng(
    supabaseUrl,
    serviceKey,
    bucket,
    LUCAS_PROJECT_ID,
    path.join(downloads, "逆转糖尿病", "2.png"),
  );
  await prisma.reminderTemplate.update({
    where: { projectId_slotKey: { projectId: LUCAS_PROJECT_ID, slotKey: "countdown_1d" } },
    data: { mediaUrl: c1dPath, bodyTemplate: COUNTDOWN_1D, enabled: true },
  });
  console.log(`✓ countdown_1d`);

  // Starting Soon: IMAGE + 即将开始 graphic (3.png). LIVE NOW stays TEXT.
  const startingSoonPath = await uploadPng(
    supabaseUrl,
    serviceKey,
    bucket,
    LUCAS_PROJECT_ID,
    path.join(downloads, "逆转糖尿病", "3.png"),
  );
  await prisma.reminderTemplate.update({
    where: { projectId_slotKey: { projectId: LUCAS_PROJECT_ID, slotKey: "starting_soon" } },
    data: {
      reminderFormat: "IMAGE",
      mediaUrl: startingSoonPath,
      enabled: true,
      bodyTemplate: STARTING_SOON,
    },
  });
  console.log(`✓ starting_soon (IMAGE + 即将开始)`);

  await prisma.reminderTemplate.update({
    where: { projectId_slotKey: { projectId: LUCAS_PROJECT_ID, slotKey: "countdown_1h" } },
    data: {
      reminderFormat: "TEXT",
      mediaUrl: null,
      enabled: true,
      bodyTemplate: COUNTDOWN_1H,
    },
  });
  console.log(`✓ countdown_1h (TEXT)`);

  await prisma.reminderTemplate.update({
    where: { projectId_slotKey: { projectId: LUCAS_PROJECT_ID, slotKey: "live_now" } },
    data: {
      reminderFormat: "TEXT",
      mediaUrl: null,
      bodyTemplate: LIVE_NOW,
      enabled: true,
    },
  });
  console.log(`✓ live_now (TEXT)`);

  await prisma.$disconnect();
  console.log("Done.");
}

main().catch((err: unknown) => {
  console.error(err);
  process.exit(1);
});
