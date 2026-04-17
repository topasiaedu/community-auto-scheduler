# NMCAS — Professional UI/UX Audit v2

**Type:** Design audit  
**Author:** AI design lead  
**Date:** 2026-04-17  
**Status:** Final — drives next implementation sprint

---

## Preface

This is a candid, page-by-page critique of the current NMCAS web app. The previous plan described *what to build*; this document names *what is wrong right now* and gives precise direction on how to fix each issue. Nothing here is theoretical — every finding is traceable to actual code, actual JSX, actual CSS.

The standard I am holding this to: **a professional internal tool that operators trust**, not a demo app, not a student project. The benchmark is Linear, Vercel Dashboard, Supabase Studio — not Material UI defaults.

---

## 1 — Information Architecture

### 1.1 Current IA

```
/sign-in
/dashboard    → Overview
/connect      → WhatsApp + Diagnostics
/schedule     → Schedule form
/messages     → Message list
/account      → Project picker + sign out
```

### 1.2 Problems

**Project belongs in the top bar, not behind a nav link.**
Every single action in this app is scoped to the active project. Putting project selection behind `/account` means the operator has no idea which project they are on until they navigate away from their work. On Linear, Vercel, Supabase — the workspace/project is always in the top-left or top-right header. It is the first piece of context, not the last.

**"Messages" is ambiguous and wrong.**
The word "messages" describes WhatsApp messages, emails, SMS, DMs — anything. What this page actually shows is the **send queue** — things that were scheduled, are pending, failed, or sent. It should be called "Queue", "Sends", or "Broadcasts". The current name makes new operators wonder "which messages? from whom?"

**"Account" is misleading.**
There are no account settings on this page — no password change, no 2FA, no notification preferences. What is there is: active project, sign out, create project. That is **Workspace**, not Account.

**"Overview" (Dashboard) adds nothing.**
The page shows 5 stat cards and a shortcut row. But if you already have a top nav, shortcuts are redundant. And the stats are thin: "Upcoming: 3" tells you nothing about *when* the next send is. The dashboard needs to earn its place or be removed.

**Diagnostics should not be a page.**
API health and queue name are ops/developer information. Operators do not need to navigate to `/connect` to see "Queue: send-scheduled-message". Diagnostics should be a collapsible panel accessible from the user menu or a `/settings` page, not a primary-nav destination.

### 1.3 Recommended IA

```
/sign-in                  — Auth only
/                         → redirect to /queue
/queue                    — The primary page: scheduled sends
/compose                  — New post or poll (replaces /schedule)
/connect                  — WhatsApp link status (when not connected, banner on all pages)
/settings                 — Project management, sign out, diagnostics (advanced)
```

Active project: **persistent dropdown in the top-right header**, visible on every page.

---

## 2 — App Shell (Global)

### 2.1 Project selector position

**Finding:** Project is on `/account`. It is completely hidden during normal operation.

**Fix:** Move project selector into the shell header, top-right area, as a compact `<select>` or a dropdown button showing the current project name. Pattern: Vercel dashboard project switcher, Supabase organization switcher. Format: `[ProjectName ▾]` — single click to switch.

### 2.2 Nav labels and order

Current nav: `Overview · WhatsApp · Schedule · Messages · Account`

Problems:

- "Overview" is padded filler before you get to work
- "Schedule" describes an action (a verb), not a destination — inconsistent with the rest
- "Messages" is wrong (see §1.2)
- "Account" is wrong (see §1.2)

Recommended nav: `Queue · Compose · Connect · Settings`

Why this order: **Queue** is where operators spend most time (monitoring). **Compose** is the primary action (scheduling). **Connect** is setup. **Settings** is rare. The nav order reflects frequency of use descending.

### 2.3 Header chrome

**Finding:** The header has `MYT · UTC+8` as a persistent pill. This takes up real estate for information that is only relevant when the user is composing a schedule. It belongs as a tooltip on the datetime field, not in the global header.

**Finding:** User email is displayed raw in the header and truncated at 14rem. Either show only the part before `@`, or use an avatar/initials circle with the email in a dropdown.

**Fix:** Remove the MYT pill from the header. Replace email text with an avatar element (initials from email) that opens a small menu on click: active user, sign out.

---

## 3 — Sign-in Page

### 3.1 Current state

Two-column layout: left hero, right form card. The hero has a kicker, headline, body paragraph, and a bullet list.

