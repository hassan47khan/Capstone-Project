# 09 — Settings & Preferences (Epic E)

**Prerequisites:** `01`, `02`, `03`, `04`.
**Deliverable:** 6 screens.
**Figma frames:** 8.

---

## 1. Settings root

| Element | Spec |
|---|---|
| Header | "Settings", `display.md`, left-aligned |
| Subtitle | **Removed** — see below |
| Groups | `SectionHeader` + `SettingsRow` group in a `color.surface` container |

> **Remove the "Regular User Account" subtitle.** It leaks an internal role name
> into the UI. A user does not think of themselves as a "regular user account".
> The family-admin variant's "Family Plan Administrator" subtitle is fine —
> that's a real, user-meaningful role.

### Groups

**DISPLAY**
| Row | Trailing | Destination |
|---|---|---|
| Currency | `USD ($)` | SelectCurrency |
| Time Zone | `America/New_York` | SelectTimeZone |
| Date Format | `MM/DD/YYYY` | Inline picker |

> An earlier draft of this spec listed a *Theme* row here. It is removed: the
> measured Profile screen already has the theme control (`§6`), and two controls
> for one setting is a bug waiting to happen. (Decision, not a measurement.)

**NOTIFICATIONS**
| Row | Trailing | Destination |
|---|---|---|
| Notifications | — | NotificationRules |

> **One row, not inline toggles.** The prototype put three toggles here *and*
> built a separate Notification Rules screen with far more settings and **no
> entry point to reach it**. Consolidate: this row is the only way in, and the
> rules screen holds everything.

**ACCOUNT**
| Row | Trailing | Destination |
|---|---|---|
| Profile | `{display name}` | ProfileAccount |
| Export Data | `JSON / CSV` | Export sheet |
| Help & Support | — | External link |
| Sign Out | — | Confirm sheet |

Sign Out uses the `destructive` SettingsRow variant — `color.danger` label with a
trailing log-out icon (confirmed in Figma node `3:1854`).

**Measured against the Settings frame (`3:1778`):** the frame has the three inline
toggles, the "Regular User Account" subtitle, a Help & Support row and a
Sign Out row — the first two are the deliberate departures above; the last two are
specced here. Theme lives on Profile only (`§6`), not here. Group label sizes follow `02 §14` (12px, `textMuted`), not
the frame's 11px `textSubtle`.

---

## 2. SelectCurrency

| Element | Spec |
|---|---|
| Header | Back + "Select Currency" |
| Search | `SearchField` (`02 §18`), placeholder "Search currency…" |
| Row | 48 tall, flag emoji 20px + code (`label.semibold`) + name (`label.md`, muted) |
| Selected | Trailing 18px check, `color.accent` |
| Footer | `caption`, `color.textMuted`, centered (the frame uses `textSubtle`, which fails AA — do not copy) |

**Measured (`3:1878`):** the list holds 8 currencies — take the real list from the server's
supported-currency set (`04`), not from this frame. Selected check is 18px.

**Footer copy — fix the contradiction.** The prototype said "Prices converted
using live exchange rates" while Currency & Billing said "Auto-refresh: Daily".
Those are different claims. Pick one and say it everywhere:

> "Converted using exchange rates from {provider}, updated daily. Last updated
> {date}."

Selecting a different currency opens ConfirmCurrencyChange. Selecting the current
one is a no-op.

---

## 3. ConfirmCurrencyChange

`BottomSheet`. **This pattern is good — keep it as designed.**

| Element | Spec |
|---|---|
| Title | "Confirm currency change" |
| Subtitle | "Change display currency from USD to EUR?" |
| Preview card | **`color.bg` fill**, 1px `border`, radius 6, padding 16 (measured `3:1956`; not `surface2`) |
| — Left | "CURRENT (USD)" caption (12px, 11 in the frame) + `$129.20` in DM Serif 20, `textMuted` |
| — Arrow | 20px, `color.textMuted` |
| — Right | "NEW DISPLAY (EUR)" caption in `accent`, right-aligned + `€118.56` in DM Serif 20, `text` |
| Body | "Subscription prices will be displayed in EUR using current exchange rates. Individual billing remains unchanged." |
| Primary | "Confirm change" (`primary`, 48, 15 Bold) |
| Secondary | "Cancel" (`secondary`, 48, 15 SemiBold, `text`) |

