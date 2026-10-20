# 05 — Auth & Onboarding (Epic A)

**Prerequisites:** `01`, `02`, `03`, `04 §5 (auth endpoints)`.
**Deliverable:** 8 auth screens + first-run flow.
**Figma frames:** 14 in the prototype — 6 are cut, see §7.

---

## 1. Screens to build

| Screen | Route | Purpose |
|---|---|---|
| Login | `AuthStack/Login` | App entry point |
| Register | `AuthStack/Register` | Create account |
| VerifyEmailSent | `AuthStack/VerifyEmailSent` | Post-register confirmation |
| EmailConfirmed | `AuthStack/EmailConfirmed` | Deep-link landing |
| ForgotPassword | `AuthStack/ForgotPassword` | Request reset |
| ResetLinkSent | `AuthStack/ResetLinkSent` | Post-request confirmation |
| CreateNewPassword | `AuthStack/CreateNewPassword` | Deep-link landing |
| PasswordResetSuccess | `AuthStack/PasswordResetSuccess` | Terminal confirmation |

---

## 2. Shared layout

All eight share one shell. Build it once.

| Element | Spec |
|---|---|
| Nav bar | 64–88 tall, brand mark 30 × 30 + "SubTrak" in `display.md`, 20–24 leading |
| Page background | `color.bg` |
| Card | `Card` component, 16–24 horizontal margin, 24 padding, vertically centered |
| Heading | `display.md`, centered within the card |
| Supporting text | `body.md`, `color.textMuted`, centered |
| Form field gap | `space.lg` (16) |
| Primary button | Full width, 48 tall, 24–32 below the last field |

The prototype used three nav-bar heights (64, 72, 88) across these screens.
**Standardize on 64** and record the change.

---

## 3. Register — changed from the prototype

The prototype had a five-rule password checklist (8 chars, uppercase, lowercase,
number, special character) plus a confirm-password field. **Do not build that.**

| Field | Spec |
|---|---|
| Email | `TextField`, `keyboardType="email-address"`, autocomplete, no autocapitalize |
| Password | `TextField` with show/hide toggle, `textContentType="newPassword"` |
| Terms | Checkbox + "I agree to the Terms and Privacy Policy" with tappable links |

**Password rule:** minimum length only, shown as one line of helper text below
the field. No live checklist. No confirm field.

Why: a composition checklist is friction without security benefit at reasonable
length, and the confirm field is redundant once the user can reveal what they
typed. Both were the most visually heavy part of the prototype's auth flow.

| State | Behavior |
|---|---|
| Invalid email on blur | Field error: "Enter a valid email address." |
| Password too short | Helper text turns `color.danger` on submit, not on keystroke |
| Terms unchecked | Submit disabled |
| Email already registered | Field error: "An account with this email already exists." + link to Login |
| Submitting | Button loading state; all fields disabled |
| Network failure | Toast: "Couldn't reach SubTrak. Check your connection." Form state preserved. |

---

## 4. VerifyEmailSent / ResetLinkSent — changed from the prototype

Both prototype frames led with "Resend" as the primary action. That is backwards:
the user's next step is to open their mail app, not to request another email.

| Element | Spec |
|---|---|
| Icon | 72 × 72 circle, `color.surface2` fill, 34px mail glyph |
| Heading | "Check your email" |
| Body | "We sent a confirmation link to **{email}**." Email in SemiBold. |
| **Primary** | **"Open Mail app"** — `expo-linking` to the default mail client |
| Secondary | "Resend" — disabled during cooldown with visible countdown |
| Tertiary | "Wrong email?" → back to the form, prefilled |
| Tertiary | "Back to Log In" |

**Cooldown:** comes from the server's `resend-verification` response (`04 §5`).
Render as "Resend in 0:42", counting down, then re-enable. Never let the user
spam the endpoint and never show an enabled button that will be rejected.

On successful resend, show the Toast: "Confirmation email resent" / "Password
reset email resent". Both toast variants already exist as Figma symbols.

---

## 5. Login

| Field | Spec |
|---|---|
| Email | `TextField`, email keyboard, autocomplete |
| Password | `TextField` with show/hide, `textContentType="password"` |
| Forgot password | `ghost` Button, trailing-aligned with the password label |

**Biometric unlock:** after a session has been established at least once, offer
Face ID / Touch ID via `expo-local-authentication`. Show the biometric prompt
automatically on screen focus when enrolled; fall back to the form on cancel.

| State | Behavior |
|---|---|
| Wrong credentials | Form-level error above the fields: "Email or password is incorrect." Never say which. |
| Unverified account | Route to `VerifyEmailSent` with the email prefilled; do not show an error |
| Rate limited | "Too many attempts. Try again in {n} minutes." |
| Submitting | Button loading; fields disabled |

