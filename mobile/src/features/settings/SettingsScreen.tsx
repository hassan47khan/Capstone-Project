/**
 * Settings screen.
 *
 * Placeholder. The real screen is built in Phase 3 — Epic B and satisfies US-4, US-5.
 * See src/features/Placeholder.tsx for why these exist.
 */
import { useNavigation } from '@react-navigation/native';

import { Placeholder } from '@/features/Placeholder';

export function SettingsScreen() {
  const navigation = useNavigation();

  return (
    <Placeholder
      title="Settings"
      phase="Phase 3 — Epic B"
      stories="US-4, US-5"
      backLabel="Home"
      onBack={() => navigation.goBack()}
    />
  );
}
