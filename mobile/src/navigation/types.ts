/**
 * Navigation route types (handoff 03 §1).
 *
 * What this is for
 *   The param list for every route, so `navigation.navigate('SubscriptionDetail',
 *   { id })` is checked at compile time and a typo or a missing parameter is a
 *   build error rather than a blank screen.
 *
 * The tree
 *   RootNavigator
 *   ├── Auth   (unauthenticated, or signed in but email unverified)
 *   └── App
 *       ├── MainTabs: Home · Calendar · Analytics · Settings  (+ the FAB)
 *       │     Calendar → stack: CalendarMain, TrialShield
 *       │     Settings → stack: SettingsMain, SharedPlans, ConnectEmail
 *       └── modal group, presented over the tabs
 *
 * Deliberately absent (03 §7): Welcome/landing, the feature tour, Admin Log In,
 * the Paywall, and the Family tab (handoff 10, a stretch goal).
 */

import type { NavigatorScreenParams } from '@react-navigation/native';

/** Screens shown when nobody is signed in (handoff 05). */
export type AuthStackParamList = {
  Login: undefined;
  Register: undefined;
  /** Carries the address when known, so the screen can say which inbox to check. */
  VerifyEmailSent: { email?: string } | undefined;
  /** `token` arrives from the emailed link: subtrak://verify-email?token=… */
  EmailConfirmed: { token: string };
  ForgotPassword: undefined;
  ResetLinkSent: { email: string };
  /** `token` arrives from the emailed link: subtrak://reset-password?token=… */
  CreateNewPassword: { token: string };
  PasswordResetSuccess: undefined;
};

/**
 * The Calendar tab's stack (handoff 11 §2.5). The root is `CalendarMain`, not
 * `Calendar`, because React Navigation warns when a nested screen shares its
 * parent's name.
 */
export type CalendarStackParamList = {
  CalendarMain: undefined;
  TrialShield: undefined;
};

/** The Settings tab's stack (handoff 11 §2.3, §2.6). Root named as above. */
export type SettingsStackParamList = {
  SettingsMain: undefined;
  SharedPlans: undefined;
  ConnectEmail: undefined;
};

/** The four bottom tabs. The FAB between Calendar and Analytics is not a tab. */
export type MainTabParamList = {
  Home: undefined;
  Calendar: NavigatorScreenParams<CalendarStackParamList>;
  Analytics: undefined;
  Settings: NavigatorScreenParams<SettingsStackParamList>;
};

/** Signed in: the tabs, plus the modal group presented over them. */
export type AppStackParamList = {
  MainTabs: NavigatorScreenParams<MainTabParamList>;
  AddSubscription: undefined;
  SubscriptionDetail: { id: string };
  EditSubscription: { id: string };
  EditHistory: { id: string };
  SelectCurrency: undefined;
  /** A bottom sheet confirming the switch to `currency`. */
  ConfirmCurrencyChange: { currency: string };
  SelectTimeZone: undefined;
  NotificationRules: undefined;
  ProfileAccount: undefined;
  /** Opened from ConnectEmail or the scan list (handoff 11 §2.4). */
  ReviewExtraction: undefined;
  /** Dev-only component gallery. Registered only when `__DEV__` is true. */
  DevGallery: undefined;
};

/** The root: either the auth stack or the app stack, never both. */
export type RootStackParamList = {
  Auth: NavigatorScreenParams<AuthStackParamList>;
  App: NavigatorScreenParams<AppStackParamList>;
};

/**
 * Makes `useNavigation()` typed everywhere without a generic at each call site.
 * React Navigation reads this interface by name.
 */
declare global {
  namespace ReactNavigation {
    // Deliberately empty. This is React Navigation's documented declaration
    // merging hook: the library looks up `ReactNavigation.RootParamList` by
    // name, and extending it here is what makes every `useNavigation()` call in
    // the app typed without a generic argument.
    // eslint-disable-next-line @typescript-eslint/no-empty-object-type
    interface RootParamList extends RootStackParamList {}
  }
}
