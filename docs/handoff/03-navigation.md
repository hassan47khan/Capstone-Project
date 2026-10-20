# 03 — Navigation

**Prerequisites:** `01-design-tokens.md`, `02-component-library.md`.
**Deliverable:** full navigation skeleton with placeholder screens. No screen
content in this task.

---

## 1. Structure

```
RootNavigator
├── AuthStack                    (unauthenticated)
│   ├── Login
│   ├── Register
│   ├── VerifyEmailSent
│   ├── EmailConfirmed
│   ├── ForgotPassword
│   ├── ResetLinkSent
│   ├── CreateNewPassword
│   └── PasswordResetSuccess
│
└── AppStack                     (authenticated)
    ├── MainTabs
    │   ├── Home
    │   ├── Calendar            → stack: Calendar, TrialShield      (11 §2.5)
    │   ├── Analytics
    │   └── Settings            → stack: Settings, SharedPlans,     (11 §2.6)
    │                                    ConnectEmail
    │
    └── ModalStack               (presented over tabs)
        ├── AddSubscription
        ├── SubscriptionDetail
        ├── EditSubscription
        ├── EditHistory
        ├── SelectCurrency
        ├── ConfirmCurrencyChange   (bottom sheet)
        ├── SelectTimeZone
        ├── NotificationRules
        ├── ProfileAccount
        └── ReviewExtraction        (11 §2.4; opened from ConnectEmail / the scan list)
```

---

### 1.1 React Navigation 7 file layout

```
mobile/src/navigation/
├── RootNavigator.tsx        auth gate (§5); mounts Auth or App, never both
├── AuthNavigator.tsx        Login, Register, VerifyEmailSent, EmailConfirmed,
│                            ForgotPassword, ResetLinkSent, CreateNewPassword,
│                            PasswordResetSuccess
├── AppNavigator.tsx         MainTabs + the modal group (presented over tabs):
│                            AddSubscription, SubscriptionDetail, EditSubscription,
│                            EditHistory, SelectCurrency, SelectTimeZone,
│                            NotificationRules, ProfileAccount, ReviewExtraction;
│                            ConfirmCurrencyChange as a transparent sheet
├── TabNavigator.tsx         the one TabBar; FAB opens AddSubscription
│                            Home · Calendar · Analytics · Settings, plus both
│                            tab stacks, defined in this file:
│                              Calendar stack: CalendarMain, TrialShield  (11 §2.5)
│                              Settings stack: SettingsMain, SharedPlans,
│                                              ConnectEmail               (11 §2.6)
├── types.ts                 param lists for every navigator
├── linking.ts               deep links (§6)
├── pendingLink.ts           parks an App link that arrives while signed out
└── useDiscardGuard.tsx      dirty-form confirm (§3, rule 3)

Stack roots are CalendarMain and SettingsMain, not Calendar and Settings: a nested
screen may not share its parent tab's name.
```

Each tab that has sub-screens owns a stack file, so a teammate adds a screen by
registering it in that stack file. Screens not built yet register as placeholders.
Shared Plans and Connected email are part of the **graded AI epic**, not the Family
stretch goal; they get placeholder routes now.

## 2. Tab bar

Exact values from Figma node `21:52`:

| Property | Value |
|---|---|
| Height | 72 + safe-area inset |
| Fill | `color.surface` |
| Top border | 1px `color.border` |
| Horizontal padding | `space.lg` (16) |
| Tab width | 72 |
| Icon | 20 × 20 |
| Icon-to-label gap | `space.xs` (4) |
| Label | `tab` (DM Sans SemiBold 11px) |
| Active label + icon | `color.accent` |
| Inactive label + icon | `color.textMuted` |

### Center FAB

| Property | Value |
|---|---|
| Outer frame | 56 × 56 |
| Button | 48 × 48, radius 24 |
| Fill | `color.accent` |
| Icon | 20px plus, `color.onAccent` |
| Position | Centered, between Calendar and Analytics |

