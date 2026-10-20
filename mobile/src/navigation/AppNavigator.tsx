/**
 * The authenticated stack (handoff 03 §1, §3).
 *
 * What it is for
 *   The tab navigator, plus the modal group presented over it: add, detail,
 *   edit and history for subscriptions, and the Settings sub-screens.
 *
 * The three modal rules (03 §3) and where each is enforced
 *   1. Add Subscription presents as a modal with a close (X). The group below
 *      sets `presentation: 'modal'`; the screen's Header renders the X.
 *   2. A presented modal marks no tab as active. The modal is a sibling of
 *      `MainTabs` in THIS stack, not a screen inside the tabs, so the tab
 *      navigator's state — and its selected tab — is untouched underneath.
 *   3. A dirty form confirms before it is discarded: `useDiscardGuard` in the
 *      form screens (handoff 07 wires it to real form state).
 *
 * Motion (02 §15)
 *   Modals slide up over 350ms. Under reduced motion they cross-fade instead.
 */
import { createNativeStackNavigator } from '@react-navigation/native-stack';

import { GalleryScreen } from '@/features/dev/GalleryScreen';
import { ConfirmCurrencyChangeSheet } from '@/features/settings/ConfirmCurrencyChangeSheet';
import { NotificationRulesScreen } from '@/features/settings/NotificationRulesScreen';
import { ProfileAccountScreen } from '@/features/settings/ProfileAccountScreen';
import { SelectCurrencyScreen } from '@/features/settings/SelectCurrencyScreen';
import { SelectTimeZoneScreen } from '@/features/settings/SelectTimeZoneScreen';
import { AddSubscriptionScreen } from '@/features/subscriptions/AddSubscriptionScreen';
import { EditHistoryScreen } from '@/features/subscriptions/EditHistoryScreen';
import { EditSubscriptionScreen } from '@/features/subscriptions/EditSubscriptionScreen';
import { SubscriptionDetailScreen } from '@/features/subscriptions/SubscriptionDetailScreen';
import { useMotion } from '@/theme';

import { TabNavigator } from './TabNavigator';
import type { AppStackParamList } from './types';

const Stack = createNativeStackNavigator<AppStackParamList>();

export function AppNavigator() {
  const m = useMotion();

  return (
    <Stack.Navigator initialRouteName="MainTabs" screenOptions={{ headerShown: false }}>
      <Stack.Screen name="MainTabs" component={TabNavigator} />

      <Stack.Group
        screenOptions={{
          presentation: 'modal',
          animation: m.moves ? 'slide_from_bottom' : 'fade',
          animationDuration: m.modal,
        }}
      >
        <Stack.Screen name="AddSubscription" component={AddSubscriptionScreen} />
        <Stack.Screen name="SubscriptionDetail" component={SubscriptionDetailScreen} />
        <Stack.Screen name="EditSubscription" component={EditSubscriptionScreen} />
        <Stack.Screen name="EditHistory" component={EditHistoryScreen} />
        <Stack.Screen name="SelectCurrency" component={SelectCurrencyScreen} />
        <Stack.Screen name="SelectTimeZone" component={SelectTimeZoneScreen} />
        <Stack.Screen name="NotificationRules" component={NotificationRulesScreen} />
        <Stack.Screen name="ProfileAccount" component={ProfileAccountScreen} />

        {/* Development only: absent from a release bundle, so unreachable there. */}
        {__DEV__ ? <Stack.Screen name="DevGallery" component={GalleryScreen} /> : null}
      </Stack.Group>

      {/* A sheet over Select Currency: the screen below stays visible. */}
      <Stack.Screen
        name="ConfirmCurrencyChange"
        component={ConfirmCurrencyChangeSheet}
        options={{ presentation: 'transparentModal', animation: 'none' }}
      />
    </Stack.Navigator>
  );
}
