/**
 * Time zone screen.
 *
 * Placeholder. The real screen is built in Phase 3 — Epic B and satisfies US-5.
 * See src/features/Placeholder.tsx for why these exist.
 */
import { useNavigation } from '@react-navigation/native';

import { Placeholder } from '@/features/Placeholder';

export function TimeZonePickerScreen() {
  const navigation = useNavigation();

  return (
    <Placeholder
      title="Time zone"
      phase="Phase 3 — Epic B"
      stories="US-5"
      backLabel="Settings"
      onBack={() => navigation.goBack()}
    />
  );
}