**The FAB is the only primary add affordance in the entire app.** Do not add an
"Add Subscription" button to any screen header. In the prototype it existed in
both places, and the tab bar was copy-pasted 8 times so the FAB appeared in some
copies and not others. One component, one add path.

**Touch targets:** each tab is 72 wide but the icon+label stack is only ~38 tall.
Expand each tab's touchable to the full 72px bar height so it meets the 44pt
minimum.

**A11y:** `accessibilityRole="tab"` per tab, `accessibilityState={{ selected }}`.
The FAB is `accessibilityRole="button"` with label "Add subscription" — it is not
a tab and must not be announced as one.

---

## 3. Modal rules

These three rules fix specific prototype bugs. Enforce them in the navigator, not
per screen.

1. **AddSubscription presents as a modal with a close (X) control.** The
   prototype had no back or close affordance on any Add Subscription frame.
2. **A presented modal marks no tab as active.** The prototype's Add Subscription
   frames incorrectly highlighted the Analytics tab. While a modal is open the
   tab bar shows the tab the user came from, or is hidden entirely.
3. **Confirm before discarding a dirty form.** Dismissing AddSubscription or
   EditSubscription with unsaved changes opens a confirm sheet. A pristine form
   dismisses immediately with no prompt.

---

## 4. Headers

| Property | Value |
|---|---|
| Height | 56 |
| Title | DM Serif Display **20** (measured on the Settings-flow and Family frames; Detail/Edit/History use 18, Add uses 24, Analytics 20 — normalized to 20) |
| Alignment | **Left, everywhere** |
| Back button | 32 × 32 touchable, 16px chevron, leading |
| Trailing action | Optional, 32 × 32 |

The prototype mixed centered titles (Edit Subscription, Subscription Detail) with
left-aligned ones (Select Currency, Family Members, Profile). Left-aligned wins —
it matches the Settings and dashboard screens, which are the most-visited.

Screens with a back button use a 44pt touch target even though the visual is 32.

---

## 5. Auth gate

On launch:

1. Show splash while the session resolves from secure storage.
2. No valid session → `AuthStack`.
3. Valid session, email unverified → `AuthStack` at `VerifyEmailSent`.
4. Valid session, verified, zero subscriptions → `MainTabs` → Home empty state
   (`06 §6`).
5. Valid session, verified, has subscriptions → `MainTabs` → Home.

Session resolution must not flash the Auth stack before landing on Home. Hold the
splash until the decision is made.

---

## 6. Deep links

| Link | Destination |
|---|---|
| `subtrak://verify-email?token=` | `EmailConfirmed` |
| `subtrak://reset-password?token=` | `CreateNewPassword` |
| `subtrak://subscription/:id` | `SubscriptionDetail` |

Links 1 and 2 must work when the app is cold-started and when backgrounded. A
subscription deep link on a cold start resolves the session first; if
unauthenticated, store the intent and resume after login.

---

## 7. Screens that are NOT in this structure

Deliberately excluded. Do not build routes for these:

| Screen | Reason |
|---|---|
| Landing / marketing page | Not an app screen. App opens to Login. |
| Welcome dashboard preview | Mixes marketing with live data; replaced by `05 §6`. |
| 6-card feature tour | Replaced by a single first-run CTA (`05 §6`). |
| `113:641` "2 - Dashboard", `113:765` "1b - Connect Email (failed)" | Stale indigo-palette drafts of the AI flow; replaced by the teal `110:*` frames (`11 §2`). |
| Admin Log In | Conflates family admin (a role) with a system admin (doesn't exist). The only desktop-width frame in the file. |
| Paywall | Deferred — see `05 §7`. |

---

## 8. Definition of done

- [ ] Full tree above navigable with placeholder screens.
- [ ] Tab bar is **one** component instance, reused everywhere.
- [ ] FAB present, opens AddSubscription as a modal.
- [ ] No tab highlights while a modal is presented.
- [ ] All headers left-aligned.
- [ ] Safe areas respected on both platforms, including the tab bar and toasts.
- [ ] Auth gate tested for all five launch cases, with no Auth-stack flash.
- [ ] Deep links tested cold-start and backgrounded.
