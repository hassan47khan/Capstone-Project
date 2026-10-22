/**
 * A query client for the auth screen tests.
 *
 * TanStack keeps a finished mutation for five minutes by default (gcTime), and
 * that timer holds Jest open after the last test. createTestQueryClient sets
 * gcTime 0 for queries only, so this adds it for mutations. (The shared helper
 * in src/test/render.tsx is the better home for this; until it changes there,
 * the auth tests use this.)
 */
import { createTestQueryClient } from '@/test/render';

export function authTestQueryClient() {
  const client = createTestQueryClient();
  client.setDefaultOptions({
    ...client.getDefaultOptions(),
    mutations: { retry: false, gcTime: 0 },
  });
  return client;
}