---

## 6. First-run — replaces the feature tour

The prototype's "Welcome to SubTrak" screen had six feature cards in a 1,250px
scroll. Replace it entirely.

After verification, a user with zero subscriptions lands on **Home**, showing the
`EmptyState`:

| Element | Content |
|---|---|
| Icon | 48px plus-in-circle |
| Title | "Start tracking" |
| Body | "Add your first subscription and SubTrak will keep an eye on what you're spending." |
| CTA | `primary` Button — "Add a subscription" → opens AddSubscription modal |
| Second CTA | `secondary` Button — "Find them in my email" → ConnectEmail (`11 §2.3`). Shown only if the AI epic is enabled |

After the first subscription saves, show one dismissible hint pointing at the
Analytics tab. Shown once, ever.

Persist `has_completed_first_run` on `UserSettings` — **server-side, not local**,
so it survives reinstall.

---

## 7. Cut from the prototype — do not build

| Frame | Reason |
|---|---|
| Landing / marketing page | Not an app screen. Duplicate CTAs (Log In + Create Account twice). App opens to Login. |
| Welcome dashboard preview | Mixes marketing copy with live data. |
| 6-card feature tour | Replaced by §6. |
| Admin Log In | Conflates family admin (a role within the normal login) with a system admin that doesn't exist. Only desktop-width frame in the file. |
| **Paywall ($6.99/mo)** | See below. |

### Paywall decision

The prototype placed a $6.99/month paywall **before the user saw any value**,
with no plan comparison and no Restore Purchases.

**Recommendation: do not build it for the capstone.** Real monetization needs
RevenueCat or Stripe plus App Store / Play Store configuration — a sprint on its
own, and none of it is graded.

If it ships anyway: place it **after** the first subscription is added, include a
free tier capped at 3–5 subscriptions, and add Restore Purchases (an App Store
review requirement).

---

## 8. Edge cases — all screens

| Case | Handling |
|---|---|
| Long email (>40 chars) | Wrap to 2 lines in body copy; never truncate an email |
| Email in a non-Latin script | Full Unicode support in fields and body copy |
| Deep link while already logged in | Verify token, then route to Home, not the auth stack |
| Expired verification token | "This link has expired." + Resend as primary |
| Already-used reset token | "This link has already been used." + link to request a new one |
| Keyboard covering the submit button | `KeyboardAvoidingView` on every form screen |
| Backgrounded mid-flow | State preserved; no re-entry of typed values |

---

## 9. Screen states — all auth screens

| State | Behavior |
|---|---|
| Idle | Form interactive, primary enabled when valid |
| Submitting | Primary in loading state; all fields disabled; back still works |
| Field error | Inline below the field, `color.danger`, announced politely |
| Form error | Banner above the primary button |
| Server unreachable | Toast; form state fully preserved; primary re-enabled |
| Rate limited | Primary disabled with a visible countdown |
| Success | Navigate forward; never leave a spinner on a dead screen |

No auth screen has a loading skeleton — there is no data to fetch. The only
async state is submission.

---

## 10. Motion

| Element | Trigger | Animation | Duration | Easing |
|---|---|---|---|---|
| Auth screen | Push | Slide from trailing edge | 300ms | ease-out |
| Card | Mount | Fade + translate Y 12px | 250ms | ease-out |
| Field error | Appear | Height expand + fade | 150ms | ease-out |
| Success icon | Mount | Scale 0.8 → 1.0 with a check draw | 400ms | ease-out |
| Toast | Enter / exit | Per `02 §15` | — | — |

The success-icon draw is the only decorative animation here; skip it entirely
under reduced motion and render the final check.

---

## 11. Accessibility

- **Focus order:** heading → fields top to bottom → primary → secondary → tertiary.
- Every field programmatically associated with its label.
- Errors announced via `accessibilityLiveRegion="polite"`.
- Password show/hide: `accessibilityLabel` toggles "Show password" / "Hide password".
- Submit buttons announce busy state, not just a spinner.
- Screen title announced on mount, so a screen-reader user knows where they landed.
- Terms and Privacy links announced as links, with destinations.

---

## 12. Definition of done

- [ ] All 8 screens built against the `04 §5` auth endpoints.
- [ ] Nav bar standardized to 64 across all of them.
- [ ] Register has **no** confirm field and **no** five-rule checklist.
- [ ] "Open Mail app" is primary on both check-your-email screens.
- [ ] Resend cooldown reads from the server and counts down visibly.
- [ ] Login never reveals whether the email or password was wrong.
- [ ] Biometric unlock works after first successful login.
- [ ] First-run empty state shows; `has_completed_first_run` persists server-side.
- [ ] None of the six cut screens exist in the codebase.
- [ ] Keyboard avoidance verified on every form screen, both platforms.
