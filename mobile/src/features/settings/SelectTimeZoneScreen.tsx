/**
 * Time zone screen.
 *
 * Placeholder. The real screen is built in Phase 5 — handoff 09 and satisfies US-5.
 * See src/features/Placeholder.tsx for why these exist.
 *
 * Presented as a modal (03 §1), so it closes with an X rather than going back.
 */
import { useNavigation } from '@react-navigation/native';

import { Placeholder } from '@/features/Placeholder';

export function SelectTimeZoneScreen() {
  const navigation = useNavigation();

  return (
    <Placeholder
      title="Time zone"
      phase="Phase 5 — handoff 09"
      stories="US-5"
      onClose={() => navigation.goBack()}
    />
  );
}