Both figures come from the money engine (`04 §3.3`). **Neither is hardcoded.**
With seed data at rate 0.9177 the right-hand figure is €118.56.

> The prototype showed `$137.70 → €126.29`, from a different subscription set
> than its own dashboard displayed. Superseded — see `04 §4.6`.

Showing the user the actual before/after total is the right call: it makes a
display-only change feel safe and reversible.

---

## 4. SelectTimeZone

| Element | Spec |
|---|---|
| Header | Back + "Select Time Zone" |
| Search | Placeholder "Search city or offset…" |
| Grouping | `SectionHeader` per region — Americas, Europe, Asia/Pacific, … |
| Row | Zone name (`label.md`) + current local time, trailing |
| Selected row | 68 tall — name, friendly label ("Eastern Time (EST/EDT)"), time, check |
| Unselected row | 46 tall |

**Measured (`3:2131`):** the frame lists 10 zones; secondary labels are 11px
`textSubtle` — use 12px `textMuted`. Row heights above (68 / 46) are the frame's; make the full row the touch
target.

Local times update live while the screen is open — a stale clock on a timezone
picker reads as broken. Use the device clock, not a server round-trip.

---

## 5. NotificationRules

Reached only from the Settings Notifications row.

**Measured (`3:2210`):** section labels 11px Bold uppercase `textSubtle`, 16 left /
20 top / 8 bottom padding (→ use `SectionHeader`, 12px, `textMuted`); each section is
a `surface` group, radius 6 (this frame has no outer border — keep the 1px
`border` like every other group). Rows padding 16h/14v, label DM Sans Medium 14.
The "Days before reminder" stepper is `−` (28 × 28, `surface2`) · "3 days" Bold 14
· `+` (28 × 28, `accent` @ 10%, `accent` glyph) — keep the 28px visual, extend each
button's hit area to 44 (`02 §16`). This frame has a home indicator but **no tab
bar**; it is reached from Settings like the other sub-screens.

**BILLING REMINDERS**
| Row | Control |
|---|---|
| Days before reminder | Stepper, 28 × 28 buttons, range 1–30 |
| Reminder time | Chevron → time picker |
| Send via push | Toggle |
| Send via email | Toggle |

**PRICE CHANGES**
| Row | Control |
|---|---|
| Alert on any change | Toggle |
| Alert threshold | Chevron → `changes > $1.00`; disabled when the toggle above is on |

**SUMMARIES**
| Row | Control |
|---|---|
| Weekly spending summary | Toggle |
| Monthly report | Toggle |
| Report delivery day | Chevron → `1st of month`; hidden when Monthly report is off |

**TRIALS** *(add — supports `11 §2`)*
| Row | Control |
|---|---|
| Trial ending alerts | Toggle |
| Days before trial ends | Stepper, 1–14 |

Persists to `NotificationRule` (`04 §1`). Every toggle's **entire row** is the
touch target (`02 §7`).

Dependent rows disable rather than disappear where the relationship should stay
visible (threshold under "alert on any change"), and hide where it shouldn't
(delivery day under a disabled monthly report).

---

## 6. ProfileAccount

**MY PROFILE** — 56px avatar (initials; `accent` @ 10% fill with a 1px `accent`
border, initials 20 Bold `accent`), display name DM Serif 18, email 13 `textMuted`,
and (measured) a "Family Premium" badge. **Hide the badge in the MVP** — there are
no plans until the paywall is decided (`05 §7`).

**APP PREFERENCES**
| Row | Control |
|---|---|
| App theme | Segmented: Dark / Light / System |
| Language | Chevron |
| Haptic feedback | Toggle |

> **The theme control must work.** The prototype showed "Dark" selected with no
> dark designs anywhere in the file. Either it drives the real theme from
> `01 §6`, or it does not ship. A control that visibly does nothing is worse than
> its absence.

**DATA**
| Row | Control |
|---|---|
| Export all data | `CSV / JSON` → export sheet |
| Import subscriptions | Chevron → file picker |
| Clear cache | Shows cache size |

**ACCOUNT SECURITY**
| Row | Control |
|---|---|
| Change password | Chevron |
| Two-factor auth | Status + chevron |
| Delete account | `destructive` → **double confirm** |

### Which Profile rows actually have screens (measured `3:2734`)

