/**
 * Navigation route types.
 *
 * What this is for
 *   The param list for every route, so `navigation.navigate('SubscriptionDetail',
 *   { id })` is checked at compile time and a typo or a missing parameter is a
 *   build error rather than a blank screen.
 *
 * Why Family appears here while the tab is disabled
 *   `FEATURE_SHARING` gates whether the route is REGISTERED, not whether it is
 *   typed. Keeping the type means turning the flag on is a one-line change
 *   rather than a type refactor, and the navigator and this file cannot drift
 *   apart in the meantime. Nothing can navigate to an unregistered route, so
 *   there is no way to reach it while the flag is false.
 */

import type { NavigatorScreenParams } from '@react-navigation/native';

/** Screens shown when nobody is signed in (Epic A). */
export type AuthStackParamList = {
  Welcome: undefined;
  SignUp: undefined;
  /** Carries the address so the screen can say which inbox to check. */
  ConfirmEmail: { email: string };
  LogIn: undefined;
  ForgotPassword: undefined;
  /** `token` arrives from the emailed deep link. */
  ResetPassword: { token: string };
};

/** The bottom tabs. `Family` is registered only when FEATURE_SHARING is true. */
export type TabParamList = {
  Home: undefined;
  Subscriptions: undefined;
  Insights: undefined;
  /** Epic F. Not registered while FEATURE_SHARING is false. */
  Family: undefined;
};

/** Screens shown when signed in: the tabs, plus everything pushed over them. */
export type AppStackParamList = {
  Tabs: NavigatorScreenParams<TabParamList>;
  SubscriptionDetail: { id: string };
  /**
   * The add/edit form. No `id` means create; an `id` means edit. One route for
   * both, because they are the same form against the same validation.
   */
  SubscriptionForm: { id?: string };
  /**
   * Epic D will put the AI-or-manual choice behind this route. For now it
   * forwards straight to the manual form, so swapping it in later touches one
   * file instead of every Add button.
   */
  AddEntry: undefined;
  Settings: undefined;
  CurrencyPicker: undefined;
  TimeZonePicker: undefined;
  NotificationPreferences: undefined;
  Profile: undefined;
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
