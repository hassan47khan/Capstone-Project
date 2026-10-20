# 11 — Missing Screens: Calendar, AI Epic, System States

**Prerequisites:** `01`, `02`, `03`, `04`.
**Deliverable:** the Calendar tab, the AI feature, and every system state.
**Figma frames:** Calendar — **none**. AI epic — **6 designed** (newer file `IKYivyJtmBYzJNQ7g8qPGc`, nodes `110:*`; see §2). System states — none.

> §1 (Calendar) and §3 (system states) are missing from the prototype but
> required by the app. §2 is the graded capstone requirement; it is now designed,
> but it is still the highest-risk item in the project.

---

## §1 — Calendar tab

The Calendar tab appears in every tab bar in the prototype. **Zero Calendar
screens exist.** The tab currently leads nowhere.

### Layout

| Section | Spec |
|---|---|
| Header | Month + year in `display.md`, with ‹ › navigation and a "Today" action |
| Month grid | 7 columns; each day cell shows the date and up to 3 category-colored dots |
| Today | Ringed in `color.accent` |
| Selected day | Filled `color.accent`, text `color.onAccent` |
| Month total | Below the grid — "$129.20 due in October" |
| Charge list | Grouped by day, `ListRow` per charge, running total per day |

Tapping a day filters the list to that day. Tapping again clears. Tapping a
charge opens SubscriptionDetail.

### Data
`/analytics/upcoming?days=…` scoped to the visible month, extended to accept a
date range. Past months show what **was** charged; future months show what
**will be**, projected from each cycle.

### States
| State | Behavior |
|---|---|
| Loading | Grid skeleton; month header renders immediately |
| Empty month | Grid renders; list shows "No charges in {Month}" |
| Month before the first subscription | "You weren't tracking anything yet" |
| Far-future month | Projection works indefinitely; caption notes figures are projected |
| Day with 4+ charges | 3 dots + a "+2" indicator |

### Accessibility
- Grid is `accessibilityRole="grid"`; each day a `gridcell`.
- Day cells announce content: *"October 12, 1 charge, Netflix $15.49."*
- Empty days: *"October 13, no charges."*
- Month navigation announces the new month on change.
- Dots are decorative — the announced text carries the information.
- Swipe between months has an accessible-actions equivalent.

---

## §2 — AI epic ⚠️ GRADED REQUIREMENT

**Status: designed, not yet built.** The newer Figma file (`IKYivyJtmBYzJNQ7g8qPGc`)
adds six teal-style frames for this epic. They are measured below. Where a frame
contradicts the rules in `00`–`04`, the spec says what to build and why.

| Screen | Node | Measured? |
|---|---|---|
| ConnectEmail | `110:14` | ✅ node-level |
| ConnectEmail — failed | `110:496` | structure only (same as `110:14` plus an error card) |
| ReviewExtraction | `110:125` | structure only (same as `110:432`, no flagged field) |
| ReviewExtraction — low confidence | `110:432` | ✅ node-level |
| TrialShield | `110:186` | ✅ node-level |
| SharedPlans | `110:266` | ✅ node-level |
| ~~`2 - Dashboard`, `1b - Connect Email (failed)`~~ | `113:641`, `113:765` | **Stale — do not build.** Indigo palette, Inter-style font, "Maya", $87.46, a different tab bar (Home / Trials / Split / Insights). `110:496` replaces `113:765`. |

**Not designed, still required:** the inbox-scanning/progress state, the
"nothing found" state, the multi-result list, the duplicate prompt, the
"New shared plan" flow, the "Cancel guide" content, and the Contract-alert source.
Each has a decision in §2.8.

### 2.1 Decision first: how the app reads email

The frames show **OAuth inbox access** ("Connect Gmail" / "Connect Outlook",
"Read-only access. We only look at receipts and confirmations."). The earlier
version of this spec recommended a forwarding address instead. The design wins the
argument on UX, but it carries a cost the team must accept deliberately:

- Gmail read access is a **restricted OAuth scope**. A public release needs Google's
  verification and a security assessment. A capstone can run the app in OAuth
  **Testing** mode with a short list of named test users — confirm the current
  limits in Google's console before the demo.
- Outlook needs a Microsoft Graph app registration and `Mail.Read`.

**Recommendation (decision for Hassan):** build **Gmail only**, read-only, in
Testing mode, with a narrow search query (receipts, trials, renewals). **Hide the
Outlook button** for the MVP — a button that does nothing is a dead end
(`00` rule 5). Keep the extraction pipeline input-agnostic (`raw_text → fields`), so
the eval harness (§2.7) runs on fixture emails and never touches OAuth.

