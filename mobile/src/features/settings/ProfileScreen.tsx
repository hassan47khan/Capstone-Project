/**
 * Profile screen.
 *
 * Placeholder. The real screen is built in Phase 3 — Epic B and satisfies Profile gap.
 * See src/features/Placeholder.tsx for why these exist.
 */
import { useNavigation } from '@react-navigation/native';

import { Placeholder } from '@/features/Placeholder';

export function ProfileScreen() {
  const navigation = useNavigation();

  return (
    <Placeholder
      title="Profile"
      phase="Phase 3 — Epic B"
      stories="Profile gap"
      backLabel="Settings"
      onBack={() => navigation.goBack()}
    />
  );
}