| Row | Screen designed? | MVP decision |
|---|---|---|
| App theme | Control only (Dark / Light / System, 11px Bold labels) | **Build**; drives the real themes (`01 §6`). Size labels to 12, 44pt hit |
| Language | None — row shows "English" with no chevron | Show "English" as a non-interactive value |
| Haptic feedback | Toggle | **Build** |
| Export all data | None (no sheet) | **Build**: `BottomSheet` with CSV / JSON → share sheet |
| Import subscriptions | None | **Cut for MVP** |
| Clear cache | Row only ("12.4 MB") | **Build**; clears cached API responses, toast on done |
| Change password | None | **Build** in-app: current + new, reusing the `05` validation |
| Two-factor auth | None (shows "Enabled ✓") | **Cut for MVP** — setup, QR and recovery codes are not designed |
| Delete account | None | **Build** (double confirm below) |

Also measured: section labels are 12px Bold uppercase (`textSubtle` — use
`textMuted`); every row in the frame carries a full 1px border on all four sides,
so adjacent rows show a doubled line — use single dividers; the Delete account row
shows a **log-out icon** (wrong — use a trash icon).

Delete account: first sheet explains what is destroyed, second requires typing
the word DELETE. This is the only irreversible, unrecoverable action in the app.

---

## 7. Edge cases

| Case | Handling |
|---|---|
| Currency changed while offline | Blocked with "Connect to change currency" — the rate must be fresh |
| FX rate older than 24h | Confirm sheet shows the rate age; user may proceed |
| Timezone list while searching | Debounce 200ms; "No zones match" empty state |
| Reminder time in a changed timezone | Reminders follow the user's timezone setting, not the device |
| Export with 0 subscriptions | Allowed; produces a valid empty file with headers |
| Import malformed file | Per-row validation; show what failed and import the rest |
| Sign out with queued offline writes | Warn: "You have unsaved changes. Sign out anyway?" |
| Very long display name | Truncate in the row, full value on Profile |

---

## 8. Screen states

| State | Behavior |
|---|---|
| Idle | Rows interactive; values reflect persisted settings |
| Saving a setting | Optimistic — the control updates immediately |
| Save failed | Control reverts with a toast: "Couldn't save. Try again." |
| Offline | Settings that work offline still save and queue; currency and auth rows are disabled with a reason |
| Loading (first open) | Skeleton rows; group headers render immediately |
| Load failed | Full-screen error + retry |

Optimistic update is correct here because every setting is individually
reversible and low-stakes. The one exception is currency: it requires a fresh FX
rate, so it is blocked offline rather than queued (`§7`).

---

## 9. Motion

| Element | Trigger | Animation | Duration | Easing |
|---|---|---|---|---|
| Settings row | Press | Fill → `surface2` | 100ms | ease-out |
| Confirm sheet | Open | Slide up + backdrop fade | 300ms | ease-out |
| Toggle | Change | Thumb translate + fill cross-fade | 150ms | ease-out |
| Dependent row | Show/hide | Height + opacity | 200ms | ease-out |
| Theme change | Apply | Cross-fade the whole screen | 250ms | ease-in-out |

Theme cross-fade is the one animation worth keeping even under reduced motion —
an instant theme flip is jarring. Shorten it to 100ms rather than removing it.

---

## 10. Accessibility

- **Focus order:** header → each group header → each row in order.
- Group headers announced as headings, so a screen-reader user can jump groups.
- Each row announces label + current value: *"Currency, U S D, button."*
- Toggles are `accessibilityRole="switch"` with the row label as the name.
- The stepper announces value changes: *"4 days."*
- Disabled dependent rows announce why: *"Alert threshold, dimmed, alert on any change is on."*
- The currency confirm sheet announces both figures: *"Changing from $129.20 to €118.56."*
- Delete account's final confirm requires typed input — fully labeled, with the
  requirement stated before the field, not only in the placeholder.

---

## 11. Definition of done

- [ ] "Regular User Account" subtitle gone.
- [ ] Notifications is one row leading to the rules screen; no inline toggles.
- [ ] Notification Rules reachable from Settings.
- [ ] Theme control drives real light/dark themes.
- [ ] Currency confirm shows real computed before/after figures.
- [ ] FX wording consistent across SelectCurrency and any family billing screen.
- [ ] Timezone local times tick live.
- [ ] Every toggle's full row is the touch target.
- [ ] Delete account double-confirms with typed input.
- [ ] All settings persist server-side and survive reinstall.
