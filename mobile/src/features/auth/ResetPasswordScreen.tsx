/**
 * Choose a new password screen.
 *
 * Placeholder. The real screen is built in Phase 1 — Epic A and satisfies US-3.
 * See src/features/Placeholder.tsx for why these exist.
 */
import { useNavigation } from '@react-navigation/native';

import { Placeholder } from '@/features/Placeholder';

export function ResetPasswordScreen() {
  const navigation = useNavigation();

  return (
    <Placeholder
      title="Choose a new password"
      phase="Phase 1 — Epic A"
      stories="US-3"
      backLabel="Log in"
      onBack={() => navigation.goBack()}
    />
  );
}