### 3.2 Problems

**The hero bullet list reads like a sales pitch nobody asked for.** This is an internal tool. The people signing in already know what NMCAS does — they were told to use it. A bullet list of "Org-wide project list / Per-project WhatsApp link / Drafts, edits, and delivery status" is a SaaS landing page pattern misapplied to an internal tool. It wastes the left column.

**The headline is weak.** "Run WhatsApp posts and polls on time." — the emphasis on *on time* sounds like a customer complaint ("we keep missing sends"), not a product statement.

**The form has two toggle buttons for mode.** Sign in vs. Sign up as two side-by-side buttons that look like tabs — this pattern is unusual. Most internal tools do not offer self-service sign-up in the UI at all; they provision accounts via invite. If sign-up must exist, a link below the form ("No account yet?") is cleaner.

### 3.3 Recommended direction

Left: Large product wordmark/logo, one strong tagline, and a short context sentence. No bullets.
Right: Clean sign-in form. Email + password + primary CTA. "Create account" as a plain text link below, not a tab.

The visual weight of the left column should come from **spacing and typography**, not content volume.

---

## 4 — Queue Page (currently "Messages")

This is the **most-used page** in the app. An operator checks this page after every send, every day.

### 4.1 Current state

A single `<section class="app-card">` containing:

- Two `<select>` dropdowns for filter (Status, Type) plus a "Refresh list" button
- A `<ul>` of `<li class="message-card">` items
- Each card has: group name, type chip, status chip, scheduled time, optional "Scheduled by" line, a Details/Less toggle, and action buttons

### 4.2 Problems

**The filter row looks like a 2003 HTML form.** Two naked `<select>` elements with labels inline, plus a button. No visual grouping, no tab-style filter affordance, no pill/toggle. It looks bolted on.

**Status values are ALL CAPS.** `PENDING`, `DRAFT`, `CANCELLED`, `FAILED` — all uppercase in chips. This is a database enum leaking into the UI. Operators read "Pending", "Draft", "Cancelled" — mixed case, human language.

**The "Details" expand button is too subtle.** A ghost button that says "Details" does not communicate that there is hidden content. Users do not discover it. Pattern: a chevron icon (`›`) on the right edge of the card, which is a universal "expand" signal.

**All cards look identical regardless of status.** A FAILED card and a SENT card are visually the same except for a small chip. Failed items need to demand attention. Pending items need to feel "in flight". Draft items need to feel "incomplete". Visual differentiation is a core usability feature here, not decoration.

**Action buttons ("Edit", "Cancel", "Continue editing") are full-size buttons inside the card footer.** This creates visual noise. These should be smaller secondary actions — icon+text or compact link-style buttons.

**"Continue editing" is verbose.** Say "Resume" or "Edit draft".

**"Scheduled by" shows a UUID substring.** `Scheduled by 3a7f8b2e…` tells an operator nothing. Either show the full email, or "You" vs. "[teammate@email.com](mailto:teammate@email.com)", or omit if there is only one user. UUID fragments are developer information.

**No empty state.** When there are no messages, the list is blank — no illustration, no CTA, no explanation. An empty state is a high-value UX moment: "Nothing scheduled yet. Compose your first post ↗".

**No visual grouping by date or status.** A flat list of 10+ mixed-status items is hard to scan. At minimum, group by status section: a "Needs attention" section (FAILED), then "Scheduled" (PENDING/SENDING), then "Drafts", then "History" (SENT/CANCELLED).

### 4.3 Recommended direction

- Replace filter selects with **status tab pills**: `All · Scheduled · Drafts · Sent · Failed`
- Each card: left accent stripe color-coded by status (red=failed, blue=pending, gray=sent, amber=draft)
- Group name + message preview truncated to 1 line
- Time on its own line, formatted as "Today at 3:00 PM" or "Fri 18 Apr at 3:00 PM"
- Expand via a chevron on the right edge
- Actions on expanded: compact link-style ("Edit · Cancel" for pending; "Resume · Discard" for drafts)
- Empty state per filter tab with a clear CTA

---

## 5 — Compose Page (currently "Schedule")

The primary action in the product. Currently a single `<section class="app-card">` with a grey-out when WhatsApp is not connected.

### 5.1 Problems

