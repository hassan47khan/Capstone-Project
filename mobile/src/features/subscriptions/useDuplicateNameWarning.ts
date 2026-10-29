/**
 * The duplicate-name warning for Add and Edit (07 §8): "You already track a
 * Netflix." It never blocks saving.
 *
 * Reads the subscription list, which is usually cached already. While it loads,
 * or if it fails, there is simply no warning: the form works the same.
 */
import { useQuery } from '@tanstack/react-query';
import { useEffect } from 'react';
import { AccessibilityInfo } from 'react-native';

import { queryKeys } from '@/api/queryKeys';

import { listSubscriptions } from './api';
import { duplicateNameWarning } from './formRules';

export function useDuplicateNameWarning(name: string, ownId?: string): string | null {
  const list = useQuery({
    queryKey: queryKeys.subscriptions.list(),
    queryFn: listSubscriptions,
  });
  const warning = duplicateNameWarning(name, list.data ?? [], ownId);

  // The helper line isn't announced when it appears, so say it once.
  useEffect(() => {
    if (warning) AccessibilityInfo.announceForAccessibility(warning);
  }, [warning]);

  return warning;
}
