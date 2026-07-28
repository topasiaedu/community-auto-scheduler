---
title: "WA reliability always-on plan (2026-07-27)"
type: "source-summary"
updated: "2026-07-27"
sources: 1
tags: ["nmcas", "whatsmeow", "reliability", "sent", "groups"]
---

# WA reliability always-on plan

Digest of `raw/sources/2026-07-27-wa-reliability-always-on-plan.md`.

## Summary

Design to fix flaky WhatsApp UX and false SENT without Meta Cloud webhooks.

| Root cause | Direction |
|------------|-----------|
| Browser boots WA; idle eviction; status blocks Prisma | **Always-on** server session + supervised reconnect; cheap `/wa/status` |
| SENT = send Promise OK | Persist **`waMessageId`**; **SENT only after `message:receipt`** |
| “5 of 6 communities missing” | Keep **independent fan-out rows**; fix per-row send/ack |
| Click Load groups | **Periodic refresh** while connected |
| Reactions/replies tracker | **Deferred**; needs message ids from this work |

Memory: always-on ~80 MB steady; spikes are send/media. Companion prompts: [[wiki/sources/2026-07-27-wa-reliability-agent-prompts]].

## Locked decisions

- D1 always-on (env kill-switch)  
- D2 receipt-gated SENT  
- D3 independent fan-out rows  
- D4 periodic group refresh  
- D5 engagement Phase 4+  
- D6 prefer always-on over eviction for RAM

## Related

- [[wiki/concepts/wa-connection-pool]]
- [[wiki/entities/scheduled-message]]
- [[wiki/concepts/pg-boss-scheduler]]
