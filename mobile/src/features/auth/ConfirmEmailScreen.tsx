/**
 * Check your email screen.
 *
 * Placeholder. The real screen is built in Phase 1 — Epic A and satisfies US-1.
 * See src/features/Placeholder.tsx for why these exist.
 */
import { useNavigation } from '@react-navigation/native';

import { Placeholder } from '@/features/Placeholder';

export function ConfirmEmailScreen() {
  const navigation = useNavigation();

  return (
    <Placeholder
      title="Check your email"
      phase="Phase 1 — Epic A"
      stories="US-1"
      backLabel="Log in"
      onBack={() => navigation.goBack()}
    />
  );
}
