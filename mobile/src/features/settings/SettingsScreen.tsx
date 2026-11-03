/**
 * Settings tab root (handoff 09 §1; US-4, US-5). Figma `3:1778`.
 *
 * Groups (09 §1)
 *   Display        Currency ("USD ($)"), Time Zone
 *   Notifications  one row into Notification Rules: no inline toggles
 *   Account        Profile ({display name}), Sign Out (confirm sheet)
 *   Connections    Shared plans, Connected email (11 §2.3, §2.6; Rafi's screens)
 *   Developer      the component gallery, dev builds only
 *
 * The "Regular User Account" subtitle is gone (09 §1): it leaked a role name.
 *
 * Values come from what Home already loads, so this adds no requests: the
 * display currency from GET /analytics/summary, the name from GET /me. Until
 * they load, or if they fail, the rows still work and just show no value.
 * Sign out must never sit behind a loading or error screen.
 *
 * Not yet (no endpoint): the time zone value, Date Format (needs /me/settings),
 * Export Data (needs an export endpoint), and Help & Support (no link chosen).
 *
 * The title is Header's 20pt, not 09's display.md: 03 §4 normalizes every header
 * to 20, measured on the Settings frames.
 */
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';

import { analyticsApi, meApi } from '@/api/endpoints';
import { currencySymbol } from '@/api/format';
import { queryKeys } from '@/api/queryKeys';
import { ConfirmSheet, GroupedList, Header, Screen, SettingsRow } from '@/components';
import type { SettingsStackParamList } from '@/navigation/types';
import { useSession } from '@/session/SessionContext';

export const SETTINGS_COPY = {
  title: 'Settings',
  display: 'Display',
  notifications: 'Notifications',
  account: 'Account',
  connections: 'Connections',
  developer: 'Developer',
  currency: 'Currency',
  timeZone: 'Time Zone',
  notificationRules: 'Notifications',
  profile: 'Profile',
  signOut: 'Sign Out',
  sharedPlans: 'Shared plans',
  connectedEmail: 'Connected email',
  gallery: 'Component gallery',
  signOutTitle: 'Sign out?',
  signOutMessage: 'You can sign back in anytime.',
  signOutConfirm: 'Sign out',
} as const;

// "USD ($)", "EUR (€)", "JPY (¥)".
export function currencyValue(code: string): string {
  return `${code} (${currencySymbol(code)})`;
}

export function SettingsScreen() {
  const navigation = useNavigation();
  /** Pushes within the Settings tab, so the tab bar stays (11 §2.3, §2.6). */
  const stack = useNavigation<NativeStackNavigationProp<SettingsStackParamList>>();
  const { signOut } = useSession();
  const [confirmSignOut, setConfirmSignOut] = useState(false);

  // The same queries as Home, so these are usually cached already.
  const profile = useQuery({
    queryKey: queryKeys.session.profile(),
    queryFn: meApi.getProfile,
  });
  const summary = useQuery({
    queryKey: queryKeys.analytics.summary(),
    queryFn: analyticsApi.getSummary,
  });

  /** The Settings modals, opened over the tabs (03 §1). */
  const open = (
    screen:
      | 'SelectCurrency'
      | 'SelectTimeZone'
      | 'NotificationRules'
      | 'ProfileAccount'
      | 'DevGallery',
  ) => navigation.navigate('App', { screen });

  const currency = summary.data?.display_currency;
  // The display name, or the email for an account that never set one.
  const who = profile.data?.name || profile.data?.email;

  return (
    <Screen testID="settings-screen">
      <Header title={SETTINGS_COPY.title} />

      <GroupedList title={SETTINGS_COPY.display}>
        <SettingsRow
          label={SETTINGS_COPY.currency}
          value={currency ? currencyValue(currency) : undefined}
          onPress={() => open('SelectCurrency')}
          testID="settings-currency"
        />
        <SettingsRow
          label={SETTINGS_COPY.timeZone}
          onPress={() => open('SelectTimeZone')}
          testID="settings-timezone"
        />
      </GroupedList>

      {/* 09 §1: one row, and the rules screen holds every setting. */}
      <GroupedList title={SETTINGS_COPY.notifications}>
        <SettingsRow
          label={SETTINGS_COPY.notificationRules}
          onPress={() => open('NotificationRules')}
          testID="settings-notifications"
        />
      </GroupedList>

      <GroupedList title={SETTINGS_COPY.account}>
        <SettingsRow
          label={SETTINGS_COPY.profile}
          value={who}
          onPress={() => open('ProfileAccount')}
          testID="settings-profile"
        />
        <SettingsRow
          variant="destructive"
          label={SETTINGS_COPY.signOut}
          onPress={() => setConfirmSignOut(true)}
          testID="settings-sign-out"
        />
      </GroupedList>

      <GroupedList title={SETTINGS_COPY.connections}>
        <SettingsRow
          label={SETTINGS_COPY.sharedPlans}
          onPress={() => stack.navigate('SharedPlans')}
          testID="settings-shared-plans"
        />
        <SettingsRow
          label={SETTINGS_COPY.connectedEmail}
          onPress={() => stack.navigate('ConnectEmail')}
          testID="settings-connect-email"
        />
      </GroupedList>

      {__DEV__ ? (
        <GroupedList title={SETTINGS_COPY.developer}>
          <SettingsRow
            label={SETTINGS_COPY.gallery}
            onPress={() => open('DevGallery')}
            testID="dev-gallery-link"
          />
        </GroupedList>
      ) : null}

      <ConfirmSheet
        visible={confirmSignOut}
        title={SETTINGS_COPY.signOutTitle}
        message={SETTINGS_COPY.signOutMessage}
        confirmLabel={SETTINGS_COPY.signOutConfirm}
        onConfirm={() => {
          setConfirmSignOut(false);
          // The app swaps to Log In; the refresh token is kept for biometric
          // unlock, as everywhere else sign-out happens (05 §5).
          void signOut();
        }}
        onCancel={() => setConfirmSignOut(false)}
        testID="sign-out-sheet"
      />
    </Screen>
  );
}
