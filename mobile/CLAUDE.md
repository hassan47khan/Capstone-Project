# SubTrak mobile — working notes

The React Native client. Read this before changing anything in `mobile/`.

## Sources of truth

| Document                    | Where                                                                                                                                                |
| --------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| Visual design               | Figma `IKYivyJtmBYzJNQ7g8qPGc`, page "Full Integrated Prototype Epic A, B, C". Home (`4:2901`) is only in the original file `kyUS7F8bg4x7GpcPEF4UDN` |
| System Design Specification | `docs/design/SubTrak — System Design Specification.md`                                                                                               |

Where they disagree, the specification wins on behaviour and Figma wins on
appearance. The earlier PDF prototype (`docs/design/SubTrak prototype.pdf`) is
**retired** as an appearance source. [docs/design/README.md](../docs/design/README.md)
records the deliberate overrides and what the design left out, and
[src/theme/CONTRAST.md](src/theme/CONTRAST.md) records every token that differs
from Figma and why.

## The rules that matter

1. **The client does no money math.** Amounts are decimal STRINGS. Totals,
   monthly equivalents, percentages and currency conversion all come from the
   server. `src/api/format.ts` formats and never calculates — no `Number`, no
   `parseFloat`, no arithmetic on an amount, anywhere. Chart components take
   server-computed percentages; they never derive one from an amount.
2. **No raw hex or font sizes outside `src/theme`, and never a static colour.**
   Colours come from `useTheme()` or a `makeStyles` factory so dark mode works;
   importing `lightColors`/`darkColors` in a component is a lint error, as are hex,
   `rgb()`, and literal `fontSize`/`lineHeight`/`letterSpacing`/`borderRadius`
   under `src/components` or `src/features`. Danger red is for destructive actions
   and errors only, never data.
3. **Accessibility is graded.** Every input has a visible label and an
   `accessibilityLabel`. Every switch uses `accessibilityRole="switch"` with
   state. Every touch target is at least 44pt. Every chart has the same figures
   in text beside it. Colour never carries meaning alone.
4. **Never log a request body, a token or an email.** Specification section 11.
5. **404 means "not found or not yours."** Never write copy that mentions
   permission — that would confirm the record exists.

## Layout

```
src/
  api/          client (refresh, mock transport), endpoints, types, errors, format
  components/   the handoff-02 library + Phase-0 primitives — no API, no navigation,
                no copy. Every state is drawn in the dev gallery (features/dev)
  config/       env.ts, features.ts
  features/     auth, home, calendar, analytics, subscriptions, settings, dev (gallery)
                extraction, sharing, notifications  (typed seams, no UI)
  navigation/   root / auth / app / tabs, linking + pendingLink, useDiscardGuard, types
  session/      SessionContext, tokenStore, useAuthGate
  test/         fixtures, routes (shared mock table), MSW handlers, render helpers
  theme/        tokens.ts (light + dark), typography.ts (DM Serif Display, DM Sans),
                ThemeProvider/useTheme, makeStyles, motion.ts (useMotion: every
                animation honours Reduce Motion), fonts.ts, contrast.ts, CONTRAST.md
```

## Navigation (handoff 03)

- **Tree.** Auth stack (Login first) | App stack = MainTabs (Home, Calendar,
  Analytics, Settings) plus a modal group over them. Route names and params are
  in `src/navigation/types.ts`; the route map is in `docs/design/README.md`.
- **Gate.** `useAuthGate` decides the stack:
  - a splash while the session or `GET /me` resolves;
  - `Login` when signed out;
  - `VerifyEmailSent` when signed in but unverified;
  - otherwise Home.
  - Never render an Auth screen on the way to Home — a test counts Login renders.
- **Adding.** The tab-bar FAB is the only add affordance. Never put an Add
  button in a header.
- **Modals.** They close with `Header onClose` (an X). Forms that can be dirty
  call `useDiscardGuard(isDirty)` and render its `sheet`.
