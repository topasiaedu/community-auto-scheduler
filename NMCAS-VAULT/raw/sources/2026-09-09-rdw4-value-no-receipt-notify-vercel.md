# Raw source: RDW 4.0 Value no-receipt FAILED, second ops notify number, Vercel pnpm build (2026-09-09)

**Type:** Production incident + ops change + web CI fix  
**Date of incident:** 2026-09-09 (Value fan-out 11:00 MYT; web build fail after API deploy)  
**Date recorded:** 2026-09-09  
**Project:** Dr Jasmine (`cmresmpxn0000x1w6vet6i42z`)  
**Constraint:** Read-only for WhatsApp sends. No Re-queue from NMCAS during the check. API restart and web CI fix were operator-requested later the same day.

---

## 1. Operator report

Operator received an ops WhatsApp DM:

> [NMCAS] Failed to send scheduled message to Reversing Diabetes Workshop 4.0 › Reversing Diabetes Workshop 4.0 at 9 Sept 2026, 11:00 MYT. Error: No WhatsApp server receipt for message id 3EB0546133EC6E9CEC1F3D. The message may not be visible in the group — check WhatsApp and use Re-queue if needed.

They asked to check whether the community actually got the post, and to add **+6017-678-2206** as a recipient for this type of update. They later asked to commit, push, and restart production. After that, GitHub Actions **Vercel Production** failed; they asked to check the failed build.

The failure text is an **ops DM** from the linked WhatsApp account. It is not a message posted into the community. The community name in the DM is which Queue row failed.

---

## 2. What NMCAS actually did (11:00 MYT Value fan-out)

Same image and caption to six Announcements channels (`Jasmine_Post__13_.png`, copy length 1923, `operatorKind=VALUE`, `valueFormat=IMAGE_CAPTION`, `scheduledAt` 2026-09-09 03:00:00 UTC).

| Community | Row id | Status | Notes |
|-----------|--------|--------|--------|
| RDW (base) | `cmtl74eu600gse7o7nxcv9x2j` | SENT | Accept 11:00:31, ack +8s, id `3EB01C2CEE17A90024269A` |
| RDW 6.0 | `cmtl74evb00gue7o70ymykc8v` | SENT | Accept 11:00:34, ack +5.5s, id `3EB0235505EE084334799E` |
| **RDW 4.0** | `cmtl74ex600gwe7o769yr5qfh` | **FAILED** | Accept 11:00:49, id `3EB0546133EC6E9CEC1F3D`, **no** `waAckedAt` |
| RDW 5.0 | `cmtl74ey800h0e7o7ih6bghvi` | SENT | Accept 11:02:54 (after crash), ack +14.5s |
| RDW 3.0 | `cmtl74eyr00h2e7o7ye01pqeg` | SENT | Accept 11:03:10, ack +6s |
| **RDW 2.0** | `cmtl74exq00gye7o7l0barkgl` | **FAILED** | No `waMessageId`; error `Go process exited with code null` |

RDW 4.0 destination JID: `120363410748782360@g.us`.

Worker logs:

- `[send-worker] IPC accepted — awaiting receipt id=cmtl74ex600gwe7o769yr5qfh waMessageId=3EB0546133EC6E9CEC1F3D`
- `[send-worker] no receipt within 90000ms → FAILED`
- Nearby: `Go process exited with code null` on the same project

Engagement tables: no reactions or replies on the RDW 4.0 row. NMCAS cannot see inside WhatsApp. Missing receipt is **not** proof the group is empty (inverse of 8 Sep RDW 6.0 Starting Soon false SENT).

**Operator guidance:** if RDW 4.0 already shows the Value post, **do not Re-queue** (duplicate). RDW 2.0 never got an IPC id — check that community; Re-queue only if missing.

---

## 3. Cause (RDW 4.0)

Receipt-gated SENT (plan Stage B) is live. After IPC accept, the row stays `SENDING` until `message:receipt` or a ~90s timeout.

Timeline: several communities accepted and acked around 11:00:31–11:00:39. RDW 4.0 accepted at 11:00:49. The whatsmeow **Go process then exited**. Receipt never arrived → FAILED. RDW 2.0 hit the dead process (no accept). RDW 5.0 and 3.0 succeeded after restart (~11:03).

This is **false FAILED** if WhatsApp still published the accepted stanza. Distinct from 8 Sep RDW 6.0 Starting Soon (**false SENT**: server ack, group empty). Distinct from Jul 2026 Render OOM (job never ran).

The `[NMCAS] Failed to send…` DM is expected `markFailedWithNotify` behaviour, sent as a 1:1 chat to the ops MSISDN, not into the group.

---

## 4. Second ops notify number

Before this session, failure alerts and the daily digest used a **single** env MSISDN (`NMCAS_FAILURE_NOTIFY_MSISDN`, default `60139968817`). Prisma `NotifyRecipient` exists and was **empty / unused**.

Change (commit `246ffff`):

- `apps/api/src/lib/notifyMsisdn.ts` — `DEFAULT_NOTIFY_MSISDNS` = `60139968817` and `60176782206` (+6017-678-2206)
- Env may be a comma-separated list; extra valid numbers are appended; defaults cannot be removed via env
- Worker failure DMs and daily digest loop every resolved MSISDN
- `NotifyRecipient` table still unused

Production API: droplet was behind `main` with a local whatsmeow 0.7.0 pin on `apps/api/package.json` / `package-lock.json` (already on origin). Stashed those two files, `scripts/update-server.sh`, PM2 restart. HEAD `246ffff`. `/health` and `/ready` 200. Dr Jasmine session `connected` / `loggedIn`. `data/` (WA sessions) not touched.

---

## 5. Vercel Production build failure (web only)

GitHub Action **Vercel Production** run `34339582618` failed ~30s after `246ffff` push.

- Step: `vercel build --prod`
- Log: `Installing dependencies with pnpm 10` then `Error: spawn pnpm ENOENT`
- CLI: Vercel 59.5.0 on Node 20; Actions runner has **npm**, not pnpm

Same failure on `bebc92c` (2026-08-27), which added `pnpm-lock.yaml` while pinning whatsmeow. Last **successful** web production Action before the fix: `9f71e25` (27 Aug, Queue draft Resume). API on DigitalOcean is independent; it was already on `246ffff`.

Repo install path is **npm**: `package-lock.json`, `vercel.json` `installCommand: "npm ci"`, droplet `npm ci`. `vercel build` still selected pnpm because `pnpm-lock.yaml` was present.

Fix (commit `270bdeb`): delete `pnpm-lock.yaml`, gitignore it, npm cache on the production workflow. Re-run `34340775430` **success** (44s). Aliased to `https://community-auto-scheduler-web.vercel.app`.

---

## 6. Commits (2026-09-09)

| SHA | What |
|-----|------|
| `246ffff` | Second ops notify number; RDW 6.0 Starting Soon vault ingest from earlier the same day |
| `270bdeb` | Remove `pnpm-lock.yaml` so Actions `vercel build` uses npm |

---

## 7. Open questions

- Confirm in WhatsApp whether RDW 4.0 members see the 11:00 Value post (NMCAS cannot).
- Confirm RDW 2.0 is empty for that post; Re-queue only if so.
- Stage C (group echo / `isFromMe`) still not implemented — Queue SENT/FAILED still ≠ member-visible.
- `NotifyRecipient` CRUD still unused; ops numbers live in code defaults + env.
- Droplet git stash of the local 0.7.0 pin can be dropped when convenient.
