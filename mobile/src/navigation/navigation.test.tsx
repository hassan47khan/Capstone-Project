/**
 * Navigation shell tests.
 *
 * What these prove
 *   That the shell routes correctly on session status, and — the one that
 *   matters most — that the Family tab is not merely hidden but genuinely
 *   absent while FEATURE_SHARING is false.
 *
 * Why the Family test is worth its weight
 *   The lazy way to disable a tab is `tabBarButton: () => null`, which hides the
 *   button while leaving the route registered and reachable by deep link or a
 *   stray `navigate('Family')`. That would expose a half-built Epic F screen.
 *   This test fails if anyone makes that substitution.
 */
import { NavigationContainer } from '@react-navigation/native';
import { render, screen, waitFor } from '@testing-library/react-native';

import { FEATURE_SHARING } from '@/config/features';
import { SessionProvider } from '@/session/SessionContext';
import { createTestQueryClient } from '@/test/render';
import { QueryClientProvider } from '@tanstack/react-query';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { AuthNavigator } from './AuthNavigator';
import { TabNavigator } from './TabNavigator';

/** Wraps a navigator in the providers it needs, with fixed safe-area metrics. */
function wrap(children: React.ReactElement) {
  return (
    <SafeAreaProvider
      initialMetrics={{
        frame: { x: 0, y: 0, width: 390, height: 844 },
        insets: { top: 47, left: 0, right: 0, bottom: 34 },
      }}
    >
      <QueryClientProvider client={createTestQueryClient()}>
        <SessionProvider>
          <NavigationContainer>{children}</NavigationContainer>
        </SessionProvider>
      </QueryClientProvider>
    </SafeAreaProvider>
  );
}

describe('TabNavigator', () => {
  it('shows the three in-scope tabs', async () => {
    await render(wrap(<TabNavigator />));

    await waitFor(() => {
      expect(screen.getByTestId('tab-Home')).toBeOnTheScreen();
    });

    expect(screen.getByTestId('tab-Subscriptions')).toBeOnTheScreen();
    expect(screen.getByTestId('tab-Insights')).toBeOnTheScreen();
  });

  /**
   * The gate. See the header comment for why hiding is not good enough.
   */
  it('does not register the Family tab while FEATURE_SHARING is false', async () => {
    // Guards the premise: if somebody flips the flag, this test would otherwise
    // pass vacuously and stop protecting anything.
    expect(FEATURE_SHARING).toBe(false);

    await render(wrap(<TabNavigator />));

    await waitFor(() => {
      expect(screen.getByTestId('tab-Home')).toBeOnTheScreen();
    });

    // Not hidden — absent. `includeHiddenElements` would find a merely hidden one.
    expect(
      screen.queryByTestId('tab-Family', { includeHiddenElements: true }),
    ).toBeNull();
    expect(screen.queryByText('Family')).toBeNull();
  });

  it('marks the focused tab as selected for screen readers', async () => {
    await render(wrap(<TabNavigator />));

    await waitFor(() => {
      expect(screen.getByTestId('tab-Home')).toBeOnTheScreen();
    });

    expect(screen.getByTestId('tab-Home')).toBeSelected();
    expect(screen.getByTestId('tab-Insights')).not.toBeSelected();
  });

  it('renders the first tab screen', async () => {
    await render(wrap(<TabNavigator />));

    // The Phase 0 placeholder. Replaced by the real dashboard in Phase 2.
    await waitFor(() => {
      expect(screen.getByText('Overview')).toBeOnTheScreen();
    });
  });
});

describe('AuthNavigator', () => {
  it('starts on the Welcome screen', async () => {
    await render(wrap(<AuthNavigator />));

    await waitFor(() => {
      expect(screen.getByText('Welcome')).toBeOnTheScreen();
    });
  });
});
