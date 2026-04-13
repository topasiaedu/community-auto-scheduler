---
title: "Source digest: Bootstrap LLM Wiki pattern"
type: "source-summary"
updated: "2026-04-13"
sources: 1
tags: ["meta", "ingest"]
---

# Source digest: `2026-04-13-bootstrap-llm-wiki-pattern.md`

**Raw path:** `raw/sources/2026-04-13-bootstrap-llm-wiki-pattern.md`

## One-line summary

Condensed description of the LLM Wiki pattern: a maintained markdown wiki between immutable raw sources and answers, plus ingest / query / lint operations.

## Key claims (from source)

- RAG-style setups re-derive knowledge per question; a **persistent wiki** allows **accumulation** and **cross-linking**.
- Three layers: **raw** (read), **wiki** (LLM-maintained), **schema** (rules document).
- **Ingest** updates many wiki pages and catalog files; **query** uses the wiki first; **lint** keeps health over time.
- **Stated** in source: human focuses on sourcing and judgment; LLM absorbs bookkeeping.

## Wiki integration

- Establishes shared vocabulary with [[wiki/concepts/compounding-knowledge-base]].
- [[wiki/overview]] cites this ingest as the initial scope until project docs arrive.

## Open questions

- None for this meta-source. Project-specific sources may introduce product questions later.
