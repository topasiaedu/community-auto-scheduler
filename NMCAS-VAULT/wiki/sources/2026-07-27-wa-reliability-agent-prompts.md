---
title: "WA reliability agent prompts (2026-07-27)"
type: "source-summary"
updated: "2026-07-27"
sources: 1
tags: ["nmcas", "agent-brief", "whatsmeow", "reliability"]
---

# WA reliability agent prompts

Digest of `raw/sources/2026-07-27-wa-reliability-agent-prompts.md`.

## Summary

Four copy-paste prompts for ~200k-context coding agents. Run **1 → 2 → 3** in fresh chats; **4 deferred**.

| Agent | Delivers |
|-------|----------|
| **1 — Always-on** | `WA_ALWAYS_ON`, supervised reconnect, no idle eviction, cheap status/QR, Prisma pool 5, warm default project at startup |
| **2 — True SENT** | `waMessageId`, return `SendResponse`, `message:receipt` → SENT, no-receipt timeout ≠ green |
| **3 — Groups** | Periodic `getJoinedGroups` refresh; demote web “Load groups” |
| **4 — Engagement** | Reactions/replies foundation (after 1–2 stable) |

Do not commit/push unless asked; do not `npm start` if API already running.

## Companion design

[[wiki/sources/2026-07-27-wa-reliability-always-on-plan]]
