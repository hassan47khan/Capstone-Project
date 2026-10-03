/**
 * The MSW server instance used by Jest.
 *
 * What this is for
 *   A single shared server, started in setup.tsx and reset between tests, so no
 *   test file has to manage the lifecycle itself.
 *
 * How a test overrides one endpoint
 *   `server.use(...)` installs a handler for the current test only; setup.tsx
 *   calls `resetHandlers()` afterwards. That is how an error path is exercised:
 *
 *     import { http, HttpResponse } from 'msw';
 *     import { server } from '@/test/server';
 *
 *     server.use(
 *       http.get('*\/dashboard', () =>
 *         HttpResponse.json({ error: { code: 'server_error', message: '...' } },
 *                           { status: 503 })),
 *     );
 *
 * This file is imported only by test code. It never reaches the app bundle —
 * the running app serves mocks through src/api/client.ts instead.
 */

// `msw/node`, not `msw/native`. MSW v2 shipped a dedicated React Native entry
// point; v3 removed it and serves both from `msw/node`, which works here because
// jest-expo runs on Node and `src/test/polyfills.ts` supplies the web globals
// that entry point expects.
import { setupServer } from 'msw/node';

import { handlers } from './handlers';

export const server = setupServer(...handlers);
