---
title: "Queue draft Resume + Value imageUrl path (2026-08-27)"
type: "source-summary"
updated: "2026-08-27"
sources: 1
tags: ["nmcas", "queue", "drafts", "value-post", "ux", "bugfix"]
---

# Queue draft Resume + Value imageUrl path (2026-08-27)

**Raw:** `raw/sources/2026-08-27-queue-draft-resume-imageurl-session.md`

## Summary

Two linked web bugs on the same operator path: **Edit pending → Draft → Resume → Schedule**.

1. **Resume** appeared broken — form state updated in memory but the UI stayed on Queue; no navigation to Schedule single-message compose (`205569d`).
2. After Resume worked, **Schedule** failed with API `Value post imageUrl must be under posts/{projectId}/` because the compose form treated every Value as **fan-out `POST /messages`**, including resumed **single-row drafts** that must use **`PATCH /messages/:id`** (`9f71e25`).

## Root causes

| Symptom | Cause |
|---------|--------|
| Resume no-op | `onContinueDraft` / `onStartEditPending` never `navigate("/schedule")` or force schedule mode `single`; provider was outside `BrowserRouter` |
| imageUrl prefix error | `SingleMessageSection` always set `fanOut: true` for VALUE and always POSTed; fan-out create enforces `imageUrl.startsWith("posts/{projectId}/")` |

## Fixes

| Commit | Change |
|--------|--------|
| `205569d` | Navigate to `/schedule` + single mode on Resume/Edit; `NmcasVmProvider` inside router |
| `9f71e25` | Draft schedule/save via PATCH + `buildPatchSingleMessageBody`; no fan-out while editing; hydrate kind/format from draft; client path validation for new fan-out |

## Operator notes

- Resume → Schedule (single) with “Editing draft” banner is expected.
- Publishing a resumed draft updates **that** row; it does **not** fan out to all active communities.
- New Value fan-out still requires a fresh upload under `posts/{activeProjectId}/…`.

## See also

- [[wiki/entities/scheduled-message]]
- [[wiki/concepts/value-vs-reminder-messages]]
- [[wiki/overview]]
- P8-B fan-out brief: `raw/sources/2026-07-10-p8b-value-fan-out-active-communities.md`
