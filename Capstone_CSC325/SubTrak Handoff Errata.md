# SubTrak handoff errata (use these over any older handoff copy)

1. Home comes from Figma frame 4:2901 in the ORIGINAL file kyUS7F8bg4x7GpcPEF4UDN.
   Never build 113:641 ("2 - Dashboard") or 113:765 ("1b - Connect Email (failed)").
   All other screens use the newer file IKYivyJtmBYzJNQ7g8qPGc.
2. Delete is a soft delete (status=deleted, history kept) with a 6-second Undo toast
   that calls POST /subscriptions/{id}/restore. It is not a hard delete.
3. Active trials never count toward monthly or annual totals until they convert.
   Alex's monthly total stays $129.20 (EUR 118.56 at 0.9177).
4. color.danger is only for errors and destructive actions. Never use it on urgency
   chips or data. Use the warning tokens instead.
5. Stack: expo-router, React Native StyleSheet with tokens, TanStack Query,
   TypeScript strict, simplejwt.
6. Open questions: Adobe CC price ($59.99 in the Analytics frame vs $54.99 in the
   dataset), paywall, Family in/out, email provider, target platforms.

## Since this note was written

**2026-10-20. Checked `03-navigation.md` against `main` at `2bbcdef`** (navigation
landed in #83, `23e8ff3`). I re-ran `npx jest src/navigation` on 2026-10-20 and
got 38/38 passing. That number is from the run, not copied from a commit message.

**Item 5 is wrong about the router.** The app uses **React Navigation 7**
(`@react-navigation/native`, `native-stack`, `bottom-tabs`), not expo-router. The
code and [[Repo State]] agree on this, so the code wins. The rest of item 5 still
holds: TanStack Query, TypeScript strict, simplejwt, and tokens through
`makeStyles`/`useTheme`, which wraps StyleSheet.

**What matches 03**
- §1: all eight Auth screens are there. MainTabs has Home, Calendar, Analytics
  and Settings. The modal group has AddSubscription, SubscriptionDetail,
  EditSubscription, EditHistory, SelectCurrency, ConfirmCurrencyChange (as a
  transparent sheet), SelectTimeZone, NotificationRules and ProfileAccount.
  `DevGallery` is an extra route, registered in `__DEV__` builds only.
- §2: `TabBar` is one instance passed through `tabBar`. Its sizes come from
  tokens: 72 + inset, tab width 72, 20px icons, 4px gap. Tabs fill the full
  72pt height. The FAB is 56/48/24 and placed after two tabs. It is
  `role="button"`, labelled "Add subscription", and never marked selected.
- §3: modals sit beside MainTabs, so the selected tab underneath doesn't change.
  AddSubscription has an X. `useDiscardGuard` blocks a dirty form on
  `beforeRemove` and lets a pristine one close.
- §4: titles are left-aligned and can't be centred. Back/close is 32pt to look
  at and 44pt to touch (hitSlop).
- §5: `useAuthGate` handles all five cases. The splash renders `null`, so
  there's no flash of the Auth stack. An offline `/me` still lets the user in.
- §6: all three links work, using the singular `subscription/:id`. They're
  tested on cold start and from the background. A link that arrives while
  signed out is saved in `pendingLink.ts` and opened after sign-in.
- §7: none of the excluded screens has a route.

**Gaps: 03 isn't done**
- [ ] **Calendar should be a stack** (Calendar → TrialShield, 11 §2.5). Right now
      it's a single screen, and TrialShield has no route.
- [ ] **Settings should be a stack** (Settings → SharedPlans, ConnectEmail,
      11 §2.6). It's a single screen and neither route exists. The comment in
      `TabNavigator.tsx` treats `SharedPlanScreen` as Family (handoff 10,
      stretch) and leaves it unregistered on purpose. That mixes up two things:
      SharedPlans belongs to the AI epic (graded, Rafi, 12), and only Family is a
      stretch goal. Rename the screen to `SharedPlans` when it gets registered.
- [ ] **ReviewExtraction is missing from the modal group** (11 §2.4).
      `features/extraction/` contains only an `index.ts`.
- [ ] **The header title is 24, not 20.** `Header` uses `typography.displayMd`
      (24). 03 §4 normalizes it to 20. `displaySm` (20/28) exists but is
      documented as the bottom-sheet title. This isn't in the deviation list in
      `GalleryScreen.tsx` or [[2026-10-19]]. Either switch to 20 or record it as
      a deliberate deviation.
- [ ] Device pass is still open (see [[2026-10-19]] next steps).
