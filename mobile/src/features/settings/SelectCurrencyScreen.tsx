/**
 * Currency screen.
 *
 * Placeholder. The real screen is built in Phase 5 — handoff 09 and satisfies US-4.
 * See src/features/Placeholder.tsx for why these exist.
 *
 * Presented as a modal (03 §1), so it closes with an X rather than going back.
 */
import { useNavigation } from '@react-navigation/native';

import { Placeholder } from '@/features/Placeholder';

export function SelectCurrencyScreen() {
  const navigation = useNavigation();

  return (
    <Placeholder
      title="Currency"
      phase="Phase 5 — handoff 09"
      stories="US-4"
      onClose={() => navigation.goBack()}
    />
  );
}
