/**
 * Trial Shield screen.
 *
 * Placeholder. The real screen is built in Phase 6 — handoff 11 §2.5 and satisfies
 * US-12, US-13. See src/features/Placeholder.tsx for why these exist.
 *
 * Pushed inside the Calendar tab (03 §1), so it goes back rather than closing.
 */
import { useNavigation } from '@react-navigation/native';

import { Placeholder } from '@/features/Placeholder';

export function TrialShieldScreen() {
  const navigation = useNavigation();

  return (
    <Placeholder
      title="Trial Shield"
      phase="Phase 6 — handoff 11 §2.5"
      stories="US-12, US-13"
      backLabel="Calendar"
      onBack={() => navigation.goBack()}
    />
  );
}
