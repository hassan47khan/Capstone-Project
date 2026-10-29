/**
 * Mark as cancelled (07 §7, §9) from the real Detail screen, against the mock API.
 */
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { act, fireEvent, screen, waitFor } from '@testing-library/react-native';
import { http, HttpResponse } from 'msw';

import { queryKeys } from '@/api/queryKeys';
import { SessionProvider } from '@/session/SessionContext';
import { tokenStore } from '@/session/tokenStore';
import { MOCK_EMAILS } from '@/test/fixtures';
import { createTestQueryClient, renderWithProviders } from '@/test/render';
import { server } from '@/test/server';
import {
  cancelMockSubscription,
  deleteMockSubscription,
} from '@/test/subscriptionFixtures';

import type { SubscriptionDetail } from './api';
import { CANCEL_COPY } from './CancelSubscriptionSheet';
import { DETAIL_COPY, SubscriptionDetailScreen } from './SubscriptionDetailScreen';

jest.mock('./today', () => ({
  localToday: () => '2026-10-23',
  utcToday: () => '2026-10-23',
}));

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const Stack = createNativeStackNavigator<any>();

async function renderDetail(id: string) {
  const queryClient = createTestQueryClient();
  await tokenStore.setRefreshToken(`mock-refresh-${MOCK_EMAILS.full}`);
  await renderWithProviders(
    <SessionProvider>
      <NavigationContainer>
        <Stack.Navigator screenOptions={{ headerShown: false }}>
          <Stack.Screen
            name="SubscriptionDetail"
            component={SubscriptionDetailScreen}
            initialParams={{ id }}
          />
        </Stack.Navigator>
      </NavigationContainer>
    </SessionProvider>,
    { queryClient, reduceMotion: true },
  );
  await screen.findByTestId('detail-cancel');
  return queryClient;
}

const row = (testID: string) => screen.getByTestId(testID).props.accessibilityLabel;
const sheetOpen = () => screen.queryByTestId('cancel-sheet') !== null;

async function openSheet() {
  await fireEvent.press(screen.getByTestId('detail-cancel'));
  await screen.findByTestId('cancel-sheet');
}

beforeEach(async () => {
  await tokenStore.clear();
});

