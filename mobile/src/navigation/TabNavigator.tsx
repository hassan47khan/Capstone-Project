/**
 * The bottom tab navigator (handoff 03 §1, §2).
 *
 * What it is for
 *   The four tabs a signed-in user lives in: Home, Calendar, Analytics,
 *   Settings — with the add button (FAB) drawn between Calendar and Analytics.
 *
 * One tab bar
 *   `TabBar` is supplied once through the `tabBar` prop and reused for every
 *   tab, so it cannot drift between screens the way the prototype's eight
 *   copy-pasted bars did. The FAB opens Add Subscription as a modal over the
 *   tabs; it is the only add affordance in the app (00, rule 4).
 *
 * No Family tab
 *   03's tree has none; family sharing is handoff 10, a stretch goal. Its screen
 *   (`features/sharing/SharedPlanScreen`) is kept but not registered anywhere,
 *   so it is unreachable by tap, deep link or `navigate()`.
 */
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { useNavigation } from '@react-navigation/native';

import { TabBar } from '@/components';
import { AnalyticsScreen } from '@/features/analytics/AnalyticsScreen';
import { CalendarScreen } from '@/features/calendar/CalendarScreen';
import { HomeScreen } from '@/features/home/HomeScreen';
import { SettingsScreen } from '@/features/settings/SettingsScreen';

import type { MainTabParamList } from './types';

const Tab = createBottomTabNavigator<MainTabParamList>();

export function TabNavigator() {
  const navigation = useNavigation();

  return (
    <Tab.Navigator
      tabBar={(props) => (
        <TabBar
          {...props}
          onAdd={() => navigation.navigate('App', { screen: 'AddSubscription' })}
        />
      )}
      // Every screen draws its own Header.
      screenOptions={{ headerShown: false }}
    >
      <Tab.Screen name="Home" component={HomeScreen} options={{ title: 'Home' }} />
      <Tab.Screen
        name="Calendar"
        component={CalendarScreen}
        options={{ title: 'Calendar' }}
      />
      <Tab.Screen
        name="Analytics"
        component={AnalyticsScreen}
        options={{ title: 'Analytics' }}
      />
      <Tab.Screen
        name="Settings"
        component={SettingsScreen}
        options={{ title: 'Settings' }}
      />
    </Tab.Navigator>
  );
}
