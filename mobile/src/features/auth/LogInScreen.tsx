/**
 * Welcome back screen.
 *
 * Placeholder. The real screen is built in Phase 1 — Epic A and satisfies US-2.
 * See src/features/Placeholder.tsx for why these exist.
 */
import { useNavigation } from '@react-navigation/native';

import { Placeholder } from '@/features/Placeholder';

export function LogInScreen() {
  const navigation = useNavigation();

  return (
    <Placeholder
      title="Welcome back"
      phase="Phase 1 — Epic A"
      stories="US-2"
      backLabel="Welcome"
      onBack={() => navigation.goBack()}
    />
  );
}
