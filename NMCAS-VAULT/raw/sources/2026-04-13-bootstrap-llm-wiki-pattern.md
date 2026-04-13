# Bootstrap source: LLM Wiki pattern (condensed)

**Type:** Meta-documentation for vault setup.  
**Date:** 2026-04-13

## Summary of the pattern

Most document + LLM setups behave like RAG: at question time the model retrieves chunks and answers. Knowledge is re-derived each time; little accumulates in a structured form.

The **LLM Wiki** pattern adds a **persistent middle layer**: a directory of interlinked markdown pages that the LLM **updates** whenever new sources arrive. Raw sources stay immutable; the wiki holds summaries, entity pages, concept pages, and an evolving synthesis. Cross-references and contradictions can be maintained deliberately instead of rediscovered on every query.

## Three layers

1. **Raw sources** — Curated inputs; the LLM reads but does not silently rewrite them.
2. **Wiki** — LLM-owned markdown: compiled knowledge and links.
3. **Schema** — A single rules document (here: `CLAUDE.md`) so behavior stays consistent across sessions.

## Operations

- **Ingest** — Read a new raw file; write or update wiki pages; refresh `index.md`; append `log.md`.
- **Query** — Read index and relevant pages; cite wiki and raw paths; file durable answers back into the wiki when agreed.
- **Lint** — Periodically check for orphans, stale claims, contradictions, and missing pages.

## Why it compounds

Bookkeeping (links, updates, consistency) is cheap for an LLM and expensive for humans. The human focuses on sourcing and judgment; the wiki absorbs the maintenance.

---

*This file is intentionally short so the vault can ship a complete first-ingest example before project-specific raw docs exist.*
