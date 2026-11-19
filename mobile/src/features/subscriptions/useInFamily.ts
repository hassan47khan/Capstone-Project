/**
 * Whether the user is in a family, for the Private toggle (#184).
 *
 * The same request and key as the Family tab (GET /family), so it's usually
 * cached already. 200 means in a family; 404 `no_family`, any other error, or
 * still loading all mean "don't offer it": a private flag only matters to a
 * family, and the form must never wait on this.
 */
import { useQuery } from '@tanstack/react-query';

import { familyKeys, getFamily } from '@/features/family/api';

export function useInFamily(): boolean {
  const family = useQuery({ queryKey: familyKeys.dashboard(), queryFn: getFamily });
  return family.data !== undefined;
}