describe('Mark as cancelled (07 §7)', () => {
  it('is the inline secondary button under Edit', async () => {
    await renderDetail('sub-netflix');

    const button = screen.getByTestId('detail-cancel');
    expect(button).toHaveTextContent(DETAIL_COPY.markCancelled);
    expect(button).toBeEnabled();
  });

  it('the sheet states the consequence, word for word', async () => {
    await renderDetail('sub-netflix');
    await openSheet();

    expect(screen.getByText(CANCEL_COPY.title)).toBeOnTheScreen();
    expect(
      screen.getByText(
        'Netflix will stop counting toward your monthly total. Its history stays, and you can reactivate it anytime.',
      ),
    ).toBeOnTheScreen();
  });

  it('us7_cancel_keeps_history_and_leaves_totals', async () => {
    const queryClient = await renderDetail('sub-netflix');
    expect(row('row-next')).toBe('Next renewal, Oct 12, 2026');

    await openSheet();
    await fireEvent.press(screen.getByTestId('cancel-sheet-confirm'));

    // Cancelled: badge, no Mark as cancelled, no next renewal, saved per year shown.
    await waitFor(() =>
      expect(screen.getByTestId('detail-status')).toHaveTextContent('Cancelled'),
    );
    expect(screen.queryByTestId('detail-cancel')).toBeNull();
    expect(screen.queryByTestId('row-next')).toBeNull();
    expect(row('row-saved')).toBe('Saved per year, $185.88');
    await waitFor(() => expect(sheetOpen()).toBe(false));

    // Out of totals, and the history is all still there plus the cancel event.
    const detail = queryClient.getQueryData<SubscriptionDetail>(
      queryKeys.subscriptions.detail('sub-netflix'),
    )!;
    expect(detail.counts_toward_totals).toBe(false);
    expect(detail.history.map((e) => e.event_type)).toEqual([
      'cancelled',
      'price_change',
      'category_change',
      'created',
    ]);
    // The price chart still shows the $15.49 step.
    expect(screen.getByText(/increased to \$15\.49/)).toBeOnTheScreen();
  });

  it('shows Cancelled straight away, without waiting for the refetch', async () => {
    await renderDetail('sub-netflix');
    await openSheet();
    // From here the detail refetch is held until the end of the test.
    let release: () => void = () => {};
    const held = new Promise<void>((resolve) => (release = resolve));
    server.use(
      http.get('*/subscriptions/:id', async () => {
        await held;
        return undefined; // then the normal mock route answers
      }),
    );
    await fireEvent.press(screen.getByTestId('cancel-sheet-confirm'));

    await waitFor(() =>
      expect(screen.getByTestId('detail-status')).toHaveTextContent('Cancelled'),
    );
    expect(screen.queryByTestId('detail-cancel')).toBeNull();

    // Let the held request finish, so nothing is left running after the test.
    await act(async () => release());
  });

  it('saved per year uses the unrounded monthly figure (Headspace: $77.94, not $78.00)', async () => {
    await renderDetail('sub-headspace');
    await openSheet();
    await fireEvent.press(screen.getByTestId('cancel-sheet-confirm'));

    await waitFor(() => expect(row('row-saved')).toBe('Saved per year, $77.94'));
  });

  it('a trial can be cancelled too, with the real saved-per-year (Hulu, $215.88)', async () => {
    await renderDetail('sub-hulu');
    expect(screen.getByTestId('detail-status')).toHaveTextContent('Trial');
    await openSheet();
    await fireEvent.press(screen.getByTestId('cancel-sheet-confirm'));

    await waitFor(() =>
      expect(screen.getByTestId('detail-status')).toHaveTextContent('Cancelled'),
    );
    expect(row('row-saved')).toBe('Saved per year, $215.88');
  });

  it('"Keep it" closes the sheet and sends nothing', async () => {
    let calls = 0;
    server.use(
      http.post('*/subscriptions/:id/cancel', () => {
        calls += 1;
        return undefined;
      }),
    );
    await renderDetail('sub-netflix');
    await openSheet();

    await fireEvent.press(screen.getByTestId('cancel-sheet-keep'));
    await waitFor(() => expect(sheetOpen()).toBe(false));
    expect(calls).toBe(0);
    expect(screen.getByTestId('detail-status')).toHaveTextContent('Active');
  });

  it('a backdrop tap does not close it: it needs an explicit choice', async () => {
    await renderDetail('sub-netflix');
    await openSheet();

    // Hidden from screen readers when it can't close anything, so include hidden ones.
    await fireEvent.press(
      screen.getByTestId('cancel-sheet-backdrop', { includeHiddenElements: true }),
    );
    // A closing sheet stays on screen while it fades, so wait well past the
    // close animation before checking it's still open.
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 1000));
    });
    expect(sheetOpen()).toBe(true);
    // And it's still usable: the explicit choice works.
    await fireEvent.press(screen.getByTestId('cancel-sheet-keep'));
    await waitFor(() => expect(sheetOpen()).toBe(false));
  });

  it('while cancelling: confirm is busy and "Keep it" is disabled', async () => {
    let release: () => void = () => {};
    server.use(
      http.post(
        '*/subscriptions/:id/cancel',
        () => new Promise<undefined>((resolve) => (release = () => resolve(undefined))),
      ),
    );
    await renderDetail('sub-netflix');
    await openSheet();
    await fireEvent.press(screen.getByTestId('cancel-sheet-confirm'));

    await waitFor(() => expect(screen.getByTestId('cancel-sheet-confirm')).toBeBusy());
    expect(screen.getByTestId('cancel-sheet-keep')).toBeDisabled();

    await act(async () => release());
    await waitFor(() => expect(sheetOpen()).toBe(false));
  });

  it('a server error shows in the sheet, keeps it open, and can be retried', async () => {
    let fail = true;
    server.use(
      http.post('*/subscriptions/:id/cancel', () =>
        fail
          ? HttpResponse.json(
              {
                error: { code: 'server_error', message: 'Something broke on our side.' },
              },
              { status: 500 },
            )
          : undefined,
      ),
    );
    await renderDetail('sub-netflix');
    await openSheet();
    await fireEvent.press(screen.getByTestId('cancel-sheet-confirm'));

    expect(await screen.findByTestId('cancel-sheet-error')).toHaveTextContent(
      'Something broke on our side.',
    );
    expect(sheetOpen()).toBe(true);
    expect(screen.getByTestId('detail-status')).toHaveTextContent('Active');

    fail = false;
    await fireEvent.press(screen.getByTestId('cancel-sheet-confirm'));
    await waitFor(() =>
      expect(screen.getByTestId('detail-status')).toHaveTextContent('Cancelled'),
    );
  });

  it('already cancelled elsewhere (409) counts as done and refreshes', async () => {
    await renderDetail('sub-netflix');
    // Another device cancels it while this screen still shows "Active".
    cancelMockSubscription(MOCK_EMAILS.full, 'sub-netflix');

    await openSheet();
    await fireEvent.press(screen.getByTestId('cancel-sheet-confirm'));

    await waitFor(() =>
      expect(screen.getByTestId('detail-status')).toHaveTextContent('Cancelled'),
    );
    await waitFor(() => expect(sheetOpen()).toBe(false));
    expect(screen.queryByTestId('cancel-sheet-error')).toBeNull();
  });

  it('deleted on another device (404): closes, and Detail says Not found', async () => {
    await renderDetail('sub-netflix');
    deleteMockSubscription(MOCK_EMAILS.full, 'sub-netflix');

    await openSheet();
    await fireEvent.press(screen.getByTestId('cancel-sheet-confirm'));

    expect(await screen.findByText('Not found')).toBeOnTheScreen();
    expect(screen.queryByTestId('cancel-sheet-error')).toBeNull();
  });

  it('offline: disabled, with the reason', async () => {
    const queryClient = await renderDetail('sub-netflix');
    server.use(http.get('*/subscriptions/:id', () => HttpResponse.error()));
    await act(async () => {
      await queryClient.refetchQueries({ queryKey: queryKeys.subscriptions.all });
    });

    await screen.findByTestId('detail-stale');
    expect(screen.getByTestId('detail-cancel')).toBeDisabled();
    expect(screen.getByTestId('detail-edit')).toBeDisabled();
    expect(screen.getByText(DETAIL_COPY.offline)).toBeOnTheScreen();
  });
});
