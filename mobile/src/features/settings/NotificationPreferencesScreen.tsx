/**
 * Notifications screen.
 *
 * Placeholder. The real screen is built in Phase 3 — Epic B and satisfies Preferences gap.
 * See src/features/Placeholder.tsx for why these exist.
 */
import { useNavigation } from '@react-navigation/native';

import { Placeholder } from '@/features/Placeholder';

export function NotificationPreferencesScreen() {
  const navigation = useNavigation();

  return (
    <Placeholder
      title="Notifications"
      phase="Phase 3 — Epic B"
      stories="Preferences gap"
      backLabel="Settings"
      onBack={() => navigation.goBack()}
    />
  );
}
