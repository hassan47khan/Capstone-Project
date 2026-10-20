---
status: todo
owner:
due:
---

# Phase 1 — Epic A Screens

Not started. Stub so the backlog is visible from [[SubTrak]].

## Description

Replace the Epic A placeholders with real screens: Welcome, Sign Up, Log In,
Confirm Email, Forgot Password, Reset Password. Covers US-1, US-2, US-3.

Everything these screens need already exists from Phase 0 — the primitives, the
session context, the API client with single-flight refresh, and MSW handlers for
the auth routes. The work is screens and form state, not plumbing.

## Subtasks
- [ ] Welcome
- [ ] Sign Up — validation, duplicate-email error, verification notice
- [ ] Log In — lockout state after repeated failures (US-2)
- [ ] Confirm Email — deep link in, expired-token state
- [ ] Forgot Password / Reset Password (US-3)
- [ ] Delete the `Placeholder` for each as its real screen lands
- [ ] Error, empty, loading and offline states for each — spec section 10

## Blocked on

The backend endpoints do not exist yet. Registration, verification, login,
lockout and password reset are all still to build — see
[[Sprint 0 — Backend Spike]] "Not built yet". Until then the screens can be
built and tested entirely against the mocks, which is how Phase 0 was done.

The `token_version` / `tv` claim check also lands with this epic; without it
password reset and "log out everywhere" do not actually revoke anything.

## Since this note was written

**2026-10-19.** The screen list above is out of date: PR #75 (handoff 03,
unmerged) renamed and split the Epic A routes. The work is now handoff file
`05-auth-onboarding.md`, against these placeholders:

- **Log in** — `Login`, which is now the first screen. Welcome is removed (03 §7).
- **Register** — `Register` (was Sign Up).
- **Email verification** — `VerifyEmailSent` and `EmailConfirmed` (Confirm Email was
  split in two).
- **Password reset** — `ForgotPassword` → `ResetLinkSent` → `CreateNewPassword` →
  `PasswordResetSuccess` (Reset Password was split).

The forms can use the PR #74 components: TextField, CurrencyField, Button with
its loading label, and Toast. The auth gate already routes an unverified session
to `VerifyEmailSent`. The subtasks above still apply, under the new names. See
[[Open Decisions#2026-10-19 Figma retheme and handoffs 01-03|2026-10-19 decision record]].

## Links

[[Phase 0 — Mobile Scaffold]] · [[Sprint Map]] · `mobile/CLAUDE.md` · spec sections 6, 10
