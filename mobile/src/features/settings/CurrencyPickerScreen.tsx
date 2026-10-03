/**
 * Currency screen.
 *
 * Placeholder. The real screen is built in Phase 3 — Epic B and satisfies US-4.
 * See src/features/Placeholder.tsx for why these exist.
 */
import { useNavigation } from '@react-navigation/native';

import { Placeholder } from '@/features/Placeholder';

export function CurrencyPickerScreen() {
  const navigation = useNavigation();

  return (
    <Placeholder
      title="Currency"
      phase="Phase 3 — Epic B"
      stories="US-4"
      backLabel="Settings"
      onBack={() => navigation.goBack()}
    />
  );
}
