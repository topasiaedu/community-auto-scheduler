---
title: "Compounding knowledge base (LLM Wiki)"
type: "concept"
updated: "2026-04-13"
sources: 1
tags: ["knowledge-management", "llm-wiki"]
---

# Compounding knowledge base (LLM Wiki)

## Definition

A **compounding knowledge base** here means: a **wiki** (interlinked markdown) that **grows and is repaired over time** as new raw sources are ingested and as questions prompt filed answers. The compiled layer is **durable**; query-time retrieval from raw chunks alone is **not** the primary store of structure.

## Mechanism

1. **Raw** documents stay fixed as evidence.
2. **Ingest** maps new information into entity/concept/source-summary pages and updates synthesis pages.
3. **Query** reads the wiki (and raw only when needed), then may **write back** durable answers.
4. **Lint** corrects drift: contradictions, orphans, stale claims.

## Contradictions

When a new source conflicts with the wiki, the maintainer should **surface** the conflict (section on the affected pages or a dedicated meta note), not silently overwrite without recording the tension.

## Sources

- Grounded in: `raw/sources/2026-04-13-bootstrap-llm-wiki-pattern.md`

## See also

- [[wiki/overview]]
- [[wiki/sources/2026-04-13-bootstrap-llm-wiki-pattern]]
