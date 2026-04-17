# NMCAS — UI/UX improvement plan (working draft)

**Type:** Owner-authored working document (iterative).  
**Date:** 2026-04-17  
**Status:** Draft — revise until approved before implementation.

---

## 1. Purpose of this document

This file captures **what we have discussed** about NMCAS’s audience, current experience, user journeys, and **how we plan to improve** the product (UX direction, priorities, and optional data-model notes). It is meant to be **edited together** until the approach feels right, then used to drive implementation in the repo.

---

## 2. Product context (from the wiki)

- **NMCAS** is an internal web app to **compose, schedule, and auto-send** WhatsApp **posts** or **polls** to **community groups**, so operators are not tied to copy-paste or being online at send time.
- **Multi-project:** each **Project** has its own WhatsApp account, session storage, group list, and message queue.
- **V1:** MYT (UTC+8) hardcoded; Post + Poll; no recurring/templates in scope per PRD.
- **Target users (wiki):** *Any team member including interns.* **UI must be learnable without documentation.**

Design preference expressed in discussion: **modern, clean, Apple-like** — generous spacing, clear hierarchy, calm surfaces, plain language (not “developer console” copy).

---

## 3. Current state (brief)

- **Web:** Vite + React (`apps/web`), largely **one long column** (`max-width` ~40rem), **inline styles**, **developer-oriented copy** (e.g. P2–P3, API queue names, headers like `Authorization` / `X-Project-Id`).
- **Vault note:** P5 **UI overhaul** and full responsive polish have been **deferred**; polling is used for live updates (no SSE in current snapshot).
- **API:** Supabase Auth + `X-Project-Id` (scoped routes require a **valid project id**, not per-user membership); WA via Baileys pool; pg-boss for sends; `GET /messages` supports **query filters** (`status`, `type`) but the **web UI does not use them yet**.

### 3.1 Live UI snapshot (`http://localhost:5173/` — 2026-04-17)

Observed while signed in: **default browser chrome** (plain buttons, system sans-serif), **flat vertical stack** (reads like a document, not a framed app), **no cards/icons/spinner** for “Loading projects…”, intro line still includes **internal phase text (P2–P3)**, and an **“API”** section surfaces **queue name** (`send-scheduled-message`) to every user. Confirms priorities: **remove dev jargon from primary copy**, **demote diagnostics**, add **loading affordance** and **visual hierarchy**.

---

## 4. What we mapped — user journeys (summary)

Rough order of journeys operators actually follow:

1. **Cold start:** Open app → Supabase configured or blocked with setup instructions.
2. **Auth:** Sign in / sign up → JWT → optional **auto-join** seeded default project → load **projects** → pick **active project** (session storage).
3. **Project:** Optional **create project** → new WA workspace (new Storage session) → must **link WhatsApp** for that project.
4. **WhatsApp linking:** Poll **status** and **QR** → scan on phone → **connected** → **load groups**.
5. **Schedule:** Choose Post or Poll → pick group → compose → **MYT** datetime → **POST /messages** (min ~15s lead time enforced server-side).
6. **Post with image:** Upload via `**POST /uploads/post-image`** → path stored on the message row.
7. **Monitor:** List scheduled rows; statuses **PENDING / SENDING / SENT / FAILED**; errors on failed rows.
8. **Failure alerts:** One **global** failure recipient (env MSISDN — owner) for **all** projects; no per-project notify list in product scope for now.
9. **Diagnostics:** Unauthenticated **health** (and **ready**) for ops — should not dominate the main operator UI.

Edge paths: API down (WA status unavailable), no projects (seed / create), disconnected WA (scheduling disabled), session reset / QR refresh.

---

## 5. UX problems we called out

- **Hierarchy:** Scheduling (the core job) competes with **API/health** and long **technical** banners on one scroll.
- **Duplication / noise:** Connection (QR, instructions, buttons) can feel **repeated**; project dropdown shows **raw IDs** next to names.
- **Language:** Internal jargon and HTTP concepts where operators need **plain “what do I do next?”**
- **Learnability:** Wiki demands **no-docs** fluency; current shell still reads **engineer-first**.
- **Monitoring:** Backend can **filter** messages; UI does not — harder to scan when the list grows.
- **Mistakes:** No **cancel/edit** pending schedule from the product surface today (API gap, not only UI).

---

## 6. Design principles (keep it simple)

1. **One primary job per screen:** schedule a message; everything else supports or gets out of the way.
2. **Plain language first** — technical detail only under **Advanced** / diagnostics.
3. **Calm feedback** — loading, connected, and error states are visible and **actionable** (what to do next).
4. **Trust on project switch** — make “different project = different WhatsApp” obvious before someone sends.
5. **Don’t ship fear** — errors explain recovery; avoid blame-y or cryptic strings.

