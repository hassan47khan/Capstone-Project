# SubTrak mobile — working notes

The React Native client. Read this before changing anything in `mobile/`.

## Sources of truth

Two documents govern this app. **Neither is in the repo yet** — Hassan is adding
them at the paths below. Until then, ask for the current copies.

| Document                            | Will live at                                    |
| ----------------------------------- | ----------------------------------------------- |
| Visual design ("SubTrak prototype") | `docs/design/SubTrak prototype.pdf`             |
| System Design Specification         | `docs/SubTrak — System Design Specification.md` |

Where they disagree, the specification wins on behaviour and the PDF wins on
appearance. [docs/design/README.md](../docs/design/README.md) records the three
deliberate overrides and what the design left out.

## The rules that matter

1. **The client does no money math.** Amounts are decimal STRINGS. Totals,
   monthly equivalents, percentages and currency conversion all come from the
   server. `src/api/format.ts` formats and never calculates — no `Number`, no
   `parseFloat`, no arithmetic on an amount, anywhere. Chart components take
   server-computed percentages; they never derive one from an amount.
2. **No raw hex or font sizes outside `src/theme`.** ESLint fails the build on a
   hex literal under `src/components` or `src/features`.
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
  components/   the 20 primitives — no API, no navigation, no copy
  config/       env.ts, features.ts
  features/     auth, dashboard, subscriptions, settings, insights
                extraction, sharing, notifications, analytics  (typed seams, no UI)
  navigation/   root / auth / app / tabs, linking, types
  session/      SessionContext, tokenStore
  test/         fixtures, routes (shared mock table), MSW handlers, render helpers
  theme/        tokens.ts, typography.ts, fonts.ts, contrast.ts
```

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
- **Expo SDK 57 has no standalone `babel-preset-expo`** — it is
  `expo/internal/babel-preset`. And no top-level `splash` key; splash is a config
  plugin.

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
