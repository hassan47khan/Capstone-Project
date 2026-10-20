/**
 * Settings tab.
 *
 * Placeholder. The real screen is built in Phase 5 — handoff 09 and satisfies
 * US-4, US-5. See src/features/Placeholder.tsx for why these exist.
 *
 * It already lists the rows that lead to the Settings modals and to the
 * screens pushed inside the Settings tab, so the whole
 * navigation tree (03 §1) can be walked by hand before any screen is built.
 * In development builds it also links to the component gallery; `__DEV__` is
 * false in a release bundle, so that row and its route both disappear.
 */
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';

import { GroupedList, SettingsRow } from '@/components';
import { Placeholder } from '@/features/Placeholder';
import type { SettingsStackParamList } from '@/navigation/types';

export function SettingsScreen() {
  const navigation = useNavigation();
  /** Pushes within the Settings tab, so the tab bar stays (11 §2.3, §2.6). */
  const stack = useNavigation<NativeStackNavigationProp<SettingsStackParamList>>();
  const open = (
    screen:
      | 'SelectCurrency'
      | 'SelectTimeZone'
      | 'NotificationRules'
      | 'ProfileAccount'
      | 'DevGallery',
  ) => navigation.navigate('App', { screen });

  return (
    <Placeholder title="Settings" phase="Phase 5 — handoff 09" stories="US-4, US-5">
      <GroupedList title="Preferences">
        <SettingsRow
          label="Currency"
          onPress={() => open('SelectCurrency')}
          testID="settings-currency"
        />
        <SettingsRow
          label="Time zone"
          onPress={() => open('SelectTimeZone')}
          testID="settings-timezone"
        />
        <SettingsRow
          label="Notification rules"
          onPress={() => open('NotificationRules')}
          testID="settings-notifications"
        />
        <SettingsRow
          label="Profile & account"
          onPress={() => open('ProfileAccount')}
          testID="settings-profile"
        />
      </GroupedList>

      <GroupedList title="Connections">
        <SettingsRow
          label="Shared plans"
          onPress={() => stack.navigate('SharedPlans')}
          testID="settings-shared-plans"
        />
        <SettingsRow
          label="Connected email"
          onPress={() => stack.navigate('ConnectEmail')}
          testID="settings-connect-email"
        />
      </GroupedList>

      {__DEV__ ? (
        <GroupedList title="Developer">
          <SettingsRow
            label="Component gallery"
            onPress={() => open('DevGallery')}
            testID="dev-gallery-link"
          />
        </GroupedList>
      ) : null}
    </Placeholder>
  );
}