---

## 7. Direction — how we plan to improve (UX)

These are **design intent** items; exact tickets can be split later.

### 7.1 Information architecture

- **Primary surface:** “Schedule a message” (group → type → content → time → confirm).
- **Secondary:** WhatsApp **connection** as a clear setup region (one module: status + QR + actions).
- **Tertiary:** **Diagnostics** (health, queue names, deep troubleshooting) — collapsed or separate; not the first thing operators see.

### 7.2 Visual and interaction (Apple-like without copying pixels)

- **Typography scale:** Title / section / body / caption; one clear accent for primary actions.
- **Layout:** Neutral page background; **elevated cards** for sections; slightly wider or two-column layout on desktop where it helps (e.g. form + preview).
- **Status:** Compact **pill** or chip for WA connection (disconnected / connecting / connected) instead of only large alert strips.
- **Spacing:** More consistent spacing scale (tokens) instead of one-off inline values everywhere.

### 7.3 Copy

- Replace internal markers (e.g. phase labels) with **operator language**.
- Sign-in: explain **why** in one sentence; move **HTTP header** details to **“Advanced”** or docs.
- **MYT:** Short, consistent explanation once (tooltip or footnote).

### 7.4 Flow

- Optional **stepper** (1 Link → 2 Group → 3 Compose → 4 Time) for first-time clarity; must not block power users after WA is stable.
- **Project = WhatsApp account** made explicit when **switching projects** (avoid wrong-account sends).

### 7.5 Lists and monitoring

- **Use** `GET /messages?status=` / `?type=` in the UI (tabs or filters).
- **Scannable** rows: group, time (MYT), status chip, type; expand for full body/options/errors.
- **Pagination** or “load more” if history exceeds the API’s current cap (100) — product decision when volume appears.

### 7.6 Mobile

- Larger tap targets; consider **sticky** primary action on small screens (vault: responsive work was partial).

---

## 8. Primary scenarios (success looks like…)


| #   | Scenario                       | Success (simple)                                                                        |
| --- | ------------------------------ | --------------------------------------------------------------------------------------- |
| A   | First visit, WA not linked     | User can follow on-screen steps to **connect** without external docs.                   |
| B   | WA linked, schedule a **post** | User picks group, text/time, submits, sees row move toward **SENT** without confusion.  |
| C   | Schedule a **poll**            | Same as B; options and multi-select are obvious.                                        |
| D   | Switch **project**             | User notices they switched **WhatsApp workspace** and does not post to the wrong group. |
| E   | Something fails                | User sees **what failed** and **what to do** (retry, reconnect, contact ops).           |


---

## 9. Non-goals (this redesign pass)

- Full **marketing site** or public landing polish.
- **Multi-timezone** or recurring schedules (out of PRD V1).
- **WhatsApp Business API** migration.
- **Product analytics** (events, dashboards) — **skipped for now** (owner decision); revisit later if needed.

---

## 10. Success signals (lightweight)

Pick what you can measure; adjust targets when baseline exists.


| Signal            | Idea                                                                                        |
| ----------------- | ------------------------------------------------------------------------------------------- |
| **Task success**  | In a hallway test, new user completes **schedule post** without help (yes/no).              |
| **Time**          | Median time from “connected” to **Schedule** clicked (informal stopwatch is fine at first). |
| **Support noise** | Fewer “how do I…?” messages about linking or project scope.                                 |
| **Error clarity** | Failed rows + toasts read in **plain language** (spot-check).                               |


---

## 11. Accessibility & quality (minimum bar)

- **Keyboard:** Primary flows usable without mouse (tab order, schedule button, dialogs).
- **Focus:** Visible focus ring on interactive elements.
- **Semantics:** Headings match outline; buttons are `<button>`; alerts use `role` where appropriate.
- **Contrast:** Text and chips meet a sensible contrast bar for internal use (aim **WCAG 2.2 AA** where cheap).

---

## 12. Data / backend alignment — **owner decisions** (2026-04-18)


