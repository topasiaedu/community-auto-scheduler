# Raw source: Queue draft Resume + Value imageUrl path error (2026-08-27)

**Type:** Engineering bugfix session — Queue Drafts UX + single-message schedule publish path  
**Date:** 2026-08-27  
**Scope:** Web app (`apps/web`); Vercel deploy via Actions; related API validation on `POST /messages` fan-out  
**Operator context:** Edit pending → draft on Queue; Drafts tab **Resume** appeared broken; after Resume navigation worked, **Schedule** failed with `Value post imageUrl must be under posts/{projectId}/`

---

## 1. Symptom A — Resume does nothing

On Queue → **Drafts**, clicking **Resume** (and similarly **Edit** on a PENDING row after it was moved to draft) loaded form state in memory but **did not leave the Queue page**. Operators saw no editor.

### Root cause

`onContinueDraft` / `onStartEditPending` in `useNmcasApp` called `loadFormFromMessage` + `setEditingDraftId` only. The Schedule compose UI lives on `/schedule` (`SingleMessageSection`), and Schedule mode often defaults to **campaign** wizard via `sessionStorage`. No `navigate("/schedule")` and no force to **single** mode.

Also: `NmcasVmProvider` wrapped **outside** `BrowserRouter`, so `useNavigate` could not be used from the app hook until the provider was moved inside the router.

### Fix (commits)

- `205569d` — `fix: open Schedule editor when resuming or editing queue drafts`
  - `goToScheduleForDraft()` → `writeScheduleMode("single")` + `navigate("/schedule")`
  - `SchedulePage` switches to single mode when `editingDraftId` is set
  - `NmcasVmProvider` inside `BrowserRouter` (`main.tsx`)

---

## 2. Symptom B — `Value post imageUrl must be under posts/{projectId}/`

After Resume opened Schedule, scheduling the resumed draft failed with API error:

```
Value post imageUrl must be under posts/{projectId}/
```

That check lives on **fan-out** Value create (`POST /messages` when `fanOut: true` and `valueFormat: IMAGE_CAPTION`) and on campaign Value posts — storage paths must start with `posts/{activeProjectId}/`.

### Root cause

`SingleMessageSection` always treated Value as fan-out (`fanOut: true` whenever `operatorKind === "VALUE"`). On **Schedule →**, it always `POST`ed `/messages` with a fan-out body — even when `editingDraftId` was set (a **single-row DRAFT** that should be published with `PATCH /messages/:id`).

Side effects:

1. Wrong HTTP method/shape for draft publish (fan-out create vs patch draft).
2. Strict fan-out `imageUrl` prefix validation applied to whatever path was on the draft / form; misleading if path was empty, from another project, or the flow should not have been fan-out at all.
3. Draft save used legacy `onSaveDraftOnly` → `buildPatchDraftBody` (legacy POST/POLL shape), not P7 VALUE/REMINDER patch bodies.

### Fix (commits)

- `9f71e25` — `fix: publish resumed drafts via PATCH instead of fan-out POST`
  - While `editingDraftId` is set: **no fan-out**; `buildPatchSingleMessageBody(..., publish)` + `PATCH /messages/:id`
  - Hydrate `operatorKind` / `valueFormat` from the draft row on resume
  - Client `validateValuePostImagePath` for **new** fan-out creates (clearer UX error)
  - Tests: `apps/web/src/lib/singleMessageBuilders.test.ts`

---

## 3. Operator guidance (after deploy)

1. Queue → Drafts → **Resume** → should land on Schedule (single-message) with “Editing draft” banner.
2. **Schedule** / **Save draft** on a resumed draft → updates that row (PATCH), does not create N fan-out rows.
3. If a **new** (non-draft) Value fan-out still hits the `posts/{projectId}/` error: remove image and re-upload so path is `posts/{currentProjectId}/…`.

---

## 4. Open / follow-ups

- Confirm live Vercel deploy includes `9f71e25` before blaming remaining image-path errors on storage.
- Campaign wizard Value slots still empty in UI (`valuePosts: []`); unrelated to this session but still the only other caller of the same API prefix check.
- Legacy `onSchedule` / `buildPatchDraftBody` path in `useNmcasApp` may still be dead or parallel to `SingleMessageSection` — tidy later if unused.

---

## 5. Related code paths

| Area | Path |
|------|------|
| Resume / Edit handlers | `apps/web/src/hooks/useNmcasApp.ts` |
| Queue Resume button | `apps/web/src/components/QueueCard.tsx` |
| Single-message compose | `apps/web/src/components/schedule/SingleMessageSection.tsx` |
| Body builders | `apps/web/src/lib/singleMessageBuilders.ts` |
| Fan-out image prefix check | `apps/api/src/routes/messages.ts` (`posts/${projectId}/`) |
| Upload path shape | `apps/api/src/routes/uploads.ts` → `posts/{projectId}/{uploadId}/{name}` |