**The form has no steps or visual progression.** The operator sees: type toggle → group select → message body → image → datetime → submit. This is a flat dump of fields. There is no sense of "what comes next" or "I'm almost done." The eye has nowhere to go.

**"Message type" uses raw radio inputs.** Browser-default radio buttons in 2026 are not acceptable for a professional tool. This should be a **segmented control** or two card-style options with icons.

**"Group" is a `<select>`.** Fine for power users; but for a first-time user with 5 groups listed, a `<select>` gives no sense of "which group is this?" A searchable select or a card-picker would serve better at scale. For now: at minimum, style it properly with a custom chevron.

**"Message" label over a `<textarea>`.** Operators are composing a WhatsApp post. "Post content" or "Your message" is more human than just "Message" (the field label competes with the nav item that was also called "Messages").

**No character count.** WhatsApp has a 65,536-character soft limit for text. A character count at the bottom-right of the textarea is standard affordance that operators need to see.

**Image upload is a raw `<input type="file">`.** This is the worst UI element in the app. It renders a system file-picker button that looks completely out of place. This must be a **drag-and-drop zone** or at least a styled button with an icon.

**The datetime field is `<input type="datetime-local">`.** Browser chrome renders this differently per OS/browser and it looks nothing like the rest of the UI. The label "Send at (MYT)" is undersized and the hint "Minimum 15 seconds from now" is technically accurate but contextually strange — nobody is scheduling something 16 seconds from now. The realistic minimum is a few minutes. Consider: pre-populate the field with "tomorrow at 9:00 AM" as a sensible default.

**The submit button says "Schedule".** Fine. But "Save draft" is a secondary action and it only appears when editing a draft. New users composing a message for the first time never see the draft option. Consider: a small "Save as draft" link below the submit button, always visible.

**The grey-out when WhatsApp is not connected.** The entire form becomes 55% opacity and pointer-events none. This is a heavy-handed block. Instead: show a banner above the form: "WhatsApp not connected — [Go to Connect ↗]" and let the user still compose (save as draft) even without a connection.

### 5.2 Recommended structure

```
Step 1: What are you sending?
  [Post]  [Poll]           ← segmented control with icons
  
Step 2: Where?
  Group: [searchable select or styled dropdown]
  
Step 3: Content
  (for Post) Message text field + image drop zone
  (for Poll) Question + option rows + multi-select toggle
  
Step 4: When?
  Send at [styled date/time picker] (MYT)
  
Footer: [Save draft]   [Schedule send →]
```

Give each step a light visual separator or step number — not a multi-page wizard, just visual breathing room.

---

## 6 — Connect Page (currently "WhatsApp")

### 6.1 Problems

**Four action buttons in a row for QR linking.** "Refresh status · Refresh QR · Try load groups · Clear session & new QR" — four buttons of equal visual weight. An operator has no idea which to press first. The most common action (scan QR) requires no button; the next most common (refresh after scanning) is "Refresh status". The rest are recovery actions.

**"Try load groups" sounds like a developer wrote it.** No end user says "try load". Say "Load groups" or remove it (groups should load automatically after connecting).

**The QR code floats inside a yellow warning alert.** The yellow alert styling (`alert--warning`) is designed for errors or important notices. Using it as a container for the QR scan flow (which is a normal part of setup) reads as alarming. QR scanning should be its own card with calm styling.

**The step-by-step instructions are an `<ol>` inside the alert.** Text instructions are fine, but they are buried inside a styled alert and look like warning text. They should be a clean numbered guide with visual separation from the QR code itself.

**When connected, the card just shows "Connected" pill + "Refresh groups" button.** That is it. No group count, no account info, no indication of how long connected. The operator has no confidence that the connection is healthy.

### 6.2 Recommended direction

Two clear states:

**Not connected:**
Centered card (not an alert). Title: "Link your WhatsApp account". Steps: numbered guide on the left, QR code on the right (or stacked on mobile). Primary action: nothing to press (scanning is the action). Secondary: "Having trouble? Clear session and try again" — one link, not four buttons.

**Connected:**
Compact status row: green dot, account phone number (if available from Baileys), `(n) groups loaded`, last-connected time. Secondary action: "Unlink account" (destructive, requires confirm). No yellow alerts.

---

## 7 — Settings Page (currently "Account")

### 7.1 Problems

**The page is called "Account" but has no account settings.** No password, no 2FA, no email change, no preferences. What it has is workspace/project management.

