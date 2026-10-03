/**
 * Subscription screen.
 *
 * Placeholder. The real screen is built in Phase 2 — Epic C and satisfies US-7, US-16, US-19.
 * See src/features/Placeholder.tsx for why these exist.
 */
import { useNavigation } from '@react-navigation/native';

import { Placeholder } from '@/features/Placeholder';

export function SubscriptionDetailScreen() {
  const navigation = useNavigation();

  return (
    <Placeholder
      title="Subscription"
      phase="Phase 2 — Epic C"
      stories="US-7, US-16, US-19"
      backLabel="Subscriptions"
      onBack={() => navigation.goBack()}
    />
  );
}
