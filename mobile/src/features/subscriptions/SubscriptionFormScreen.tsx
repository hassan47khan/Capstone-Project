/**
 * New subscription screen.
 *
 * Placeholder. The real screen is built in Phase 2 — Epic C and satisfies US-7, US-12, US-18.
 * See src/features/Placeholder.tsx for why these exist.
 */
import { useNavigation } from '@react-navigation/native';

import { Placeholder } from '@/features/Placeholder';

export function SubscriptionFormScreen() {
  const navigation = useNavigation();

  return (
    <Placeholder
      title="New subscription"
      phase="Phase 2 — Epic C"
      stories="US-7, US-12, US-18"
      backLabel="Cancel"
      onBack={() => navigation.goBack()}
    />
  );
}
