/**
 * Review extraction screen.
 *
 * Placeholder. The real screen is built in Phase 6 — handoff 11 §2.4 and satisfies
 * US-9 to US-11. See src/features/Placeholder.tsx for why these exist.
 *
 * Presented as a modal (03 §1), so it closes with an X rather than going back.
 */
import { useNavigation } from '@react-navigation/native';

import { Placeholder } from '@/features/Placeholder';

export function ReviewExtractionScreen() {
  const navigation = useNavigation();

  return (
    <Placeholder
      title="Review extraction"
      phase="Phase 6 — handoff 11 §2.4"
      stories="US-9 to US-11"
      onClose={() => navigation.goBack()}
    />
  );
}
