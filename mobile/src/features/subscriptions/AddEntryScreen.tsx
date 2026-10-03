/**
 * Add subscription screen.
 *
 * Placeholder. The real screen is built in Phase 2 — Epic C (Epic D replaces this) and satisfies US-7, later US-9.
 * See src/features/Placeholder.tsx for why these exist.
 */
import { useNavigation } from '@react-navigation/native';

import { Placeholder } from '@/features/Placeholder';

export function AddEntryScreen() {
  const navigation = useNavigation();

  return (
    <Placeholder
      title="Add subscription"
      phase="Phase 2 — Epic C (Epic D replaces this)"
      stories="US-7, later US-9"
      backLabel="Subscriptions"
      onBack={() => navigation.goBack()}
    />
  );
}
