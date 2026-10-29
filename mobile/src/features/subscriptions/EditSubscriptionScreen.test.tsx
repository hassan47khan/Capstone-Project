/**
 * Edit subscription (07 §5, §9) on top of the real Detail screen, against the mock API.
 */
import { NavigationContainer, useRoute } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { act, fireEvent, screen, waitFor } from '@testing-library/react-native';
import { http, HttpResponse } from 'msw';
import { PixelRatio, Text } from 'react-native';

import { SessionProvider } from '@/session/SessionContext';
import { lightColors, sizes } from '@/theme';
import { tokenStore } from '@/session/tokenStore';
import { MOCK_EMAILS } from '@/test/fixtures';
import { createTestQueryClient, renderWithProviders } from '@/test/render';
import { server } from '@/test/server';
import {
  subscriptionDetailFor,
  updateMockSubscription,
} from '@/test/subscriptionFixtures';

import { EDIT_COPY, EditSubscriptionScreen } from './EditSubscriptionScreen';
import { SubscriptionDetailScreen } from './SubscriptionDetailScreen';

// Fixed dates, so the chart's 12-month window and the start-date rule are stable.
jest.mock('./today', () => ({
  localToday: () => '2026-10-23',
  utcToday: () => '2026-10-23',
}));

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const Stack = createNativeStackNavigator<any>();

function Stub() {
  const route = useRoute();
  return (
    <Text testID="stub">
      {route.name} {JSON.stringify(route.params ?? {})}
    </Text>
  );
}

// Start on Netflix's real Detail screen and open Edit from it.
async function renderFromDetail(queryClient = createTestQueryClient()) {
  await tokenStore.setRefreshToken(`mock-refresh-${MOCK_EMAILS.full}`);
  await renderWithProviders(
    <SessionProvider>
      <NavigationContainer>
        <Stack.Navigator screenOptions={{ headerShown: false }}>
          <Stack.Screen
            name="SubscriptionDetail"
            component={SubscriptionDetailScreen}
            initialParams={{ id: 'sub-netflix' }}
          />
          <Stack.Screen name="EditSubscription" component={EditSubscriptionScreen} />
          <Stack.Screen name="EditHistory" component={Stub} />
        </Stack.Navigator>
      </NavigationContainer>
    </SessionProvider>,
    { queryClient, reduceMotion: true },
  );
  await fireEvent.press(await screen.findByTestId('detail-edit'));
  await screen.findByTestId('form-name');
}

// The accessible label of a Detail row, e.g. "Current price, $15.49".
const row = (testID: string) => screen.getByTestId(testID).props.accessibilityLabel;

beforeEach(async () => {
  await tokenStore.clear();
});

describe('opening (07 §5)', () => {
  it('is prefilled, with Save changes disabled until something changes', async () => {
    await renderFromDetail();

    expect(screen.getByText(EDIT_COPY.title)).toBeOnTheScreen();
    expect(screen.getByTestId('form-name').props.value).toBe('Netflix');
    expect(screen.getByTestId('form-price').props.value).toBe('15.49');
    expect(screen.getByTestId('edit-save')).toBeDisabled();
    // Cancel is a normal button, never shown as disabled (07 §5).
    expect(screen.getByTestId('edit-cancel')).toBeEnabled();
  });

  it('enables Save changes once a field changes', async () => {
    await renderFromDetail();

    await fireEvent.changeText(screen.getByTestId('form-notes'), 'Family plan');
    expect(screen.getByTestId('edit-save')).toBeEnabled();
  });

  it('the History link opens Edit history for this subscription', async () => {
    await renderFromDetail();

    // Touch area: the 16pt icon plus the slop on each side reaches 44pt.
    const link = screen.getByTestId('form-history');
    expect(link.props.hitSlop * 2 + sizes.iconSmall).toBeGreaterThanOrEqual(
      sizes.minTouch,
    );
    expect(link).toHaveProp('accessibilityRole', 'link');

    await fireEvent.press(link);
    expect(await screen.findByTestId('stub')).toHaveTextContent(
      'EditHistory {"id":"sub-netflix"}',
    );
  });
});

