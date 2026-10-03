/**
 * Test render helpers.
 *
 * What this is for
 *   Rendering a component inside the providers it needs, and a couple of small
 *   utilities that every component test would otherwise reimplement.
 *
 * Two things about React Native Testing Library v14 that catch people out
 *   1. `render` is ASYNC. It returns a Promise and must be awaited. Forgetting
 *      the await does not throw — it leaves `screen` unpopulated, and the next
 *      query fails with "`render` function has not been called", which points
 *      nowhere near the real mistake.
 *   2. `toHaveAccessibilityState` was removed. Use the semantic matchers
 *      instead: `toBeDisabled()`, `toBeBusy()`, `toBeChecked()`,
 *      `toBeSelected()`, `toBeExpanded()`.
 */
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render as rntlRender } from '@testing-library/react-native';
import type { ReactElement, ReactNode } from 'react';
import { SafeAreaProvider } from 'react-native-safe-area-context';

/**
 * A query client with retries off.
 *
 * Retries in a test mean a failing request is attempted several times with
 * backoff, so an assertion about an error state waits seconds and may time out.
 * A fresh client per test also stops one test's cached data reaching the next.
 */
export function createTestQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: { retry: false, gcTime: 0, staleTime: 0 },
      mutations: { retry: false },
    },
  });
}

/**
 * Fixed safe-area insets.
 *
 * `SafeAreaProvider` normally measures the real device. In a test there is
 * nothing to measure, so it reports zero and children that wait for a
 * measurement never render. Supplying initial metrics makes the result
 * deterministic and non-zero, so inset-dependent layout is exercised.
 */
const SAFE_AREA_METRICS = {
  frame: { x: 0, y: 0, width: 390, height: 844 },
  insets: { top: 47, left: 0, right: 0, bottom: 34 },
};

interface WrapperProps {
  children: ReactNode;
  queryClient: QueryClient;
}

function Providers({ children, queryClient }: WrapperProps) {
  return (
    <SafeAreaProvider initialMetrics={SAFE_AREA_METRICS}>
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    </SafeAreaProvider>
  );
}

/**
 * Renders a component inside the app's providers.
 *
 * Remember to `await` it.
 *
 * @returns the RNTL result plus the `queryClient`, so a test can inspect or
 *   seed the cache.
 */
export async function renderWithProviders(
  ui: ReactElement,
  options: { queryClient?: QueryClient } = {},
) {
  const queryClient = options.queryClient ?? createTestQueryClient();

  const result = await rntlRender(ui, {
    wrapper: ({ children }) => (
      <Providers queryClient={queryClient}>{children}</Providers>
    ),
  });

  return { ...result, queryClient };
}

/**
 * Flattens a React Native `style` prop into one plain object.
 *
 * Styles arrive as nested arrays with `false`/`undefined` holes where a
 * conditional branch did not apply, and `Pressable`'s style is a FUNCTION of
 * the press state. This resolves all of that so a test can assert on a single
 * object.
 *
 * @param style   the raw `props.style` value
 * @param pressed what to pass a function style; defaults to not-pressed
 */
export function flattenStyle(
  style: unknown,
  pressed = false,
): Record<string, string | number | undefined> {
  const flat: Record<string, string | number | undefined> = {};

  const visit = (value: unknown) => {
    if (Array.isArray(value)) {
      value.forEach(visit);
    } else if (value && typeof value === 'object') {
      Object.assign(flat, value);
    }
  };

  visit(
    typeof style === 'function'
      ? (style as (state: { pressed: boolean }) => unknown)({ pressed })
      : style,
  );

  return flat;
}

/**
 * The effective tappable height a style declares.
 *
 * Used by the 44pt accessibility assertions. Returns the larger of `height` and
 * `minHeight`, because either can satisfy the minimum on its own.
 *
 * What this does NOT prove: that the element is 44pt as laid out. React Test
 * Renderer has no layout engine. It proves the style asks for at least 44,
 * which is the realistic regression — somebody lowering the number.
 */
export function declaredTouchHeight(style: unknown): number {
  const flat = flattenStyle(style);
  const height = typeof flat.height === 'number' ? flat.height : 0;
  const minHeight = typeof flat.minHeight === 'number' ? flat.minHeight : 0;
  return Math.max(height, minHeight);
}
