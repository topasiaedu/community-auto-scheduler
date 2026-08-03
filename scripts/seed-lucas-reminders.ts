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

const LUCAS_PROJECT_ID = "cms481xnz000limel4izdcch4";

const WELCOME = [
  "大家好！🎉",
  "欢迎加入 Lucas Lim《逆转糖尿病分享会》的官方群组 😇",
  "你已经成功报名了。",
  "而这里，不只是一个普通的群组。",
  "",
  "在分享会开始之前，我们会在这里发送：",
  "✅ 分享会的重要通知",
  "✅ 额外的健康改善资讯",
  "✅ 分享会开始前的 Zoom 链接",
  "",
  "真正重要的内容，会在分享会当天完整讲解。",
  "但分享会开始之前，你所接收到的资讯也一样重要。",
  "",
  "所以记得留意这个群组，不要错过接下来的通知。",
  "这可能会是你重新认识糖尿病，并开始改变健康方向的第一步 💚",
  "",
  "如果你已经准备好学习、重新调整，并拿回健康的主动权……",
  "🔥 在下面按一个emoji，让我们知道你已经准备好了！",
  "",
  "我们一起开始吧！",
].join("\n");

const COUNTDOWN_2D = [
  "距离分享会只剩下 2天 了 🤩",
  "在开始之前，想先问你一个问题…",
  "",
  "你有没有发现，有时候血糖好像有改善一点…",
  "但有时候，无论你已经多小心吃、怎样戒口，血糖还是忽高忽低？",
  "",
  "你已经尽量吃得健康。",
  "你已经很努力控制。",
  "医生交代的，你也都有照着做。",
  "",
  "可是血糖还是不稳定。",
  "身体还是很容易累。",
  "而且你心里面，还是会担心继续这样下去，以后到底会变成怎样。",
  "",
  "很多人都以为，糖尿病一旦有了，就只能一辈子控制。",
  "",
  "血糖高，就吃药。",
  "控制不到，就加药。",
  "再不行，就开始打胰岛素。",
  "",
  "然后只能希望以后不要出现并发症。",
  "",
  "但如果事情并不只是这样呢？🤯",
  "",
  "如果真正的问题是，大部分糖友一直以来只被教导怎样把血糖数字压下来…",
  "却没有真正了解，为什么身体会开始没有办法好好“处理”血糖？",
  "",
  "如果你已经很努力控制，",
  "但血糖还是反反复复，",
  "药物也没有真正减少，",
  "你会发现这场分享会，和你过去听过的健康讲座很不一样。",
  "",
  "因为我们要谈的，不只是怎样“暂时”把血糖降下来。",
  "而是让你真正了解：",
  "",
  "✅ 为什么你已经很小心，血糖还是不稳定",
  "✅ 为什么有些糖友的药物和胰岛素会越用越多",
  "✅ 想降低未来并发症的风险，身体真正需要改善的是什么",
  "",
  "当身体真正的问题开始被处理，",
  "身体对食物、血糖和胰岛素的反应，才有机会改变。",
  "",
  "但如果方向没有改变，",
  "就算你已经非常努力，也可能一直困在同样的循环里面。",
  "",
  "📅{{workshopDate}} ({{workshopDay}}) 晚上 {{workshopTime}}（GMT+8），Lucas 会一步一步为你讲解清楚。",
  "",
  "当你开始从不同的角度了解糖尿病，",
  "你就不需要再一直猜、一直试、一直兜圈子，",
  "而是会更清楚，自己的身体现在真正需要的是什么。",
  "",
  "记得准时进来。",
  "这场分享会，可能会彻底改变你过去对糖尿病的看法 🔥",
].join("\n");

const COUNTDOWN_1D = [
  "⏰ 倒数1天 ⏰",
  "",
  "我们将在 明天晚上 {{workshopTime}}（GMT+8），正式开始 Lucas Lim 的《逆转糖尿病分享会》🔥",
  "",
  "如果你的血糖一直忽高忽低…",
  "如果你担心药越吃越多、以后需要打胰岛素，甚至出现并发症…",
  "那你一定要来参加明晚的分享会。",
  "",
  "我们将会拆解：",
  "✨ 为什么你明明已经很努力，血糖还是不稳定",
  "✨ 糖尿病的背后，身体到底正在发生什么事",
  "✨ 为什么有些糖友会慢慢走向加药、打胰岛素和并发症",
  "✨ 想要改变未来的健康方向，真正需要处理的是什么",
  "",
  "这不是一场适合你想着“迟一点再看”的分享会。",
  "因为如果前面的基础没有听到，",
  "你就很难完整明白 Lucas 接下来要带你看见的整个方向。",
  "",
  "如果你一直担心自己的血糖…",
  "担心药物越来越多…",
  "或者担心几年后的身体会变成怎样…",
  "明晚一定要准时进来。",
  "",
  "不要看到一半才进。",
  "不要一边听，一边忙其他东西。",
  "也不要把你的健康当着玩意。",
  "",
  "这是 Zoom 链接：",
  "{{zoomLink}}",
  "（也欢迎你邀请家人和朋友一起参加）",
  "",
  "记得明晚准时进入。",
  "因为你越了解自己的身体，",
  "接下来所做的每一个决定，才越有机会走在正确的方向上 🙌",
  "",
  "明晚 {{workshopTime}} 见！（GMT+8）",
].join("\n");

/** LIVE NOW caption (image+caption for Lucas — uses 即将开始 graphic). */
const LIVE_NOW = [
  "🚨 我们已经开始LIVE了！",
  "==>{{zoomLink}}",
  "",
  "大部分糖友一直以来学到的，都是怎样控制血糖数字。",
  "但很少人真正了解，身体里面到底发生了什么，才让血糖一直降不下来。",
  "",
  "这就是 Lucas 现在正在为大家讲解的重点。",
  "当你真正看懂这一点，你对糖尿病的整个看法可能都会改变。",
  "",
  "现在马上进来：",
  "👉{{zoomLink}}",
].join("\n");

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

  // 即将开始 graphic belongs on LIVE NOW for Lucas (no Starting Soon rhythm).
  const livePath = await uploadPng(
    supabaseUrl,
    serviceKey,
    bucket,
    LUCAS_PROJECT_ID,
    path.join(downloads, "逆转糖尿病", "3.png"),
  );
  await prisma.reminderTemplate.update({
    where: { projectId_slotKey: { projectId: LUCAS_PROJECT_ID, slotKey: "live_now" } },
    data: {
      reminderFormat: "IMAGE",
      mediaUrl: livePath,
      bodyTemplate: LIVE_NOW,
      enabled: true,
    },
  });
  console.log(`✓ live_now (IMAGE + 即将开始)`);

  await prisma.reminderTemplate.update({
    where: { projectId_slotKey: { projectId: LUCAS_PROJECT_ID, slotKey: "starting_soon" } },
    data: { enabled: false, mediaUrl: null },
  });
  console.log(`✓ starting_soon disabled`);

  await prisma.reminderTemplate.update({
    where: { projectId_slotKey: { projectId: LUCAS_PROJECT_ID, slotKey: "countdown_1h" } },
    data: { enabled: false },
  });
  console.log(`✓ countdown_1h disabled`);

  await prisma.$disconnect();
  console.log("Done.");
}

main().catch((err: unknown) => {
  console.error(err);
  process.exit(1);
});
