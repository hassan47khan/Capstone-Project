/**
 * Add subscription screen.
 *
 * Placeholder. The real screen is built in Phase 3 — handoff 07 and satisfies US-7.
 * See src/features/Placeholder.tsx for why these exist.
 *
 * Presented as a modal (03 §1), so it closes with an X rather than going back.
 */
import { useNavigation } from '@react-navigation/native';

import { Placeholder } from '@/features/Placeholder';

export function AddSubscriptionScreen() {
  const navigation = useNavigation();

  return (
    <Placeholder
      title="Add subscription"
      phase="Phase 3 — handoff 07"
      stories="US-7"
      onClose={() => navigation.goBack()}
    />
  );
}
