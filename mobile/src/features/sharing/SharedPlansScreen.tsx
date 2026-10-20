/**
 * Shared plans screen.
 *
 * Placeholder. The real screen is built in Phase 6 — handoff 11 §2.6 and satisfies
 * US-14, US-15. See src/features/Placeholder.tsx for why these exist.
 *
 * Pushed inside the Settings tab (03 §1), so it goes back rather than closing.
 * This is not Family (handoff 10, a stretch goal); the two share no tables.
 */
import { useNavigation } from '@react-navigation/native';

import { Placeholder } from '@/features/Placeholder';

export function SharedPlansScreen() {
  const navigation = useNavigation();

  return (
    <Placeholder
      title="Shared plans"
      phase="Phase 6 — handoff 11 §2.6"
      stories="US-14, US-15"
      backLabel="Settings"
      onBack={() => navigation.goBack()}
    />
  );
}