**Project picker and create-project form are on the same page.** These are different tasks. Picking an active project is a daily operation; creating a new project is rare. They should be separated by clear visual hierarchy — the picker first, the creation form at the bottom as a secondary affordance or behind a "New project" button.

**Sign-out is a ghost button next to the user's email.** Ghost buttons are for low-emphasis actions. But sign-out is irreversible and deserves at least a normal bordered button. It should also be confirmed, or clearly separated from account info.

### 7.2 Recommended direction

Rename to "Settings". Sections:

1. **Workspace** — project picker with description text, switch warning
2. **Projects** — list of all projects with "New project" button that opens an inline form/modal
3. **Session** — sign-out button, clearly labeled

---

## 8 — Visual Design System

### 8.1 Typography

**Problem:** The current scale is compressed and inconsistent. Card titles use `.page-header__title` (1.5rem/700) but inline section titles use `.app-section-title` (0.75rem/600/uppercase). There is no mid-level heading — a 1.125rem/600 H3 for named sections within cards.

**Fix:** Define and enforce a 4-level type scale:

- `display`: 1.5rem / 700 — page titles only
- `heading`: 1.125rem / 600 — card/section headings
- `body`: 0.9375rem / 400 — default text
- `label`: 0.8125rem / 600 — field labels, section eyebrows
- `caption`: 0.75rem / 400 — timestamps, hints

### 8.2 Color