### 2.2 Extraction contract

The designs extend the old contract. Strict JSON schema, enforced on every model
output:

```
service_name · plan_name · price · currency · billing_cycle · subscription_type
(paid | trial) · trial_ends_on · start_date
+ per-field confidence (0–1) + the source span each value came from
```

- **Grounding rule:** every extracted value must be found in the email text (after
  normalizing dates and currency symbols). A value that is not found is **blanked
  and flagged**, never shown as a guess.
- **Confidence is computed, not self-reported.** Models are poor at calibrated
  self-confidence. Derive it from checks: schema-valid, value grounded verbatim,
  currency/cycle parsed unambiguously, date plausible. The UI shows these numbers,
  so they must mean something. Report their calibration in the eval (§2.7).
- **Bands (inferred from the two review frames):** ≥ 90% green chip · 60–89% amber
  chip · < 60% flagged field (border + helper text).
- The row labelled **Price** in the UI is three fields (amount, currency, cycle). Tapping it opens one editor for all three.

### 2.3 ConnectEmail (`110:14`, error `110:496`)

| Element | Measured | Build |
|---|---|---|
| Layout | padding 24 top / 20 sides / 32 bottom, gap 18 | Same |
| Brand row | 32px mark + "SubTrak" DM Serif 22, tracking −0.4 | Same |
| Headline | DM Serif 30 | Nearest token in `01 §3` — do not add a 30px size |
| Sub-copy | DM Sans 15, `textMuted` | Same |
| Benefits card | `surface`, 1px `border`, radius 6, padding 16, gap 14; each row = 44px tile (`surface2`, radius 12, 22px icon) + title 14 SemiBold + description 12 `textMuted` | Same |
| Primary | `accent`, radius 6, padding 15, 15 SemiBold white — "Connect Gmail" | `Button primary` |
| Secondary | `surface`, 1px `border`, `accent` label — "Connect Outlook" | **Hidden in MVP** (§2.1) |
| Footnote | 12 `textMuted`, centered — "Read-only access. We only look at receipts and confirmations." | Same |

**Missing exit:** the default frame has no way to continue without connecting. Add
a text button **"Not now — add manually"** below the footnote. The error frame
already has "Add a subscription manually"; use the same label in both.

**Error variant (`110:496`):** a danger-tinted card with an alert icon — "Couldn't
connect to Gmail / Access was denied or timed out. You can try again or add
subscriptions yourself." Primary becomes **Try again**, secondary **Add a
subscription manually**. Danger is correct here: this is a real error.

**Where it lives:** shown from the first-run empty state (`05 §6` gains a second
CTA, "Find them in my email") and from Settings → Connected email. Present it as a
stack screen with a back affordance, not as a launch screen.

### 2.4 ReviewExtraction (`110:125`, `110:432`)

| Element | Measured (`110:432`) |
|---|---|
| Header | Back link (20px icon + 14 Medium `accent`); eyebrow "Review before saving" 14 `textMuted`; title DM Serif 26 |
| Provenance chip | Pill, `surface2`, 1px `border`, 11 SemiBold `accent`, uppercase — "AI DETECTED FROM YOUR EMAIL" |
| Email snippet | Card padding 14, gap 4: "From: …" 12 `textMuted`; "Subject: …" 13 SemiBold; body excerpt 13 |
| Extracted details | Card padding 16, gap 12; heading 14 SemiBold; rows = label 13 `textMuted` + value 13 SemiBold + confidence chip |
| Confidence chip | Pill, padding 10 × 4, 11 SemiBold: green `#e7f0e9` / `#267465`; amber `#fff7de` / `#9b752c` |
| Flagged row | Radius 6, fill `#fff7ed`, 1px `#f59e0b`; value shown with a trailing "?" ("Oct 19, 2026?"); helper 12 — "We're not sure about this date. Tap to edit." |
| Reminder card | Padding 14: "Remind me 3 days before" 14 SemiBold + "Push notification on Oct 16" 12 `textMuted` + `Toggle` 44 × 26 |
| Banner | `#fffbeb`, radius 6, padding 12 × 10, 12 Medium — "Nothing is saved until you confirm." |
| Actions | Primary (padding 15) + secondary "Edit details" |

**Build differently:**