describe('saving', () => {
  it('us7_edit_price_returns_to_detail_with_the_new_price_and_history', async () => {
    await renderFromDetail();

    await fireEvent.changeText(screen.getByTestId('form-price'), '16.99');
    await fireEvent.press(screen.getByTestId('edit-save'));

    // Back on Detail, which refetches: new price, and the chart's new step.
    await waitFor(() => expect(row('row-price')).toBe('Current price, $16.99'));
    expect(screen.getByTestId('price-chart-summary')).toHaveTextContent(
      'Price history for the last 12 months: $13.99, increased to $15.49 on October 1, 2026, then increased to $16.99 on October 1, 2026.',
    );
  });

  it('a 400 for a field the form has no slot for still shows a message', async () => {
    server.use(
      http.patch(
        '*/subscriptions/:id',
        () =>
          HttpResponse.json(
            {
              error: {
                code: 'validation_error',
                message: 'That change is not allowed.',
                fields: { non_field_errors: ['That change is not allowed.'] },
              },
            },
            { status: 400 },
          ),
        { once: true },
      ),
    );
    await renderFromDetail();
    await fireEvent.changeText(screen.getByTestId('form-notes'), 'x');

    await fireEvent.press(screen.getByTestId('edit-save'));

    expect(await screen.findByTestId('edit-form-error')).toHaveTextContent(
      'That change is not allowed.',
    );
  });

  it("can't be closed while saving", async () => {
    let release: () => void = () => {};
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    server.use(
      http.patch('*/subscriptions/:id', async () => {
        await gate;
        return undefined; // then the normal mock route answers
      }),
    );
    await renderFromDetail();
    await fireEvent.changeText(screen.getByTestId('form-notes'), 'x');
    await fireEvent.press(screen.getByTestId('edit-save'));
    await waitFor(() => expect(screen.getByTestId('edit-save')).toBeBusy());

    // Cancel is disabled mid-save, and the X does nothing (no "Discard?").
    expect(screen.getByTestId('edit-cancel')).toBeDisabled();
    await fireEvent.press(screen.getByLabelText('Close'));
    expect(screen.queryByText('Discard changes?')).toBeNull();
    expect(screen.getByTestId('edit-screen')).toBeOnTheScreen();

    await act(async () => release());
    await waitFor(() => expect(screen.queryByTestId('edit-screen')).toBeNull());
  });

  it('a changed but invalid form says what to fix', async () => {
    await renderFromDetail();

    await fireEvent.changeText(screen.getByTestId('form-price'), '0');
    expect(screen.getByTestId('edit-save')).toBeDisabled();
    expect(screen.getByTestId('edit-save-hint')).toHaveTextContent(
      'To save, check: price.',
    );
  });
});

describe('leaving', () => {
  it('Cancel on an unchanged form goes straight back', async () => {
    await renderFromDetail();

    await fireEvent.press(screen.getByTestId('edit-cancel'));
    await waitFor(() => expect(screen.queryByTestId('edit-screen')).toBeNull());
    expect(screen.queryByText('Discard changes?')).toBeNull();
  });

  it('Cancel with changes asks before discarding', async () => {
    await renderFromDetail();
    await fireEvent.changeText(screen.getByTestId('form-name'), 'Netflix 4K');

    await fireEvent.press(screen.getByTestId('edit-cancel'));
    expect(screen.getByText('Discard changes?')).toBeOnTheScreen();
  });
});

