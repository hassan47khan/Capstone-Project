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
 * Two tabs are stacks
 *   Calendar pushes TrialShield (11 §2.5); Settings pushes SharedPlans and
 *   ConnectEmail (11 §2.3, §2.6). They are pushed inside the tab, not presented
 *   as modals, so the tab bar stays visible with that tab selected, as the
 *   frames show. Tapping the selected tab pops its stack back to the root.
 *
 * No Family tab
 *   03's tree has none; Family is handoff 10, a stretch goal. SharedPlans is not
 *   Family: it belongs to the AI epic (11 §2.6, graded) and lives in the Settings
 *   stack above.
 */
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { useNavigation } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';

import { TabBar } from '@/components';
import { AnalyticsScreen } from '@/features/analytics/AnalyticsScreen';
import { CalendarScreen } from '@/features/calendar/CalendarScreen';
import { TrialShieldScreen } from '@/features/calendar/TrialShieldScreen';
import { ConnectEmailScreen } from '@/features/extraction/ConnectEmailScreen';
import { HomeScreen } from '@/features/home/HomeScreen';
import { SettingsScreen } from '@/features/settings/SettingsScreen';
import { SharedPlansScreen } from '@/features/sharing/SharedPlansScreen';

import type {
  CalendarStackParamList,
  MainTabParamList,
  SettingsStackParamList,
} from './types';

const Tab = createBottomTabNavigator<MainTabParamList>();
const CalendarStack = createNativeStackNavigator<CalendarStackParamList>();
const SettingsStack = createNativeStackNavigator<SettingsStackParamList>();

function CalendarNavigator() {
  return (
    <CalendarStack.Navigator screenOptions={{ headerShown: false }}>
      <CalendarStack.Screen name="CalendarMain" component={CalendarScreen} />
      <CalendarStack.Screen name="TrialShield" component={TrialShieldScreen} />
    </CalendarStack.Navigator>
  );
}

function SettingsNavigator() {
  return (
    <SettingsStack.Navigator screenOptions={{ headerShown: false }}>
      <SettingsStack.Screen name="SettingsMain" component={SettingsScreen} />
      <SettingsStack.Screen name="SharedPlans" component={SharedPlansScreen} />
      <SettingsStack.Screen name="ConnectEmail" component={ConnectEmailScreen} />
    </SettingsStack.Navigator>
  );
}

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
        component={CalendarNavigator}
        options={{ title: 'Calendar' }}
      />
      <Tab.Screen
        name="Analytics"
        component={AnalyticsScreen}
        options={{ title: 'Analytics' }}
      />
      <Tab.Screen
        name="Settings"
        component={SettingsNavigator}
        options={{ title: 'Settings' }}
      />
    </Tab.Navigator>
  );
}
