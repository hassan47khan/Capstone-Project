/**
 * MSW handlers — a thin adapter from the shared route table to MSW.
 *
 * What this is for
 *   Letting Jest intercept `fetch` and serve the same mock API the app serves
 *   itself. All the behaviour lives in routes.ts; this file only translates
 *   between MSW's Request/Response objects and the table's plain shapes.
 *
 * Why it is deliberately thin
 *   Every line of logic that lives here is logic the running app does NOT get,
 *   because the app bypasses MSW entirely (see the transport branch in
 *   src/api/client.ts). Keeping this file to translation only is what guarantees
 *   tests and the app agree.
 *
 * Why one wildcard handler instead of one per endpoint
 *   The table already knows how to match a method and path. Registering 25 MSW
 *   handlers would duplicate that matching, and adding an endpoint would mean
 *   editing two files. A single catch-all delegates everything.
 */

import { http, HttpResponse, type HttpHandler, type JsonBodyType } from 'msw';

import { handleMockRequest } from './routes';

/** Strips the origin and the `/api/v1` prefix, leaving `/subscriptions`. */
function toApiPath(url: URL): string {
  return url.pathname.replace(/^.*\/api\/v1/, '') || '/';
}

function toQuery(url: URL): Record<string, string> {
  const query: Record<string, string> = {};
  url.searchParams.forEach((value, key) => {
    query[key] = value;
  });
  return query;
}

function toHeaders(request: Request): Record<string, string> {
  const headers: Record<string, string> = {};
  request.headers.forEach((value, key) => {
    // Lower-cased by the Headers API, which is what routes.ts expects.
    headers[key] = value;
  });
  return headers;
}

/**
 * Reads a JSON body without throwing on an empty one.
 *
 * GET and DELETE arrive with no body at all, and `request.json()` rejects on an
 * empty string rather than returning null.
 */
async function readBody(request: Request): Promise<unknown> {
  if (request.method === 'GET' || request.method === 'HEAD') return null;

  try {
    const text = await request.text();
    return text ? JSON.parse(text) : null;
  } catch {
    return null;
  }
}

/** Translates one intercepted request through the table and back. */
async function serve({ request }: { request: Request }) {
  const url = new URL(request.url);

  const result = handleMockRequest({
    method: request.method,
    path: toApiPath(url),
    query: toQuery(url),
    body: await readBody(request),
    headers: toHeaders(request),
  });

  // 204 must have no body at all; HttpResponse.json(null) would send "null".
  if (result.status === 204) {
    return new HttpResponse(null, { status: 204 });
  }

  // The route table types its bodies as `unknown` because it is transport
  // agnostic. Everything it returns is in fact plain JSON, so this narrows for
  // MSW rather than changing any value.
  return HttpResponse.json(result.body as JsonBodyType, { status: result.status });
}

/**
 * Catch-all handlers, one per method.
 *
 * `*` matches any origin, so tests do not have to know whether the client is
 * pointed at localhost or a LAN IP.
 */
export const handlers: HttpHandler[] = [
  http.get('*', serve),
  http.post('*', serve),
  http.patch('*', serve),
  http.put('*', serve),
  http.delete('*', serve),
];
