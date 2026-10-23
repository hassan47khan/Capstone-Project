/**
 * Create your account screen.
 *
 * Placeholder. The real screen is built in Phase 2 — handoff 05 (Epic A) and satisfies US-1.
 * See src/features/Placeholder.tsx for why these exist.
 *
 * The back button shows only when there is somewhere to go back to: the
 * auth gate and deep links can open this screen as the first in the stack.
 */
import { useNavigation } from '@react-navigation/native';

import { Placeholder } from '@/features/Placeholder';

export function RegisterScreen() {
  const navigation = useNavigation();

  return (
    <Placeholder
      title="Create your account"
      phase="Phase 2 — handoff 05 (Epic A)"
      stories="US-1"
      backLabel={navigation.canGoBack() ? 'Log In' : undefined}
      onBack={() => navigation.goBack()}
    />
  );
}