1. **One primary label: "Confirm and track."** The two frames disagree ("Confirm
   and track" / "Review and confirm"); the layer name in both is
   `Button - Confirm and track`.
2. **Flagged fields must be resolved before saving.** Tapping a flagged row opens
   its editor with the current value pre-filled and a "Looks right" action. The
   primary stays disabled, with the hint "Check the highlighted field", until
   every flagged field has been edited or confirmed. This is the human-in-the-loop
   guarantee (`§2.7`); the frame alone would let a user tap through a 54% guess.
3. **Colors:** the frame's `#d97706` helper text is 3.00:1 on its fill and
   `#9b752c` chip text is 3.94:1 — both fail AA. Use `color.warning` tokens
   (`01 §2`), border `color.warning`, and `color.text` for helper copy. Chip and
   provenance text is 12px minimum, not 11.
4. **Rows:** every row is tappable to edit, not only flagged ones — "Edit details"
   then opens the full form (`07 §2`, prefilled) for everything at once.
5. **Reminder date** = `trial_ends_on − trial_alert_days_before`. If that date is
   already past (a trial ending in 2 days with a 3-day reminder), say "Reminder
   due now" and send it immediately on confirm.
6. **Nothing auto-creates.** Only "Confirm and track" writes a subscription.

### 2.5 TrialShield (`110:186`)

| Element | Measured |
|---|---|
| Header | Eyebrow "Cancel before you are charged" 14 `textMuted`; title DM Serif 26 |
| At-risk card | Fill `#fff7de`, 1px `#9b752c`, radius 6, padding 16: label 11 SemiBold uppercase, figure DM Serif 30, caption 13 `textMuted` |
| Trial card | `surface`, 1px `border`, radius 6, padding 16, gap 10 |
| — top row | 40px circle mark (initial 15 Bold) · name 15 SemiBold + "Then $17.99 per month" 12 `textMuted` · days-left chip |
| — progress | Track 8 tall, radius 4, `surface2`; fill `accent` |
| — actions | Buttons padding 10, radius 6, 13 SemiBold, gap 8 |
| Tab bar | Shared tab bar, **Calendar** active |

**Progress is elapsed ÷ trial length.** Verified from the frame: fills 297.6 / 224 /
96 of a 318px track = 93.6% / 70.4% / 30.2% = 29/31, 21/30, 9/30 days elapsed.
The trial length therefore has to be stored (`04 §6a`).

**Actions by urgency (inferred from the three cards):**

| Card | Actions |
|---|---|
| Converts within the alert window | **Cancel guide** (primary) + **Keep it** |
| Later | **Remind me** + **Cancel guide** |
| Far off | **Remind me** |

- **Cancel guide** = per-service cancellation steps plus a deep link to the
  provider's cancel page. It is guidance, never an automated cancellation. Content
  comes from the service catalog (`04 §4.7`); services without an entry get a
  generic "Check your account settings on {provider}" fallback.
- **Keep it** = "I intend to pay": the trial stays, drops out of "at risk", stops
  nagging, and converts to `active` on its end date.
- **Remind me** = schedules the reminder (`trial_alert_days_before`).

**Fixes:**

- The card says "AT RISK THIS WEEK" but the caption says "within 3 days". Use one
  window — the user's `trial_alert_days_before` (`09 §5`) — in both: label "AT RISK
  SOON", caption "{n} trial(s) convert to a paid plan within {N} days".
- **Days-left chip colors:** the frame paints "2 days left" in `#b44735` — that is
  `color.danger`, reserved for errors and destructive actions (`00` rule 3). Tiers:
  ≤ 3 days `warning` tint with `color.text` label and a clock icon · 4–14 days
  neutral `surface2` · > 14 days success tint (`#e7f0e9` / `#267465`, 4.79:1).
- Sort ascending by days left. Past-due (end date reached, no action) converts to
  `active` and leaves this list.
- Hide the at-risk card when no trial is inside the window; the trial cards remain.

**Reuse on Home:** the same trial appears as an `AlertCard` in Urgent attention
(`06 §2.4`) — "Hulu trial ends in 2 days — you'll be charged $17.99 on {date}" with a
"Review" link that opens TrialShield. The stale `113:641` Home frame contains that
card; the pattern is kept, the frame is not.

**Navigation:** TrialShield is a stack screen inside the **Calendar** tab (the
frame highlights Calendar), reached from the Home alert card and from the Calendar
header.

### 2.6 SharedPlans (`110:266`)

| Element | Measured |
|---|---|
| Header | Eyebrow "Shared plans" + title "Shared Plans" (**the eyebrow only repeats the title — drop it**) |
| Owed card | `#e7f0e9` (`successSurface`), radius 6, padding 16: label 11 SemiBold `success`, figure DM Serif 30, caption 13 `textMuted` |
| Plan card | `surface`, 1px `border`, radius 6, padding 16, gap 12 |
| — header | 40px circle mark (Netflix tint `#ffecee`, `#e50914` "N" 16 Bold) · name 16 SemiBold + "$15.49 / month  \|  split 3 ways" 12 · share 16 Bold `accent` |
| — member row | 36px avatar (initials 12 Bold) · name 14 Medium · status chip (Paid green / Pending amber) · for pending, a "Remind" button (`#e7f0e9`, 13 SemiBold `accent`, padding 10) |
| — progress | "2 of 3 paid" 12 Medium + track 318 × 8, fill 212 (= 2/3) |
| New plan | Outline button, padding 15 — "+ New shared plan" |
| Tab bar | Shared tab bar, **Settings** active |

**Money — the frame is wrong by one cent.** $15.49 ÷ 3 = 5.1633…; three shares of
$5.16 sum to **$15.48**. Split with the largest-remainder method so shares always
sum to the bill: $5.17 + $5.16 + $5.16. Who receives the extra cent is
deterministic (participant order, owner first). **Add a test:** for 100 random
prices and 2–6 participants, shares sum to the price exactly.

- **"Outstanding" card** = sum of the *other* participants' pending shares, owed to
  the owner. "Sam still owes you for Netflix" → `$5.16` (Sam's share).
- The owner's own share is always "Paid" (they pay the provider).
- **Totals do not change.** Home and Analytics keep counting the **full** bill
  ($15.49) because that is what leaves the user's account. The stale `113:641`
  frame showed "Netflix (shared) $7.66 · your share" — do not copy it. A
  "net of shares" figure may appear on this screen only.
- **Independent of Family** (`10`). Participants are named contacts
  (`display_name`, optional `email`), not necessarily SubTrak users. Jordan and Sam
  are the same names as the Family fixture, but the two features share no tables.
- **Remind** emails the participant (if an address exists, rate-limited to one per
  24h per participant) or opens the OS share sheet with prefilled text if not.
  Hit area ≥ 44.
- **Navigation:** stack screen inside the **Settings** tab (the frame highlights
  Settings), via a "Shared plans" row, and via "Split this plan" on SubscriptionDetail.
- **The "Contract alert" card is not shared-plan content** (a gym membership
  appears nowhere in the canonical dataset). **Cut it from this screen.** If
  contract alerts ship (stretch), they belong on Home's Urgent attention as an
  `AlertCard`, driven by a `renews_by` / `auto_renews` field.
- Avatars: initials from the name, tint from the name hash within the muted palette.
  The frame's `#b38b35` on `#fff7cc` is 2.92:1 — fails AA; use `color.text` initials.

### 2.7 Pipeline requirements (unchanged, still graded)

1. **Never auto-create a subscription from model output.**
2. **Failure handling:** unparseable email, partial extraction, duplicates against
   existing subscriptions ("Update the existing one").
3. **Evaluation:** ≥ 20 real-shaped fixture emails with hand-labeled ground truth, a
   scored per-field accuracy report, **and** a calibration table for the confidence
   numbers shown in the UI. Fixtures must include Hulu's exact wording from the
   frame ("Your free trial ends on Oct 19, 2026. After that, you will be charged
   $17.99 per month.").
4. **Generated-text numeric grounding:** the model receives computed aggregates and
   may only restate them. Add a test asserting every numeric token in generated
   output appears in the input aggregates. (`Analytics`' AI insight card —
   `08 §2.0` — is governed by this rule.)

### 2.8 Edge cases and undesigned states

| Case | Handling |
|---|---|
| **Scanning in progress** (not designed) | "Scanning your inbox…" with a progress indicator and Cancel; results stream in as review items |
| **Connected, nothing found** (not designed) | "No subscriptions found" + "Add one manually" |
| **Several found** (not designed) | A reviewable list; each item opens ReviewExtraction; "Confirm all" is **not** offered |
| Email isn't a subscription confirmation | Rejected before extraction; list what was skipped |
| Price present, no currency | Currency flagged low-confidence; default to the billing currency |
| Trial with no charge yet | `subscription_type=trial`, `price` = the post-trial price from the email; if absent, prompt for it |
| "$9/mo, billed annually" | Cycle `yearly`, price × 12; both fields flagged |
| Duplicate of an existing subscription | Offer "Update the existing one" instead of creating a second |
| Non-English email | Reject cleanly rather than guess |
| Malformed model JSON | Validate → retry once → fall back to a blank Add form |
| Model returns a value not in the email | Grounding rule: field blanked and flagged |
| Reminder date already past | "Reminder due now" (§2.4) |
| OAuth token revoked | Settings → Connected email shows "Reconnect"; scans fail with the error variant |
| "New shared plan" (not designed) | Sheet: pick a subscription → add participants (name, optional email) → equal split preview with the remainder cent shown → save |

### 2.9 Privacy

The review screen quotes the email, so some text must be held while the user
decides. Rules:

- Store the snippet shown on screen (≤ 300 characters) in a **pending extraction**
  record with a TTL (suggest 24 hours). It is deleted on confirm, discard or expiry.
- After confirmation keep only the extracted fields plus a hash of the source
  message. Never retain full email bodies.
- Gmail access is read-only; request the minimum scope; store the refresh token
  encrypted; "Disconnect" in Settings revokes it and deletes pending extractions.
- Write the retention window and the reasoning in `CLAUDE.md`.

This echoes the project's earlier LabelLens lesson: the health-data dimension was
dropped because storing real personal data conflicted with the capstone
guidelines. Email contents are comparably sensitive — scope the retention
deliberately.

### 2.10 Definition of done

- [ ] Input-path decision (§2.1) recorded in `CLAUDE.md` before implementation.
- [ ] JSON schema enforced on every model output; grounding rule enforced.
- [ ] ReviewExtraction: all fields editable; flagged fields must be resolved; nothing auto-creates.
- [ ] Confidence numbers computed from checks; calibration table committed.
- [ ] ≥ 20 labeled fixture emails; eval harness runs in CI; per-field accuracy report committed.
- [ ] Generated-text numeric-grounding test passing.
- [ ] TrialShield progress = elapsed ÷ length; no `danger` color on a days-left chip.
- [ ] SharedPlans shares sum exactly to the price (property test).
- [ ] Danger red does not appear on any AI screen except the connect-error card.
- [ ] Retention policy documented; Disconnect revokes and purges.
- [ ] Stale frames `113:641` / `113:765` not built.

---

## §3 — System states

The prototype designed zero loading, error, or offline states. They are specified
per screen in `05`–`10`; this section defines the shared patterns.

### 3.1 Loading
**No screen renders a blank frame.** Ever.

| Context | Pattern |
|---|---|
| List | 3–5 `Skeleton` rows matching real row height |
| Card with a figure | Skeleton block at the figure's dimensions |
| Chart | Skeleton rectangle at chart dimensions; axes may render immediately |
| Full screen | Per-section skeletons, never one centered spinner |
| Button action | In-button spinner; the screen stays interactive |

Skeletons honor reduced motion (`02 §14`).

### 3.2 Empty states
Every list needs three distinct empties — they are not interchangeable:

| Type | Example | Has CTA |
|---|---|---|
| First-run | "Start tracking" | Yes — add a subscription |
| Filtered to nothing | "No subscriptions in Gaming" | Yes — clear filter |
| Genuinely nothing | "No charges in October" | No |

### 3.3 Errors

| Type | Pattern |
|---|---|
| Field validation | Inline, below the field, `color.danger` |
| Form submission | Form-level banner above the primary button |
| Section load failure | Inline retry within that section; siblings still render |
| Screen load failure | Full-screen error + retry, preserving cached data |
| Unexpected crash | Error boundary per tab with a recoverable fallback |

Error copy says what happened and what to do. Never "Error 500".

### 3.4 Offline

| Behavior | Spec |
|---|---|
| Reads | Serve cached data + a stale banner: "Showing data from {time}" |
| Writes | Queue locally; optimistic UI; "Saved — will sync" |
| Indicator | Persistent, dismissible banner below the header |
| Reconnect | Flush the queue, refresh, remove the banner |
| Conflict | Last write wins; notify if detectable |
| Blocked offline | Currency change (needs a fresh rate) and auth operations |

### 3.5 Dark theme
Required by the Profile theme control (`09 §6`). Every screen in `05`–`10` must
be verified in both themes. Charts need their own dark palette — category colors
tuned for a cream background will not hold up on a dark surface, and each
dark-mode pair needs its own contrast check.

### 3.6 Definition of done
- [ ] Calendar tab built; no dead tab remains.
- [ ] TrialShield and SharedPlans reachable from the places named in §2.5 / §2.6.
- [ ] Every list has all three empty-state types where applicable.
- [ ] Every screen has loading, error, and offline states.
- [ ] Error boundary per tab.
- [ ] Offline queue flushes correctly on reconnect.
- [ ] Every screen verified in dark theme with its own contrast report.
- [ ] Smoke test: register → verify → add → correct total on Home → edit price →
      history event appears → cancel → leaves the total.
