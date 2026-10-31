/**
 * Delete and Undo (07 §4, §7, §9) from the real Detail screen, against the mock
 * API. The mock follows the real server's delete and restore (checked on
 * 2026-10-28): DELETE is a 204, the subscription leaves every list, and restore
 * brings it back with the status it had.
 */
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { act, fireEvent, screen, waitFor } from '@testing-library/react-native';
import { http, HttpResponse } from 'msw';
import { Button, Text } from 'react-native';

import { queryKeys } from '@/api/queryKeys';
import { SessionProvider } from '@/session/SessionContext';
import { tokenStore } from '@/session/tokenStore';
import { MOCK_EMAILS } from '@/test/fixtures';
import { createTestQueryClient, renderWithProviders } from '@/test/render';
import { server } from '@/test/server';
import {
  cancelMockSubscription,
  deleteMockSubscription,
  subscriptionDetailFor,
  subscriptionListFor,
} from '@/test/subscriptionFixtures';

import { DELETE_COPY } from './DeleteSubscriptionSheet';
import { DETAIL_COPY, SubscriptionDetailScreen } from './SubscriptionDetailScreen';

jest.mock('./today', () => ({
  localToday: () => '2026-10-23',
  utcToday: () => '2026-10-23',
}));

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const Stack = createNativeStackNavigator<any>();
const ALEX = MOCK_EMAILS.full;

// The screen Detail was opened from.
function List({
  navigation,
}: {
  navigation: { navigate: (n: string, p: object) => void };
}) {
  return (
    <>
      <Text testID="list">Subscriptions</Text>
      <Button
        title="Open Netflix"
        onPress={() => navigation.navigate('SubscriptionDetail', { id: 'sub-netflix' })}
      />
    </>
  );
}

async function renderFromList() {
  const queryClient = createTestQueryClient();
  await tokenStore.setRefreshToken(`mock-refresh-${ALEX}`);
  await renderWithProviders(
    <SessionProvider>
      <NavigationContainer>
        <Stack.Navigator screenOptions={{ headerShown: false }}>
          <Stack.Screen name="List" component={List} />
          <Stack.Screen name="SubscriptionDetail" component={SubscriptionDetailScreen} />
        </Stack.Navigator>
      </NavigationContainer>
    </SessionProvider>,
    { queryClient, reduceMotion: true },
  );
  await fireEvent.press(screen.getByText('Open Netflix'));
  await screen.findByTestId('detail-more');
  return queryClient;
}

const listed = () => subscriptionListFor(ALEX, {}).results.map((s) => s.id);

async function openConfirm() {
  await fireEvent.press(screen.getByTestId('detail-more'));
  await fireEvent.press(await screen.findByTestId('detail-menu-delete'));
  await screen.findByTestId('delete-sheet');
}

async function deleteNetflix() {
  await openConfirm();
  await fireEvent.press(screen.getByTestId('delete-sheet-confirm'));
  await screen.findByTestId('list');
}

beforeEach(async () => {
  await tokenStore.clear();
});