- **Deep links.** `verify-email`, `reset-password` and `subscription/:id`. An
  App link that arrives while signed out is parked in `pendingLink.ts` and
  opened after sign-in.

## Mocks

One route table, two consumers. `src/test/routes.ts` holds pure
`(request) => response` handlers; `src/test/handlers.ts` wraps it for MSW in
Jest, and `src/api/client.ts` serves it directly in the app when
`EXPO_PUBLIC_USE_MOCKS=true`. Add an endpoint once, in the table.

The app does NOT run MSW — no interceptors, no polyfills in the bundle. The
tradeoff: the in-app path does not exercise real `fetch`, so serialization and
header bugs appear only in Jest or against the real backend.

Four fixture accounts, all `@subtrak.test`, password `Testpass1!`:
`alex` (full), `sam` (empty), `rosa` (a currency with no rate), `morgan` (locked).

## Scripts

```bash
npm start            # mocks on, from .env.development
npm run start:api    # real backend; set EXPO_PUBLIC_API_URL
npm run verify       # typecheck + lint + format + test — run before every commit
npm test
npm run typecheck
npm run lint
```

## Traps in this toolchain

Each of these cost real time. They are configured correctly now; this is so
nobody "fixes" them back.

- **`render` and `fireEvent` are ASYNC** in React Native Testing Library v14.
  Forgetting `await` does not throw — it leaves `screen` unpopulated and you get
  "`render` function has not been called", which points nowhere near the cause.
- **`toHaveAccessibilityState` was removed** in v14. Use `toBeDisabled()`,
  `toBeBusy()`, `toBeChecked()`, `toBeSelected()`, `toBeExpanded()`.
- **Elements hidden from accessibility are invisible to queries.** Tiles, bars
  and skeletons set `accessibilityElementsHidden` on purpose. To inspect one,
  pass `{ includeHiddenElements: true }`.
- **`transformIgnorePatterns` matches package names by PREFIX**, with `[\\/]` for
  the separator so Windows works. Adding a trailing separator breaks every
  `expo-*` package at once.
- **`.mjs` needs its own transform entry.** jest-expo's key is `\.[jt]sx?$`,
  which excludes it. Allowlisting a package and transforming its extension are
  two separate switches and both are needed.
- **Jest uses undici's `fetch`, not React Native's.** RN's is XHR-based and
  non-functional under jest-expo, and MSW will not patch it. See
  `src/test/polyfills.ts`. Consequence: an RN-specific fetch bug would not be
  caught here.
- **`perf-shim.ts` must run before `polyfills.ts`.** undici captures
  `performance.markResourceTiming` at module load, and ESM imports hoist.
- **MSW v3 renamed `onUnhandledRequest` to `onUnhandledFrame`.** The old name is
  ignored silently, so a copied v2 snippet quietly stops failing on unmocked
  requests.
- **Since Expo SDK 57 the Babel preset ships inside `expo`** — reference it as
  `expo/internal/babel-preset`, not `babel-preset-expo`. And no top-level
  `splash` key; splash is a config plugin.
- **React Native 0.88 (SDK 58) dropped `StyleSheet.NamedStyles` from its
  types.** `makeStyles` defines its own; don't reach for the old one.

## Definition of done

Before a pull request:

- [ ] `npm run verify` passes
- [ ] Every state in prompt section 9 is reachable: loading, empty, error,
      offline, plus the screen's own (lockout, expired link, rate unavailable)
- [ ] Accessibility: labels, roles, states, 44pt targets, text beside every chart
- [ ] No hex, font size or sample data in a screen file
- [ ] Tests named after acceptance criteria (`us7_price_zero_rejected`)
- [ ] PR body has the DoD checklist and an AI-use note (tool, task, what you
      verified yourself)

## Not built yet

Phase 0 shipped the scaffold, theme, 20 primitives, API layer, mocks, session
and navigation shell. Every screen is a `Placeholder`. Phase 1 is Epic A, Phase 2
Epic C, Phase 3 Epic B. Epics D–H are typed seams only — see
`src/features/*/index.ts`.
