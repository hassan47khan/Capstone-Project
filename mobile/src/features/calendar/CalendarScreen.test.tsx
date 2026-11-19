/**
 * Calendar (11 §1) against the /analytics/upcoming mock route, which answers a
 * month with the backend's own seed figures.
 */
import { NavigationContainer, useRoute } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { act, fireEvent, screen, waitFor, within } from '@testing-library/react-native';
import { http, HttpResponse } from 'msw';
import { AccessibilityInfo, Text } from 'react-native';

import { SessionProvider } from '@/session/SessionContext';
import { tokenStore } from '@/session/tokenStore';
import { MOCK_EMAILS } from '@/test/fixtures';
import { createTestQueryClient, renderWithProviders } from '@/test/render';
import { server } from '@/test/server';

import { CALENDAR_COPY, CalendarScreen } from './CalendarScreen';

jest.mock('../subscriptions/today', () => ({
  ...jest.requireActual('../subscriptions/today'),
  localToday: () => '2026-10-01',
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

async function renderCalendar(email: string = MOCK_EMAILS.full) {
  await tokenStore.setRefreshToken(`mock-refresh-${email}`);
  await renderWithProviders(
    <SessionProvider>
      <NavigationContainer>
        <Stack.Navigator screenOptions={{ headerShown: false }}>
          <Stack.Screen name="CalendarMain" component={CalendarScreen} />
          <Stack.Screen name="TrialShield" component={Stub} />
          <Stack.Screen name="SubscriptionDetail" component={Stub} />
        </Stack.Navigator>
      </NavigationContainer>
    </SessionProvider>,
    { queryClient: createTestQueryClient() },
  );
}

const loaded = () => screen.findByTestId('calendar-total');

beforeEach(async () => {
  await tokenStore.clear();
});

describe('a month of bills', () => {
  it('opens on this month with the server total and today ringed', async () => {
    await renderCalendar();

    expect(screen.getByTestId('calendar-title')).toHaveTextContent('October 2026');
    expect(await loaded()).toHaveTextContent('$135.69 due in October');
    expect(screen.queryByTestId('calendar-projected')).toBeNull();
    expect(screen.getByTestId('calendar-grid').props.role).toBe('grid');
  });

  it('announces each day, and says when a day has nothing', async () => {
    await renderCalendar();
    await loaded();

    expect(screen.getByTestId('day-2026-10-12').props.accessibilityLabel).toBe(
      'October 12, 1 charge, Netflix $15.49.',
    );
    expect(screen.getByTestId('day-2026-10-15').props.accessibilityLabel).toBe(
      'October 15, 2 charges, Headspace $12.99, YouTube Premium $13.99.',
    );
    expect(screen.getByTestId('day-2026-10-13').props.accessibilityLabel).toBe(
      'October 13, no charges.',
    );
  });

  it('lists charges by day with the server day totals; trials are listed but not added', async () => {
    await renderCalendar();
    await loaded();

    const day = screen.getByTestId('charges-2026-10-15');
    expect(within(day).getByText('Oct 15')).toBeOnTheScreen();
    expect(within(day).getByText('Headspace')).toBeOnTheScreen();
    expect(within(day).getByText('YouTube Premium')).toBeOnTheScreen();
    expect(within(day).getByLabelText('Oct 15, 2026, $26.98')).toBeOnTheScreen();

    const hulu = screen.getByTestId('charge-sub-hulu-2026-10-03');
    expect(hulu.props.accessibilityLabel).toBe(
      'Hulu $17.99, trial ends, Trial ends, not in the total.',
    );
  });

  it('filters to a tapped day and back', async () => {
    await renderCalendar();
    await loaded();

    await fireEvent.press(screen.getByTestId('day-2026-10-12'));
    expect(screen.getByTestId('charges-2026-10-12')).toBeOnTheScreen();
    expect(screen.queryByTestId('charges-2026-10-15')).toBeNull();
    expect(screen.getByTestId('day-2026-10-12').props.accessibilityState).toEqual({
      selected: true,
    });

    await fireEvent.press(screen.getByTestId('day-2026-10-12'));
    expect(screen.getByTestId('charges-2026-10-15')).toBeOnTheScreen();
  });

  it('says so when the tapped day has nothing', async () => {
    await renderCalendar();
    await loaded();

    await fireEvent.press(screen.getByTestId('day-2026-10-13'));

    expect(screen.getByText(CALENDAR_COPY.emptyDay('Oct 13'))).toBeOnTheScreen();
  });

  it('opens a charge in SubscriptionDetail, and Trial Shield from the header', async () => {
    await renderCalendar();
    await loaded();

    await fireEvent.press(screen.getByTestId('charge-sub-netflix-2026-10-12'));
    expect(await screen.findByTestId('stub')).toHaveTextContent(
      'SubscriptionDetail {"id":"sub-netflix"}',
    );
  });

  it('opens Trial Shield from the header', async () => {
    await renderCalendar();

    await fireEvent.press(screen.getByTestId('calendar-trial-shield'));
    expect(await screen.findByTestId('stub')).toHaveTextContent(/^TrialShield/);
  });

  it('shows more than three charges as three dots and +N', async () => {
    const { upcomingMonthFor } = jest.requireActual('@/test/contractFixtures');
    const october = upcomingMonthFor(MOCK_EMAILS.full, '2026-10-01');
    const crowded = {
      ...october,
      items: [
        ...october.items,
        ...['A', 'B', 'C'].map((name: string) => ({
          ...october.items[5],
          subscription_id: `sub-${name}`,
          name,
        })),
      ],
    };
    server.use(http.get('*/analytics/upcoming', () => HttpResponse.json(crowded)));
    await renderCalendar();
    await loaded();

    expect(
      within(screen.getByTestId('day-2026-10-12')).getByText('+1', {
        includeHiddenElements: true,
      }),
    ).toBeOnTheScreen();
  });
});

describe('other months', () => {
  it('goes back to what was charged, forward to a projection, and Today returns', async () => {
    const announce = jest.spyOn(AccessibilityInfo, 'announceForAccessibility');
    await renderCalendar();
    await loaded();

    await fireEvent.press(screen.getByTestId('calendar-prev'));
    expect(screen.getByTestId('calendar-title')).toHaveTextContent('September 2026');
    expect(announce).toHaveBeenLastCalledWith('September 2026');
    await waitFor(() =>
      expect(screen.getByTestId('calendar-total')).toHaveTextContent(
        '$121.20 charged in September',
      ),
    );

    await fireEvent.press(screen.getByTestId('calendar-next'));
    await fireEvent.press(screen.getByTestId('calendar-next'));
    await waitFor(() =>
      expect(screen.getByTestId('calendar-total')).toHaveTextContent(
        '$164.68 due in November',
      ),
    );
    expect(screen.getByTestId('calendar-projected')).toHaveTextContent(
      CALENDAR_COPY.projected('November'),
    );

    await fireEvent.press(screen.getByTestId('calendar-today'));
    expect(screen.getByTestId('calendar-title')).toHaveTextContent('October 2026');
  });

  it('changes month from the grid accessibility actions', async () => {
    await renderCalendar();
    await loaded();

    await act(async () => {
      screen
        .getByTestId('calendar-swipe')
        .props.onAccessibilityAction({ nativeEvent: { actionName: 'increment' } });
    });
    expect(screen.getByTestId('calendar-title')).toHaveTextContent('November 2026');
  });

  it('says the user was not tracking anything yet before the first subscription', async () => {
    await renderCalendar();
    await loaded();

    for (let i = 0; i < 37; i += 1) {
      await fireEvent.press(screen.getByTestId('calendar-prev'));
    }
    expect(screen.getByTestId('calendar-title')).toHaveTextContent('September 2023');
    expect(await screen.findByText(CALENDAR_COPY.notYet)).toBeOnTheScreen();
    expect(
      screen.getByText(CALENDAR_COPY.notYetMessage('Oct 1, 2023')),
    ).toBeOnTheScreen();
  });

  it('shows an empty month to someone with nothing tracked', async () => {
    await renderCalendar(MOCK_EMAILS.empty);

    expect(
      await screen.findByText(CALENDAR_COPY.emptyMonth('October')),
    ).toBeOnTheScreen();
    expect(screen.getByTestId('calendar-total')).toHaveTextContent(
      '$0.00 due in October',
    );
  });
});

describe('loading and errors', () => {
  it('draws the month before the data arrives, with skeleton rows', async () => {
    await renderCalendar();

    expect(screen.getByTestId('calendar-title')).toHaveTextContent('October 2026');
    expect(screen.getByTestId('calendar-loading')).toBeOnTheScreen();
    expect(screen.getByTestId('day-2026-10-12')).toBeOnTheScreen();
    await loaded();
  });

  it('keeps the grid and offers a retry when the month fails to load', async () => {
    server.use(
      http.get('*/analytics/upcoming', () =>
        HttpResponse.json(
          { error: { code: 'server_error', message: 'Down.' } },
          { status: 500 },
        ),
      ),
    );
    await renderCalendar();

    expect(await screen.findByTestId('calendar-error')).toBeOnTheScreen();
    expect(screen.getByTestId('day-2026-10-12').props.accessibilityLabel).toBe(
      'October 12',
    );
  });

  it('says there is no total when a charge has no exchange rate', async () => {
    const { upcomingMonthFor } = jest.requireActual('@/test/contractFixtures');
    server.use(
      http.get('*/analytics/upcoming', () =>
        HttpResponse.json({
          ...upcomingMonthFor(MOCK_EMAILS.full, '2026-10-01'),
          total: null,
        }),
      ),
    );
    await renderCalendar();

    expect(await loaded()).toHaveTextContent(CALENDAR_COPY.noTotal('October'));
  });
});
