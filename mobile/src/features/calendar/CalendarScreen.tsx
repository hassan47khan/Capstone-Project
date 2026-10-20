/**
 * Calendar screen.
 *
 * Placeholder. The real screen is built in Phase 8 — handoff 11 §1 and satisfies renewal calendar.
 * See src/features/Placeholder.tsx for why these exist.
 *
 * It already links to Trial Shield, which the real screen opens from its header
 * (11 §2.5), so the Calendar stack can be walked by hand.
 */
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';

import { GroupedList, SettingsRow } from '@/components';
import { Placeholder } from '@/features/Placeholder';
import type { CalendarStackParamList } from '@/navigation/types';

export function CalendarScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<CalendarStackParamList>>();

  return (
    <Placeholder
      title="Calendar"
      phase="Phase 8 — handoff 11 §1"
      stories="renewal calendar"
    >
      <GroupedList title="Trials">
        <SettingsRow
          label="Trial Shield"
          onPress={() => navigation.navigate('TrialShield')}
          testID="calendar-trial-shield"
        />
      </GroupedList>
    </Placeholder>
  );
}
