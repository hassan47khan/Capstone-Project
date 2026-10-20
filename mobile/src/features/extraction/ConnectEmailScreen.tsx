/**
 * Connect email screen.
 *
 * Placeholder. The real screen is built in Phase 6 — handoff 11 §2.3 and satisfies
 * US-9 to US-11. See src/features/Placeholder.tsx for why these exist.
 *
 * Pushed inside the Settings tab (03 §1), so it goes back rather than closing.
 * It links to ReviewExtraction so the tree can be walked by hand.
 */
import { useNavigation } from '@react-navigation/native';

import { GroupedList, SettingsRow } from '@/components';
import { Placeholder } from '@/features/Placeholder';

export function ConnectEmailScreen() {
  const navigation = useNavigation();

  return (
    <Placeholder
      title="Connect email"
      phase="Phase 6 — handoff 11 §2.3"
      stories="US-9 to US-11"
      backLabel="Settings"
      onBack={() => navigation.goBack()}
    >
      <GroupedList title="Found in your email">
        <SettingsRow
          label="Review extraction"
          onPress={() => navigation.navigate('App', { screen: 'ReviewExtraction' })}
          testID="connect-email-review"
        />
      </GroupedList>
    </Placeholder>
  );
}
