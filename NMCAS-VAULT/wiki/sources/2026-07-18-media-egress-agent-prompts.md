---
title: "Media egress agent prompts (2026-07-18)"
type: "source-summary"
updated: "2026-07-18"
sources: 1
tags: ["nmcas", "agent-brief", "supabase", "storage"]
---

# Media egress agent prompts

Digest of `raw/sources/2026-07-18-media-egress-agent-prompts.md`.

## Summary

Two copy-paste prompts for ~200k-context coding agents, sized so each chat stays focused:

| Agent | Delivers |
|-------|----------|
| **1 — Compress** | `sharp` + `compressPostImage` + upload wiring for `post` / `reminder-image`; sticker path untouched; unit tests |
| **2 — Cache** | `mediaDownloadCache` (LRU caps, TTL, in-flight coalesce); wire `downloadMediaAsset` in send worker; compress on miss via Agent 1 helper |

Run **1 then 2**. Do not commit/push unless asked; do not `npm start` if API already running.

## Companion design

[[wiki/sources/2026-07-18-media-egress-cache-compress-plan]]
