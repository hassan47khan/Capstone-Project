/**
 * The authenticated stack.
 *
 * What this is for
 *   The tab navigator, plus every screen that is pushed over it: subscription
 *   detail, the add/edit form, and the Settings branch.
 *
 * Why these are pushed rather than being tabs
 *   The design shows no tab bar on a detail or form screen — they are
 *   destinations you come back from, not places you live. Pushing them onto a
 *   stack above the tabs gives that for free, with the platform's back gesture.
 *
 * The AddEntry seam
 *   `AddEntry` currently forwards straight to the manual form. Epic D will
 *   replace it with the AI-or-manual choice screen. Every Add button in the app
 *   already points at `AddEntry`, so that swap is one file — which is the whole
 *   reason the indirection exists now, while it looks pointless.
 */
import { createNativeStackNavigator } from '@react-navigation/native-stack';

import { AddEntryScreen } from '@/features/subscriptions/AddEntryScreen';
import { SubscriptionDetailScreen } from '@/features/subscriptions/SubscriptionDetailScreen';
import { SubscriptionFormScreen } from '@/features/subscriptions/SubscriptionFormScreen';
import { CurrencyPickerScreen } from '@/features/settings/CurrencyPickerScreen';
import { NotificationPreferencesScreen } from '@/features/settings/NotificationPreferencesScreen';
import { ProfileScreen } from '@/features/settings/ProfileScreen';
import { SettingsScreen } from '@/features/settings/SettingsScreen';
import { TimeZonePickerScreen } from '@/features/settings/TimeZonePickerScreen';

import { TabNavigator } from './TabNavigator';
import type { AppStackParamList } from './types';

const Stack = createNativeStackNavigator<AppStackParamList>();

export function AppNavigator() {
  return (
    <Stack.Navigator initialRouteName="Tabs" screenOptions={{ headerShown: false }}>
      <Stack.Screen name="Tabs" component={TabNavigator} />

      <Stack.Screen name="SubscriptionDetail" component={SubscriptionDetailScreen} />
      <Stack.Screen name="AddEntry" component={AddEntryScreen} />
      <Stack.Screen
        name="SubscriptionForm"
        component={SubscriptionFormScreen}
        // A form is a task you complete or abandon, so it slides up from the
        // bottom and has a Cancel rather than a back link — matching the
        // prototype's "New subscription" screen.
        options={{ presentation: 'modal' }}
      />

      <Stack.Screen name="Settings" component={SettingsScreen} />
      <Stack.Screen name="CurrencyPicker" component={CurrencyPickerScreen} />
      <Stack.Screen name="TimeZonePicker" component={TimeZonePickerScreen} />
      <Stack.Screen
        name="NotificationPreferences"
        component={NotificationPreferencesScreen}
      />
      <Stack.Screen name="Profile" component={ProfileScreen} />
    </Stack.Navigator>
  );
}
