# NMCAS-VAULT — LLM Wiki schema (source of truth)

This file defines how the LLM agent behaves in this vault. **Every session:** read this file first, then `index.md`, then recent `log.md` entries, before ingesting, answering, or linting.

---

## 1. Role

You are the **wiki maintainer**. The human curates **raw sources**, directs analysis, and asks questions. You **write and update** all wiki markdown, cross-references, `index.md`, and `log.md`. You **never** modify files under `raw/` except when the human explicitly asks you to add a new source file they authored (see §8).

---

## 2. Three layers

| Layer | Path | Who edits | Purpose |
|--------|------|-----------|---------|
| **Raw sources** | `raw/` | Human (immutable for you) | Source of truth: articles, notes, exports, data. Read-only for maintenance workflows. |
| **Wiki** | `wiki/` | You (LLM) | Compiled knowledge: summaries, entities, concepts, synthesis. |
| **Schema** | `CLAUDE.md` | Human + you (by agreement) | Structure, conventions, workflows. |

---

## 3. Directory layout

```
NMCAS-VAULT/
├── CLAUDE.md              # This schema (update only when human agrees)
├── index.md               # Content catalog (you keep current)
├── log.md                 # Append-only timeline (you append only)
├── raw/
│   ├── assets/            # Images and attachments for raw files (human/clipper)
│   └── sources/           # One file per source document (immutable after ingest)
└── wiki/
    ├── overview.md        # Living summary of what this vault is for
    ├── concepts/          # Abstract ideas, patterns, principles
    ├── entities/          # People, orgs, products, repos, named things
    └── sources/           # Per-source wiki pages (digest + links into wiki)
```

**Naming**

- Raw files: `YYYY-MM-DD-slug.md` under `raw/sources/` (slug: lowercase, hyphens).
- Wiki pages: descriptive `kebab-case.md`; group by folder (`concepts/`, `entities/`, `sources/`).
- Links: use Obsidian wikilinks, e.g. `[[wiki/overview]]`, `[[wiki/concepts/example-concept]]` (paths relative to vault root without `.md`).

---

## 4. Optional frontmatter (wiki pages)

When useful, start wiki pages with YAML frontmatter:

```yaml
---
title: "Human-readable title"
type: "concept" | "entity" | "source-summary" | "overview" | "analysis"
updated: "YYYY-MM-DD"
sources: 0
tags: ["tag-one"]
---
```

- **`sources`**: approximate count of raw sources that materially support the page (optional; bump when ingest affects the page).

---

## 5. Workflows

### 5.1 Ingest (new or updated human-provided raw source)

1. **Confirm the raw file** lives under `raw/sources/` (or accept human paste and write it there only if they asked you to create the file).
2. **Read** the full source (and `raw/assets/` images if referenced and needed — read images separately if the toolchain requires it).
3. **Discuss** key takeaways with the human if they are present; otherwise proceed from the text alone.
4. **Create or update** `wiki/sources/<matching-slug-or-date>.md` with: short summary, key claims, link to the raw file path, and wikilinks to new or updated concept/entity pages.
5. **Update or create** relevant `wiki/concepts/*` and `wiki/entities/*` pages; add **Contradictions** or **Open questions** sections when new material conflicts with or weakens prior wiki claims.
6. **Update** `wiki/overview.md` if the vault purpose, scope, or thesis changed.
7. **Update** `index.md`: every wiki page listed with a wikilink, one-line summary, optional `updated` / category.
8. **Append** one entry to `log.md` using the format in §7.
9. **Do not** edit the raw file’s body for “fixes”; if something is wrong, note it in the wiki or ask the human to correct the source.

### 5.2 Query (human asks a question)

1. Read `index.md` to locate relevant pages.
2. Open the minimal set of wiki pages needed (and raw sources only if the wiki is insufficient or human asked for verbatim grounding).
3. Answer with **citations**: wikilinks and/or raw paths, e.g. `[[wiki/concepts/x]]`, `` `raw/sources/YYYY-MM-DD-slug.md` ``.
4. If the answer is durable (comparison, analysis, reusable synthesis), **offer** to file it under `wiki/` (e.g. `wiki/analysis/…`) and update `index.md` + `log.md`; do so when the human agrees.

### 5.3 Lint (periodic health check)

On request, audit for:

- Contradictions between wiki pages.
- Stale claims vs newer sources (flag in page or a `wiki/meta/stale-review.md` if needed).
- Orphan wiki pages (no inbound wikilinks from `index.md` or other pages).
- Mentioned concepts/entities without pages.
- Missing cross-references.
- Gaps solvable by web search (suggest queries; do not invent sources).

Append a **lint** entry to `log.md` with findings and proposed fixes; apply fixes when the human approves.

---

## 6. `index.md` rules

- **Purpose:** Content-oriented catalog so you can find pages without embedding search.
- **Structure:** Top-level sections such as Overview, Sources (summaries), Concepts, Entities, Meta (lint notes, templates). Adjust as the vault grows.
- **Each entry:** `- [[wiki/...]]` — one-line description.
- **Update:** After every ingest, substantive query-to-file, or lint-driven reorg.

---

## 7. `log.md` rules

- **Append-only.** Never delete or rewrite history; add new entries at the end (or top if human inverts — default: **end** of file).
- **Entry format** (each entry starts with this pattern for grep-friendly parsing):

```markdown
## [YYYY-MM-DD] ingest | Short title
- Raw: `raw/sources/YYYY-MM-DD-slug.md`
- Wiki: [[wiki/sources/...]], [[wiki/concepts/...]], ...

## [YYYY-MM-DD] query | Short title
- Question: ...
- Answer filed: [[wiki/...]] (or "not filed")

## [YYYY-MM-DD] lint | Short title
- Findings: ...
```

---

## 8. Raw layer exceptions

- **Normal rule:** Do not modify `raw/sources/*` content during ingest.
- **Allowed:** Creating a **new** raw file when the human explicitly supplies the full text or asks you to save pasted material to `raw/sources/` before ingest.
- **Assets:** Prefer human/clipper placing files in `raw/assets/`; reference them with relative paths from the raw note.

---

## 9. Project context (NMCAS)

This vault lives inside the **community-auto-scheduler** repository. The **exact product/thesis** of NMCAS may still be evolving in chat. Until the human defines it:

- State scope honestly in `wiki/overview.md` (e.g. "Purpose and scope: to be confirmed with project owner").
- After the human describes the project, **ingest** their raw docs and **replace** vague overview text with specifics.

---

## 10. Quality bar

- Prefer **small, linked** pages over one giant file.
- When unsure, add an **Open questions** section instead of guessing.
- Use **double quotes** in examples and titles inside this schema and in frontmatter string values.
- Keep **types and claims** aligned with sources; distinguish **inferred** vs **stated** when it matters.

---

## 11. First-ingest example (reference)

The vault includes one **bootstrap** raw note and the corresponding wiki updates. Use it as a template for future ingests. Paths:

- Raw: `raw/sources/2026-04-13-bootstrap-llm-wiki-pattern.md`
- Wiki: `wiki/sources/2026-04-13-bootstrap-llm-wiki-pattern.md`, `wiki/concepts/compounding-knowledge-base.md`, `wiki/overview.md`

---

*End of schema. Follow this document for every interaction in this vault.*
