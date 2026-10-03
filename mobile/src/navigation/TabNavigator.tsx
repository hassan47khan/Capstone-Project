/**
 * The bottom tab navigator.
 *
 * What this is for
 *   The three tabs a signed-in user sees: Home, Subscriptions, Insights.
 *
 * How FEATURE_SHARING is applied, and why it matters
 *   The prototype includes a fourth "Family" tab for Epic F. It is registered
 *   ONLY when `FEATURE_SHARING` is true — not registered and hidden, not
 *   rendered with `tabBarButton: () => null`. The difference is real: a hidden
 *   tab is still a live route, so a deep link or a stray `navigate('Family')`
 *   would land a user on a half-built screen. An unregistered route does not
 *   exist, and Metro drops the branch from the bundle entirely.
 *
 *   `src/navigation/navigation.test.tsx` asserts the tab is absent while the
 *   flag is false, so the gate cannot be removed by accident.
 *
 * Why the tab bar is custom
 *   The design's bar does not match React Navigation's default, so `TabBar` is
 *   supplied through the `tabBar` prop. That decision is made here, in Phase 0,
 *   because retrofitting it later means rewriting the component and its tests.
 */
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';

import { TabBar } from '@/components';
import { FEATURE_SHARING } from '@/config/features';
import { DashboardScreen } from '@/features/dashboard/DashboardScreen';
import { InsightsScreen } from '@/features/insights/InsightsScreen';
import { SharedPlanScreen } from '@/features/sharing/SharedPlanScreen';
import { SubscriptionsScreen } from '@/features/subscriptions/SubscriptionsScreen';

import type { TabParamList } from './types';

const Tab = createBottomTabNavigator<TabParamList>();

export function TabNavigator() {
  return (
    <Tab.Navigator
      // Our own bar, matching the prototype. See the header comment.
      tabBar={(props) => <TabBar {...props} />}
      screenOptions={{
        // Every screen draws its own Header, so the navigator's one would be a
        // second, differently styled title above it.
        headerShown: false,
      }}
    >
      <Tab.Screen name="Home" component={DashboardScreen} options={{ title: 'Home' }} />
      <Tab.Screen
        name="Subscriptions"
        component={SubscriptionsScreen}
        options={{ title: 'Subscriptions' }}
      />
      <Tab.Screen
        name="Insights"
        component={InsightsScreen}
        options={{ title: 'Insights' }}
      />

      {/*
        Epic F. While the flag is false this renders nothing and the route is
        never registered, so "Family" is unreachable by tap, by deep link, and
        by navigate().
      */}
      {FEATURE_SHARING ? (
        <Tab.Screen
          name="Family"
          component={SharedPlanScreen}
          options={{ title: 'Family' }}
        />
      ) : null}
    </Tab.Navigator>
  );
}