describe('Delete (07 §4, §7)', () => {
  it('lives in the ⋯ menu in the header, not next to Edit', async () => {
    await renderFromList();

    expect(screen.getByLabelText(DETAIL_COPY.more)).toBeOnTheScreen();
    expect(screen.queryByText(DELETE_COPY.menuDelete)).toBeNull();

    await fireEvent.press(screen.getByTestId('detail-more'));
    expect(await screen.findByTestId('detail-menu-delete')).toHaveTextContent(
      DELETE_COPY.menuDelete,
    );
  });

  it('the confirm is red, states the consequence, and names the price', async () => {
    await renderFromList();
    await openConfirm();

    expect(screen.getByText(DELETE_COPY.title)).toBeOnTheScreen();
    expect(
      screen.getByTestId('delete-sheet-alert', { includeHiddenElements: true }),
    ).toBeTruthy();
    expect(screen.getByTestId('delete-sheet-body')).toHaveTextContent(
      'Netflix ($15.49/mo) will be removed from your subscriptions and totals. Its history is kept.',
    );
  });

  it('us7_delete_is_soft_returns_to_the_list_and_offers_undo', async () => {
    await renderFromList();
    expect(listed()).toContain('sub-netflix');

    await deleteNetflix();

    // Back where Detail was opened from, with the Undo toast.
    expect(screen.getByTestId('list')).toBeOnTheScreen();
    expect(screen.getByTestId('toast')).toHaveTextContent(
      `${DELETE_COPY.deleted}${DELETE_COPY.undo}`,
    );
    expect(screen.getByLabelText('Undo deleting Netflix')).toBeOnTheScreen();
    // Gone from every list, but kept (Undo can bring it back).
    expect(listed()).not.toContain('sub-netflix');
  });

  it("refreshes lists and totals, but not the deleted one's own detail (it would 404)", async () => {
    const queryClient = await renderFromList();
    const invalidate = jest.spyOn(queryClient, 'invalidateQueries');
    let detailFetches = 0;
    server.use(
      http.get('*/subscriptions/sub-netflix', () => {
        detailFetches += 1;
        return undefined;
      }),
    );

    await deleteNetflix();

    expect(invalidate).toHaveBeenCalledWith(
      expect.objectContaining({ queryKey: queryKeys.subscriptions.all }),
    );
    expect(invalidate).toHaveBeenCalledWith(
      expect.objectContaining({ queryKey: queryKeys.dashboard.all }),
    );
    expect(detailFetches).toBe(0);
  });

  it('Undo brings it back, refreshes lists and totals, and says so', async () => {
    const queryClient = await renderFromList();
    // The app keeps unwatched data for TanStack's default 5 minutes (the test
    // client keeps it for 0), so the restored detail must outlive Detail.
    queryClient.setQueryDefaults(queryKeys.subscriptions.all, { gcTime: 5 * 60_000 });
    await deleteNetflix();
    const invalidate = jest.spyOn(queryClient, 'invalidateQueries');

    await fireEvent.press(screen.getByLabelText('Undo deleting Netflix'));

    expect(await screen.findByText(DELETE_COPY.restored)).toBeOnTheScreen();
    expect(listed()).toContain('sub-netflix');
    expect(subscriptionDetailFor(ALEX, 'sub-netflix')?.status).toBe('active');
    expect(invalidate).toHaveBeenCalledWith(
      expect.objectContaining({ queryKey: queryKeys.subscriptions.all }),
    );
    // Opening it again shows it straight away, from the restore's answer.
    expect(
      queryClient.getQueryData(queryKeys.subscriptions.detail('sub-netflix')),
    ).toMatchObject({ id: 'sub-netflix', status: 'active' });
    queryClient.clear(); // no 5-minute timer left behind
  });

  it('Undo on a cancelled subscription brings it back cancelled (like the real server)', async () => {
    await renderFromList();
    cancelMockSubscription(ALEX, 'sub-netflix');
    await deleteNetflix();

    await fireEvent.press(screen.getByLabelText('Undo deleting Netflix'));

    expect(await screen.findByText(DELETE_COPY.restored)).toBeOnTheScreen();
    expect(subscriptionDetailFor(ALEX, 'sub-netflix')?.status).toBe('cancelled');
  });

  it('a failed Undo offers to try again, and trying again works', async () => {
    let fail = true;
    server.use(
      http.post('*/subscriptions/:id/restore', () =>
        fail
          ? HttpResponse.json(
              { error: { code: 'server_error', message: 'Down.' } },
              { status: 503 },
            )
          : undefined,
      ),
    );
    await renderFromList();
    await deleteNetflix();

    await fireEvent.press(screen.getByLabelText('Undo deleting Netflix'));
    expect(await screen.findByText(DELETE_COPY.undoFailed)).toBeOnTheScreen();
    expect(listed()).not.toContain('sub-netflix');

    fail = false;
    await fireEvent.press(screen.getByText(DELETE_COPY.retry));
    expect(await screen.findByText(DELETE_COPY.restored)).toBeOnTheScreen();
    expect(listed()).toContain('sub-netflix');
  });

  it('the Undo toast stays up longer than a normal toast (6s, not 3s)', async () => {
    await renderFromList();
    await deleteNetflix();

    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 3500));
    });

    expect(screen.getByLabelText('Undo deleting Netflix')).toBeOnTheScreen();
  });

  it('Cancel keeps it, sends nothing, and the menu starts over next time', async () => {
    let deletes = 0;
    server.use(
      http.delete('*/subscriptions/:id', () => {
        deletes += 1;
        return undefined;
      }),
    );
    await renderFromList();
    await openConfirm();

    await fireEvent.press(screen.getByTestId('delete-sheet-keep'));
    await waitFor(() => expect(screen.queryByTestId('delete-sheet')).toBeNull());
    expect(deletes).toBe(0);
    expect(listed()).toContain('sub-netflix');

    await fireEvent.press(screen.getByTestId('detail-more'));
    expect(await screen.findByTestId('detail-menu-delete')).toBeOnTheScreen();
    expect(screen.queryByTestId('delete-sheet')).toBeNull();
  });

  it('a backdrop tap does not close the confirm: it needs an explicit choice', async () => {
    await renderFromList();
    await openConfirm();

    await fireEvent.press(
      screen.getByTestId('delete-sheet-backdrop', { includeHiddenElements: true }),
    );
    // Wait well past the close animation before checking it's still open.
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 1000));
    });

    expect(screen.getByTestId('delete-sheet')).toBeOnTheScreen();
  });

  it('while deleting: Delete is busy and Cancel is disabled', async () => {
    let release: () => void = () => {};
    server.use(
      http.delete(
        '*/subscriptions/:id',
        () => new Promise<undefined>((resolve) => (release = () => resolve(undefined))),
      ),
    );
    await renderFromList();
    await openConfirm();
    await fireEvent.press(screen.getByTestId('delete-sheet-confirm'));

    await waitFor(() => expect(screen.getByTestId('delete-sheet-confirm')).toBeBusy());
    expect(screen.getByTestId('delete-sheet-keep')).toBeDisabled();

    await act(async () => release());
    await screen.findByTestId('list');
  });

  it('a server error shows in the sheet, keeps Detail open, and can be retried', async () => {
    let fail = true;
    server.use(
      http.delete('*/subscriptions/:id', () =>
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
    await renderFromList();
    await openConfirm();
    await fireEvent.press(screen.getByTestId('delete-sheet-confirm'));

    expect(await screen.findByTestId('delete-sheet-error')).toHaveTextContent(
      'Something broke on our side.',
    );
    expect(listed()).toContain('sub-netflix');

    fail = false;
    await fireEvent.press(screen.getByTestId('delete-sheet-confirm'));
    await screen.findByTestId('list');
    expect(listed()).not.toContain('sub-netflix');
  });

  it('already deleted on another device (404): closes, and Detail says Not found', async () => {
    await renderFromList();
    deleteMockSubscription(ALEX, 'sub-netflix');

    await openConfirm();
    await fireEvent.press(screen.getByTestId('delete-sheet-confirm'));

    expect(await screen.findByText('Not found')).toBeOnTheScreen();
    expect(screen.queryByTestId('delete-sheet-error')).toBeNull();
    expect(screen.queryByTestId('toast')).toBeNull();
  });

  it('offline: Delete is disabled in the menu, with the reason (07 §9)', async () => {
    const queryClient = await renderFromList();
    server.use(http.get('*/subscriptions/:id', () => HttpResponse.error()));
    await act(async () => {
      await queryClient.refetchQueries({ queryKey: queryKeys.subscriptions.all });
    });
    await screen.findByTestId('detail-stale');

    await fireEvent.press(screen.getByTestId('detail-more'));

    expect(await screen.findByTestId('detail-menu-delete')).toBeDisabled();
    expect(screen.getAllByText(DELETE_COPY.offline).length).toBeGreaterThan(0);
  });
});
