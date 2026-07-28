---
title: "Media egress cache + compress plan (2026-07-18)"
type: "source-summary"
updated: "2026-07-18"
sources: 1
tags: ["nmcas", "supabase", "storage", "egress", "performance"]
---

# Media egress cache + compress plan

Digest of `raw/sources/2026-07-18-media-egress-cache-compress-plan.md`.

## Summary

Production scheduled send failed with Supabase Storage **`exceed_egress_quota`**. Root amplifier: Value fan-out creates N jobs that each **`download()`** the same private-bucket object. Plan: (1) **compress** post/reminder images on upload (and on send-path miss for legacy objects) via `sharp`; (2) **process-local LRU cache** with promise coalesce so one process pays one download per path per wave. Stickers stay static WebP. Caps (~32 MiB / 32 entries / 1h TTL) respect DO RAM constraints ([[wiki/sources/2026-07-16-do-migration-oom-incident-session]]).

## Key claims

- Egress cannot be zero for image posts while media lives in Supabase; it can be ~1× per unique path per process instead of N× communities.
- Compress-at-upload shrinks all future downloads; compress-on-miss helps existing large objects.
- Billing unblock (upgrade / disable spend cap) is still required while the org is restricted — code only prevents recurrence.

## Implementation

Agent prompts: `raw/sources/2026-07-18-media-egress-agent-prompts.md` (Agent 1 compress → Agent 2 cache). Wiki digest: [[wiki/sources/2026-07-18-media-egress-agent-prompts]].

## Related

- [[wiki/concepts/wa-connection-pool]] — post images still in `NMCAS_POST_MEDIA_BUCKET`
- [[wiki/entities/scheduled-message]] — fan-out rows share `imageUrl`