**Problem:** The accent color (#2563eb, Tailwind blue-600) is fine but it is used inconsistently. Primary buttons are blue. The nav active state is blue. The MYT pill is blue. The project-switch hint is blue. The `auth-page__kicker` is blue. Everything important is blue — which means nothing is.

**Fix:** Reserve blue strictly for **interactive/actionable** elements (buttons, links, active nav). Use neutral slate for all informational accents.

**Problem:** Status chips use background color only to differentiate. Low contrast on PENDING (yellow-bg) and DRAFT (light-blue-bg) do not pass AA at small sizes.

**Fix:** Status chips should have both a colored left border (4px) AND a very light background tint. The text should always be near-black (#0f172a) for readability. Color as reinforcement, not as the primary signal.

### 8.3 Spacing

**Problem:** Cards use `padding: var(--space-5)` (1.25rem) uniformly. On larger screens this feels tight. The stat cards on the dashboard use `padding: var(--space-4)`. Page content uses no max-width within the shell-main, so on wide screens a stat card is narrow but a form card stretches full width.

**Fix:** Constrain form content to `max-width: 40rem` within cards. Stat grid uses `auto-fill minmax(11rem)` which creates single-column on narrow and 5-column on wide — add a `max` column width to prevent cards from becoming too wide.

### 8.4 Inline styles

**Problem:** There are scattered inline styles throughout components:

- `style={{ display: "flex", alignItems: "center", gap: "var(--space-3)", flexWrap: "wrap" }}`  
- `style={{ marginTop: "var(--space-5)" }}`  
- `style={{ opacity: waConnected ? 1 : 0.55, pointerEvents: waConnected ? "auto" : "none" }}`

Every inline style is a design decision that is invisible to the design system. These should all become CSS classes.

### 8.5 Buttons

**Problem:** All buttons have the same height (44px) and very similar padding. The primary action button does not stand out enough from secondary actions in the same row.

**Fix:** Primary button: 44px height, bolder weight (600), slightly wider padding. Secondary: 36px height, lighter border. Ghost/link: no border, text only. This creates a clear hierarchy: one primary, several secondary, optional ghost.

---

## 9 — Interaction Design

### 9.1 No feedback on success

**Problem:** When a message is successfully scheduled, nothing happens except the form clears. There is no toast, no confirmation, no animation. The operator has to scroll down to the queue and find the new row to confirm it worked.

**Fix:** Show a toast notification: "Scheduled for Friday, 18 Apr at 3:00 PM MYT" — auto-dismiss after 4 seconds. This is the single highest-impact interaction improvement available.

### 9.2 No loading states on actions

**Problem:** When the submit button is pressed, it changes to "Working…" text but the button is otherwise unchanged. There is no spinner, no progress indicator.

**Fix:** Add an inline spinner (the existing `.spinner` class) to the left of the button label when in loading state.

### 9.3 Polling without indication

**Problem:** The app polls WhatsApp status every 3 seconds and messages every 8 seconds — silently. The operator has no way to know if the data they are seeing is fresh or stale.

**Fix:** Show a subtle "Last updated X seconds ago" line near the queue or a small animated pulse on the status indicator when it is polling.

### 9.4 Confirmation for destructive actions

**Problem:** "Cancel" on a pending message calls `window.confirm()` — a browser native dialog that is styled inconsistently with the app and breaks immersion.

**Fix:** Replace with an inline confirmation: the "Cancel" button changes to ["Confirm cancel" | "Never mind"] row inline within the card. No modal, no browser dialog.

---

## 10 — Copy & Language


| Current                       | Problem                   | Fix                                                |
| ----------------------------- | ------------------------- | -------------------------------------------------- |
| "Messages" (nav)              | Generic, ambiguous        | "Queue" or "Sends"                                 |
| "Account" (nav)               | Wrong — it's workspace    | "Settings"                                         |
| "Schedule" (nav)              | Verb, not a destination   | "Compose"                                          |
| "Overview" (nav)              | Filler page               | Merge into Queue or remove                         |
| "PENDING", "DRAFT" etc        | DB enum leak              | "Pending", "Draft" etc                             |
| "Scheduled by 3a7f8b…"        | UUID substring            | Show email or "You"                                |
| "Try load groups"             | Developer copy            | "Load groups"                                      |
| "Clear session & new QR"      | Jargon-heavy              | "Start over" (destructive confirm explains detail) |
| "Minimum 15 seconds from now" | Technically true, useless | Remove or make it "At least a few minutes ahead"   |
| "Message" (textarea label)    | Generic                   | "Post content"                                     |
| "Working…" (submit state)     | Vague                     | "Scheduling…" or "Saving…"                         |
| "Continue editing" (button)   | Too long                  | "Resume" or "Edit draft"                           |


---

## 11 — Prioritised Fix List

Ordered by impact vs. effort. Address in order.

### P0 — Structural (one sprint, breaks current confusion)

1. Move project selector to top-right header — all pages, always visible
2. Rename nav: Queue · Compose · Connect · Settings
3. Rename "Account" page to "Settings", separate project list from project creation
4. Remove Dashboard/Overview — redirect `/` to `/queue`

### P1 — Queue page (highest-traffic page)

1. Status tab-pill filters (replace `<select>` filters)
2. Status chips: mixed-case text, left-accent-stripe card pattern, color by status
3. Expand via chevron (replace "Details" ghost button)
4. Empty state with CTA when no messages
5. "Scheduled by" shows email, not UUID
6. Replace "Continue editing" with "Resume" and "Cancel" confirmation goes inline

### P2 — Compose page

1. Segmented control for Post/Poll type (replace radios)
2. Drag-and-drop image upload zone (replace `<input type="file">`)
3. Character counter on message textarea
4. Pre-populate datetime with a sensible default (tomorrow 9AM MYT)
5. "Save as draft" always visible below form, not only in edit mode
6. Banner instead of opacity lock when WA not connected

### P3 — Connect page

1. Split QR flow from "Connected" state into two distinct card designs
2. Reduce 4 action buttons to 1 primary + 1 recovery link
3. Rename "Try load groups" to "Load groups"

### P4 — Shell polish

1. Avatar/initials circle for user, opens dropdown (email + sign out)
2. Remove MYT pill from header; move to datetime field tooltip
3. Success toast on schedule/save actions
4. Inline spinner on loading buttons
5. Eliminate all inline `style={{}}` in JSX — move to CSS classes

---

## 12 — What "done" looks like

When this audit is fully addressed, a new operator should be able to:

1. Open the app, sign in, and immediately see which project is active (top-right) and how many sends are queued.
2. Click "Compose", fill in their post, pick tomorrow 9AM, and press "Schedule" — receiving a green toast confirmation.
3. Navigate to "Queue" and see their send listed with a blue "Pending" badge.
4. If WhatsApp disconnects overnight, see a prominent banner on every page — not just /connect.
5. When a send fails, see a red "Failed" card that is visually distinct and click "Retry" (or see why it failed in plain English).

None of this requires a redesign of the product. It requires applying professional UI craft to what already exists.

---

## 13 — Revision log


| Date       | Change                                                  |
| ---------- | ------------------------------------------------------- |
| 2026-04-17 | Initial audit — full critique of current implementation |


