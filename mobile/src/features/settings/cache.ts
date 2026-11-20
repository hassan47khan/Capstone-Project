/**
 * Profile's "Clear cache" row (09 §6): how much API data the app is holding,
 * and clearing it.
 *
 * The app keeps API responses only in TanStack Query's in-memory cache;
 * nothing is written to disk. So the size is an estimate: the UTF-8 length of
 * each cached response as JSON. That's close to what the server sent, which
 * is what "cache size" means to someone reading the row.
 *
 * Clearing drops every response no screen is using, and refetches the ones on
 * screen (the tabs stay mounted behind this modal, so Home's data is "on
 * screen"). Nothing goes blank: an open screen keeps its data until the fresh
 * copy arrives. Mutations, including any still in flight, are left alone.
 */
import { useQueryClient, type QueryClient } from '@tanstack/react-query';
import { useCallback, useSyncExternalStore } from 'react';

/** The UTF-8 size of a string, without TextEncoder. */
export function utf8Bytes(text: string): number {
  let bytes = 0;
  for (let i = 0; i < text.length; i += 1) {
    const code = text.charCodeAt(i);
    if (code < 0x80) {
      bytes += 1;
    } else if (code < 0x800) {
      bytes += 2;
    } else if (code >= 0xd800 && code <= 0xdbff && i + 1 < text.length) {
      // A surrogate pair is one 4-byte character.
      bytes += 4;
      i += 1;
    } else {
      bytes += 3;
    }
  }
  return bytes;
}

/** The estimated size of every cached response. */
export function cacheBytes(queryClient: QueryClient): number {
  let total = 0;
  for (const query of queryClient.getQueryCache().getAll()) {
    const data: unknown = query.state.data;
    if (data === undefined) continue;
    try {
      total += utf8Bytes(JSON.stringify(data) ?? '');
    } catch {
      // Not JSON (a cycle, a BigInt): it didn't come from the API as text,
      // so it has no wire size to count.
    }
  }
  return total;
}

const KB = 1024;
const MB = KB * 1024;

/** "0 KB", "1 KB" (anything under 1 KB that isn't empty), "24 KB", "1.2 MB". */
export function formatBytes(bytes: number): string {
  if (bytes <= 0) return '0 KB';
  const kb = bytes / KB;
  // 999.5 KB and up would round to "1000 KB"; say it in MB instead.
  if (kb < 999.5) return `${Math.max(1, Math.round(kb))} KB`;
  return `${(bytes / MB).toFixed(1)} MB`;
}

/** Drops unused responses and refetches the ones on screen. */
export function clearCache(queryClient: QueryClient): void {
  queryClient.removeQueries({ type: 'inactive' });
  // Doesn't throw: a failed refetch leaves that screen on its current data.
  void queryClient.invalidateQueries({ type: 'active' });
}

/** The cache size, kept current while the row is on screen. */
export function useCacheBytes(): number {
  const queryClient = useQueryClient();
  const subscribe = useCallback(
    (onChange: () => void) =>
      // 'updated' covers new data and resets; 'removed' covers clearing and
      // garbage collection. Observer events don't change any data.
      queryClient.getQueryCache().subscribe((event) => {
        if (event.type === 'updated' || event.type === 'removed') onChange();
      }),
    [queryClient],
  );
  // A number, so an unchanged cache gives the same snapshot every time.
  return useSyncExternalStore(subscribe, () => cacheBytes(queryClient));
}
