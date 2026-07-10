---
title: "Source digest: P7 campaign scheduler ship (2026-07-08)"
type: "source-summary"
updated: "2026-07-08"
sources: 1
tags: ["nmcas", "p7", "campaign", "deploy", "ux", "sop"]
---

# Source digest: `2026-07-08-p7-campaign-scheduler-ship-session.md`

**Raw path:** `raw/sources/2026-07-08-p7-campaign-scheduler-ship-session.md`

## One-line summary

P7 Show Up campaign scheduler **implemented and pushed** to `main` (`8f7d1c1`); campaign wizard is reminders-only (4 steps), SOP captions locked from Dr Jasmine PDF, post-live sticker optional; live E2E pending Render migration + Vercel/API deploy.

## Key claims

- Shipped: schema/migration, templates + campaigns APIs, worker routing + sticker send, Schedule/Settings/Queue UI, vault UX/implementation plans.
- **Campaign ≠ Value posts:** wizard schedules Show Up Reminders only; Value posts via Single message (fan-out).
- Custom Values: Zoom fields + webinar anchors; day/time/session strings derived for `{{…}}` merge.
- Caption defaults = real SOP copy in `reminderTemplateDefaults.ts` (not the short placeholders from early P7 plans).
- Post-live sticker **optional** until WebP uploaded.
- Localhost + shared Supabase = production Storage/DB for templates if env matches.
- Owner asked for commit/push this session; future “no push unless asked” still applies.

## Supersedes (plan vs shipped)

| Earlier lock | Shipped behaviour |
|--------------|-------------------|
| 5-step campaign including Value posts | **4-step** Show Up only |
| All 6 Show Up assets required | Sticker **skipped** if missing |
| Short seed `bodyTemplate` examples in UX spec | Full SOP transcripts |

See also [[wiki/analysis/p7-ux-spec]] (partially outdated on Value step / 5 steps — treat this digest + raw for campaign UX until UX spec is revised).

## Wiki integration

- [[wiki/overview]] — P7 status
- [[wiki/concepts/value-vs-reminder-messages]]
- [[wiki/concepts/campaign-message-schedule]]
- [[wiki/entities/scheduled-message]]
- [[wiki/entities/project]]
- [[wiki/analysis/p7-implementation-plan]]
- [[wiki/analysis/p7-ux-spec]]

## Open / next

- Production smoke after deploy + migration
- Upload sticker WebP later
- Optional: revise `p7-ux-spec.md` §4 to match 4-step / Value-out-of-wizard decisions

## See also

- [[wiki/sources/2026-07-07-whatsapp-community-sop-dr-jasmine-show-up-reference]]
- [[wiki/sources/2026-07-06-whatsmeow-deploy-product-ux-session]]
