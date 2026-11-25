/**
 * Clear Cache's size and clearing (09 §6), see cache.ts.
 */
import { QueryClient, QueryObserver } from '@tanstack/react-query';

import { cacheBytes, clearCache, formatBytes, utf8Bytes } from './cache';

/** Lets timers and promises run until `done` holds, or fails after 50 turns. */
async function until(done: () => boolean) {
  for (let turn = 0; turn < 50 && !done(); turn += 1) {
    await new Promise((resolve) => setTimeout(resolve, 0));
  }
  expect(done()).toBe(true);
}

// No garbage collection, so an unused query stays until something removes it,
// as it would for the app's five minutes.
function client() {
  return new QueryClient({
    defaultOptions: {
      queries: { gcTime: Infinity, retry: false, staleTime: 0 },
      // A mutation's default five-minute timer would hold Jest open.
      mutations: { gcTime: 0 },
    },
  });
}

describe('utf8Bytes', () => {
  it.each([
    ['', 0],
    ['abc', 3],
    ['é', 2], // U+00E9
    ['€', 3], // U+20AC
    ['¥10', 4],
    ['😀', 4], // a surrogate pair is one 4-byte character
    ['a😀b', 6],
    ['\ud83d', 3], // a lone high surrogate at the end
  ])('%j is %i bytes', (text, bytes) => {
    expect(utf8Bytes(text)).toBe(bytes);
  });

  it('matches Buffer for mixed text', () => {
    const text = 'Netflix rose $1.50 on Oct 1 — €18.00 a year. 😀 ñ';
    expect(utf8Bytes(text)).toBe(Buffer.byteLength(text, 'utf8'));
  });
});

describe('formatBytes', () => {
  it.each([
    [0, '0 KB'],
    [-5, '0 KB'],
    [1, '1 KB'], // something, however small, isn't "0 KB"
    [511, '1 KB'],
    [1024, '1 KB'],
    [1535, '1 KB'],
    [1536, '2 KB'],
    [24 * 1024, '24 KB'],
    [999 * 1024, '999 KB'],
    [999.4 * 1024, '999 KB'],
    [999.5 * 1024, '1.0 MB'], // never "1000 KB"
    [1024 * 1024, '1.0 MB'],
    [12.4 * 1024 * 1024, '12.4 MB'],
  ])('%d bytes is "%s"', (bytes, shown) => {
    expect(formatBytes(bytes)).toBe(shown);
  });
});

describe('cacheBytes', () => {
  it('is 0 for an empty cache', () => {
    expect(cacheBytes(client())).toBe(0);
  });

  it('adds up every cached response as JSON', () => {
    const qc = client();
    qc.setQueryData(['a'], { name: 'Alex Kim' });
    qc.setQueryData(['b'], [1, 2, 3]);
    expect(cacheBytes(qc)).toBe(
      JSON.stringify({ name: 'Alex Kim' }).length + JSON.stringify([1, 2, 3]).length,
    );
  });

  it('counts UTF-8 bytes, not characters', () => {
    const qc = client();
    qc.setQueryData(['a'], '€');
    // "\"€\"": two quotes and a 3-byte euro sign.
    expect(cacheBytes(qc)).toBe(5);
  });

  it('skips a query that has no data yet', async () => {
    const qc = client();
    void qc.prefetchQuery({
      queryKey: ['pending'],
      queryFn: () => new Promise(() => {}),
    });
    qc.setQueryData(['a'], 1);
    expect(qc.getQueryCache().getAll()).toHaveLength(2);
    expect(cacheBytes(qc)).toBe(1);
  });

  it("doesn't throw on data that isn't JSON", () => {
    const qc = client();
    const loop: Record<string, unknown> = {};
    loop.self = loop;
    qc.setQueryData(['loop'], loop);
    qc.setQueryData(['a'], 1);
    expect(cacheBytes(qc)).toBe(1);
  });
});

describe('clearCache', () => {
  it('drops what no screen uses and refetches what one does', async () => {
    const qc = client();
    qc.setQueryData(['unused'], { big: 'x'.repeat(100) });

    let fetches = 0;
    const queryFn = async () => {
      fetches += 1;
      return { fresh: fetches };
    };
    await qc.prefetchQuery({ queryKey: ['on-screen'], queryFn });
    // An observer is what makes a query "active", as a mounted screen's
    // useQuery does. Fresh forever, so subscribing doesn't refetch by itself.
    const unsubscribe = new QueryObserver(qc, {
      queryKey: ['on-screen'],
      queryFn,
      staleTime: Infinity,
    }).subscribe(() => {});
    expect(fetches).toBe(1);

    clearCache(qc);

    expect(qc.getQueryData(['unused'])).toBeUndefined();
    // Still there while the fresh copy loads: nothing goes blank.
    expect(qc.getQueryData(['on-screen'])).toEqual({ fresh: 1 });
    await until(() => fetches === 2 && qc.isFetching() === 0);
    expect(qc.getQueryData(['on-screen'])).toEqual({ fresh: 2 });

    unsubscribe();
  });

  it('leaves mutations alone', () => {
    const qc = client();
    qc.getMutationCache().build(qc, { mutationFn: async () => 1 });
    clearCache(qc);
    expect(qc.getMutationCache().getAll()).toHaveLength(1);
  });
});
