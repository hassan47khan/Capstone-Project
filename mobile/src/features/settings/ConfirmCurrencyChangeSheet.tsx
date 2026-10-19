/**
 * Confirm currency change — a bottom sheet route (handoff 03 §1).
 *
 * Placeholder behaviour. The real flow is handoff 09 (US-4): changing the
 * display currency re-converts every total, so it is confirmed first.
 *
 * Why it is a route and not local state
 *   03 lists it in the modal stack, presented as a sheet over Select Currency.
 *   It is registered with `presentation: 'transparentModal'`, so the screen
 *   underneath stays visible behind the ConfirmSheet's backdrop. Either button
 *   closes the route; confirming does nothing yet.
 */
import { useNavigation, useRoute, type RouteProp } from '@react-navigation/native';

import { ConfirmSheet } from '@/components';
import type { AppStackParamList } from '@/navigation/types';

export function ConfirmCurrencyChangeSheet() {
  const navigation = useNavigation();
  const { params } = useRoute<RouteProp<AppStackParamList, 'ConfirmCurrencyChange'>>();

  return (
    <ConfirmSheet
      visible
      title={`Switch to ${params.currency}?`}
      message="Every total will be shown in the new currency. Not built yet — handoff 09."
      confirmLabel="Switch currency"
      onConfirm={() => navigation.goBack()}
      onCancel={() => navigation.goBack()}
      testID="confirm-currency"
    />
  );
}