it('a subscription that does not exist says Not found', async () => {
  await tokenStore.setRefreshToken(`mock-refresh-${MOCK_EMAILS.full}`);
  await renderWithProviders(
    <SessionProvider>
      <NavigationContainer>
        <Stack.Navigator screenOptions={{ headerShown: false }}>
          <Stack.Screen
            name="EditSubscription"
            component={EditSubscriptionScreen}
            initialParams={{ id: 'sub-nope' }}
          />
        </Stack.Navigator>
      </NavigationContainer>
    </SessionProvider>,
    { queryClient: createTestQueryClient(), reduceMotion: true },
  );

  expect(await screen.findByText('Not found')).toBeOnTheScreen();
  expect(screen.queryByText(/permission/i)).toBeNull();
});

// Hassan's second review of #129 (2026-10-25).
describe('second review fixes', () => {
  it("saving sends only what changed, so it can't undo a newer price from another device", async () => {
    // Cache like the real app (fresh for 30s), so Edit opens on the cached copy.
    const queryClient = createTestQueryClient();
    queryClient.setDefaultOptions({
      queries: { retry: false, staleTime: 30_000, gcTime: Infinity },
      mutations: { retry: false, gcTime: 0 },
    });
    const bodies: unknown[] = [];
    server.use(
      http.patch('*/subscriptions/:id', async ({ request }) => {
        bodies.push(await request.clone().json());
        return undefined; // the normal mock route answers
      }),
    );
    await renderFromDetail(queryClient);
    expect(screen.getByTestId('form-price').props.value).toBe('15.49');

    // Meanwhile, another device raises the price on the server.
    updateMockSubscription(MOCK_EMAILS.full, 'sub-netflix', { billing_price: '16.99' });

    await fireEvent.changeText(screen.getByTestId('form-notes'), 'Family plan');
    await fireEvent.press(screen.getByTestId('edit-save'));
    await waitFor(() => expect(bodies).toHaveLength(1));

    expect(bodies[0]).toEqual({ notes: 'Family plan' });
    const after = subscriptionDetailFor(MOCK_EMAILS.full, 'sub-netflix')!;
    expect(after.billing_price).toBe('16.99');
    // Only the other device's price change: no made-up 16.99 -> 15.49 event.
    expect(after.history.filter((e) => e.event_type === 'price_change')).toHaveLength(2);
  });

  it('trying Custom (and changing its count) then going back to Monthly is no change', async () => {
    // Default text size, so the cycle shows as five segments (02 §4).
    const fontScale = jest.spyOn(PixelRatio, 'getFontScale').mockReturnValue(1);
    await renderFromDetail();
    await fireEvent.press(screen.getByTestId('form-cycle-custom'));
    await fireEvent.press(
      screen.getByTestId('form-custom-count-increment', { includeHiddenElements: true }),
    );
    expect(screen.getByTestId('edit-save')).toBeEnabled();

    // Back to Monthly: the hidden count isn't sent, so the body is unchanged.
    await fireEvent.press(screen.getByTestId('form-cycle-monthly'));
    expect(screen.getByTestId('edit-save')).toBeDisabled();
    fontScale.mockRestore();
  });

  it('"15.490" for a $15.49 price is not a change', async () => {
    await renderFromDetail();
    await fireEvent.changeText(screen.getByTestId('form-price'), '15.490');
    expect(screen.getByTestId('edit-save')).toBeDisabled();
  });

  it('the History link is muted, and announced as unavailable, while saving', async () => {
    let release: () => void = () => {};
    server.use(
      http.patch(
        '*/subscriptions/:id',
        () => new Promise<undefined>((resolve) => (release = () => resolve(undefined))),
      ),
    );
    await renderFromDetail();
    const link = () => screen.getByTestId('form-history');
    expect(link()).toHaveProp('accessibilityState', { disabled: false });

    await fireEvent.changeText(screen.getByTestId('form-notes'), 'Family plan');
    await fireEvent.press(screen.getByTestId('edit-save'));

    await waitFor(() =>
      expect(link()).toHaveProp('accessibilityState', { disabled: true }),
    );
    expect(screen.getByText('History')).toHaveStyle({ color: lightColors.textMuted });

    await act(async () => release());
    await waitFor(() => expect(screen.queryByTestId('form-name')).toBeNull());
  });
});