| Topic                                    | Decision                                               | Notes for implementation                                                                                                                                                                                                                                                                                          |
| ---------------------------------------- | ------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Failure recipient**                    | **Single global recipient** (you) for **all** projects | Keep using `**NMCAS_FAILURE_NOTIFY_MSISDN`** (or equivalent env). No per-project notify UI. The `**NotifyRecipient`** table in Prisma can remain unused for now or be cleaned up later — behavior matches one ops number.                                                                                         |
| **Cancel / edit pending**                | **Yes** — not punishing                                | **Edit:** move row to a **draft-like** state (e.g. status `**DRAFT`** or equivalent) so the send job **does not run** while the user is editing; on save, return to **PENDING** and re-queue with the new time/content. **Cancel:** keep explicit **cancel** (status `**CANCELLED`**, remove/cancel pg-boss job). |
| **Attribution**                          | **Yes**                                                | Store `**createdByUserId`** (Supabase user id) on `**ScheduledMessage`** so shared projects show who scheduled what.                                                                                                                                                                                              |
| **Convenience (last group / favorites)** | **Yes**                                                | Persist **last-used group** and/or **favorites** per user+project (small preference table or fields — TBD in schema).                                                                                                                                                                                             |
| **Audit (`updatedAt`, etc.)**            | **Skip for now**                                       | No extra audit fields required until needed.                                                                                                                                                                                                                                                                      |


**Access model (implemented):** **Org-wide project access** — any signed-in user may `**GET /projects`** (all projects) and use `**X-Project-Id`** for any existing project. There is **no** per-account project ACL; `AUTH_AUTO_JOIN_DEFAULT_PROJECT` and membership checks were removed from the API. The `**ProjectMember`** Prisma model remains in the schema but is **not** used for authorization (optional future cleanup or reuse).

---

## 13. Proposed phases — acceptance (simple “done when”)

Phases can be reordered after your edits.


| Phase                   | Ships                                                                                                                                   | Done when (draft)                                                                |
| ----------------------- | --------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------- |
| **1 — Foundation**      | Tokens/shell, copy pass, one **connection** module, diagnostics **hidden or collapsed**                                                 | No P2–P3 / queue names in **primary** UI; loading states don’t look broken       |
| **2 — Core scheduling** | MYT help, validation (incl. min lead time), project switcher **without raw IDs** in the default label                                   | Scenarios A–D feel doable without docs                                           |
| **3 — Monitoring**      | Filters/tabs for list, better empty states, optional pagination                                                                         | Scenario E improved; list scannable at ~100 rows                                 |
| **4 — Gaps**            | **Cancel**, **edit → draft**, re-queue; **attribution** + **convenience** prefs; **global** failure alert (env) — no NotifyRecipient UI | Mistake recovery + draft edit flow; single failure recipient behavior documented |
| **5 — Polish**          | Responsive, a11y pass                                                                                                                   | Mobile usable; keyboard path works                                               |


---

## 14. Resolved product choices


| Topic                    | Choice                                                                                                                        |
| ------------------------ | ----------------------------------------------------------------------------------------------------------------------------- |
| **Branding**             | Visual design can follow **what looks good and appropriate** (clean, modern); no extra branding lock-in required in this doc. |
| **New users & projects** | **Yes:** all signed-in users see and may use **all** projects (§12 access model).                                             |
| **Language**             | **English** UI only for this pass.                                                                                            |
| **Analytics**            | **Skip for now** (no product analytics events required).                                                                      |


**Still flexible:** exact **phase** for cancel/edit/draft (e.g. phase 4 vs earlier) can be decided when breaking work into tickets.

---

## 15. Revision log


| Date       | Change                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| ---------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 2026-04-17 | Initial draft (audience, journeys, UX direction, DB notes, phased plan).                                                                                                                                                                                                                                                                                                                                                                                     |
| 2026-04-17 | Added live localhost snapshot, design principles, scenarios, non-goals, success signals, a11y bar, phase acceptance table, open questions; fixed markdown in journeys + data table.                                                                                                                                                                                                                                                                          |
| 2026-04-18 | §12 locked: global failure recipient; draft-on-edit + cancel; attribution + convenience yes; audit skipped; new-user access to all projects; branding/language/analytics resolved; phase 4 updated.                                                                                                                                                                                                                                                          |
| 2026-04-18 | Org-wide access **implemented** in API: project-exists check for `X-Project-Id`, `GET /projects` lists all projects, removed `AUTH_AUTO_JOIN` / membership gate; §12 + §3 + §14 updated.                                                                                                                                                                                                                                                                     |
| 2026-04-18 | Full UX plan **implemented** in repo: design tokens + app shell, single WhatsApp panel, diagnostics `<details>`, MYT hint + min lead validation, project name-only picker + switch hint, message filters + cards, `DRAFT`/`CANCELLED` + `pgBossJobId`/`createdByUserId`, cancel/draft/patch routes, `UserProjectPreference` + GET/PATCH `/preferences`, web draft/edit/cancel + attribution line, sticky schedule actions on small screens, README API list. |


---

*Next step: edit this file until you are happy with the plan; then translate sections into concrete tasks in the codebase.*