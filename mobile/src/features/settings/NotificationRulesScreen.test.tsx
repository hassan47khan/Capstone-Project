/**
 * Notification Rules (09 §5, §8, §10) against the mock API, which answers
 * like the real /me/notification-rules (see notificationRulesFixtures.ts).
 */
import { NavigationContainer, useNavigation } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import type { QueryClient } from '@tanstack/react-query';
import { act, fireEvent, screen, waitFor, within } from '@testing-library/react-native';
import { http, HttpResponse } from 'msw';
import { Pressable, Text } from 'react-native';

import { SessionProvider } from '@/session/SessionContext';
import { tokenStore } from '@/session/tokenStore';
import { MOCK_EMAILS } from '@/test/fixtures';
import {
  DEFAULT_NOTIFICATION_RULES,
  notificationRulesFor,
  updateMockNotificationRules,
} from '@/test/notificationRulesFixtures';
import { createTestQueryClient, renderWithProviders } from '@/test/render';
import { server } from '@/test/server';

import {
  dateToTime,
  formatDays,
  formatDeliveryDay,
  formatReminderTime,
  NotificationRulesScreen,
  RULES_COPY,
  timeToDate,
} from './NotificationRulesScreen';

const RULES_URL = '*/me/notification-rules';
const ALEX = MOCK_EMAILS.full;
const HIDDEN = { includeHiddenElements: true };

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const Stack = createNativeStackNavigator<any>();

// Settings, as a stub with one way in, so Close has somewhere to go back to.
function SettingsStub() {
  const navigation = useNavigation();
  return (
    <Pressable
      testID="open-rules"
      onPress={() =>
        (navigation.navigate as (route: string) => void)('NotificationRules')
      }
    >
      <Text>Settings</Text>
    </Pressable>
  );
}

// The current test's client, so afterEach can let its saves finish.
let client: QueryClient | undefined;

async function renderRules(queryClient: QueryClient = createTestQueryClient()) {
  client = queryClient;
  await tokenStore.setRefreshToken(`mock-refresh-${ALEX}`);
  await renderWithProviders(
    <SessionProvider>
      <NavigationContainer>
        <Stack.Navigator screenOptions={{ headerShown: false }}>
          <Stack.Screen name="SettingsMain" component={SettingsStub} />
          <Stack.Screen name="NotificationRules" component={NotificationRulesScreen} />
        </Stack.Navigator>
      </NavigationContainer>
    </SessionProvider>,
    { queryClient },
  );
  await fireEvent.press(await screen.findByTestId('open-rules'));
  await screen.findByTestId('notification-rules-screen');
}

/** Loaded, with nothing still fetching, so a tap is the only thing in flight. */
async function renderLoaded(queryClient: QueryClient = createTestQueryClient()) {
  await renderRules(queryClient);
  await screen.findByTestId('rules-days');
  await settle();
}

const switchFor = (name: string) => screen.getByRole('switch', { name });
const isOn = (name: string) => switchFor(name).props.accessibilityState.checked;
const shownDays = (testID: string) =>
  screen.getByTestId(testID).props.accessibilityValue.text;
const rowLabel = (testID: string) => screen.getByTestId(testID).props.accessibilityLabel;

/**
 * Three quick taps on "+": each shows before the next (no finger beats a
 * frame), while their saves overlap.
 */
async function tapMoreThreeTimes() {
  const more = screen.getByTestId('rules-days-increment', HIDDEN);
  for (const days of ['4 days', '5 days', '6 days']) {
    await fireEvent.press(more);
    await waitFor(() => expect(shownDays('rules-days')).toBe(days));
  }
}

/** Every PATCH from here on fails like a dropped connection. */
function failSaves() {
  server.use(http.patch(RULES_URL, () => HttpResponse.error()));
}

beforeEach(async () => {
  await tokenStore.clear();
});

/**
 * Waits until every save and load has finished and the screen has heard
 * about it (the query library tells it on its next tick), so nothing lands
 * after the test.
 */
async function settle() {
  const current = client;
  if (!current) return;
  await waitFor(() => {
    expect(current.isMutating()).toBe(0);
    expect(current.isFetching()).toBe(0);
  });
  await act(() => new Promise((resolve) => setTimeout(resolve, 0)));
}

afterEach(async () => {
  await settle();
  client = undefined;
});

describe('Notification Rules (09 §5)', () => {
  it("shows the server's settings in four groups, as headings", async () => {
    await renderLoaded();

    for (const group of [
      RULES_COPY.billing,
      RULES_COPY.priceChanges,
      RULES_COPY.summaries,
      RULES_COPY.trials,
    ]) {
      expect(screen.getByRole('header', { name: group })).toBeOnTheScreen();
    }
    expect(screen.getByRole('header', { name: RULES_COPY.title })).toBeOnTheScreen();

    // The real server's defaults for a new account.
    expect(shownDays('rules-days')).toBe('3 days');
    expect(rowLabel('rules-time')).toBe('Reminder time, 9:00 AM');
    expect(isOn(RULES_COPY.push)).toBe(true);
    expect(isOn(RULES_COPY.email)).toBe(false);
    expect(isOn(RULES_COPY.anyChange)).toBe(true);
    expect(isOn(RULES_COPY.weekly)).toBe(false);
    expect(isOn(RULES_COPY.monthly)).toBe(false);
    expect(shownDays('rules-trial-days')).toBe('2 days');
  });

  it('shows saved settings, not just the defaults', async () => {
    updateMockNotificationRules(ALEX, {
      days_before_reminder: 7,
      reminder_time: '18:30',
      send_email: true,
      monthly_report_enabled: true,
      report_delivery_day: 22,
      trial_alert_days_before: 1,
    });
    await renderLoaded();

    expect(shownDays('rules-days')).toBe('7 days');
    expect(rowLabel('rules-time')).toBe('Reminder time, 6:30 PM');
    expect(isOn(RULES_COPY.email)).toBe(true);
    expect(rowLabel('rules-delivery-day')).toBe('Report delivery day, 22nd of month');
    expect(shownDays('rules-trial-days')).toBe('1 day');
  });

  it("leaves out what can't be saved yet: the threshold and a trial on/off", async () => {
    await renderLoaded();

    expect(screen.queryByText(/threshold/i)).toBeNull();
    expect(screen.queryByText(/Trial ending alerts/i)).toBeNull();
  });

  it('closes back to Settings', async () => {
    await renderLoaded();

    await fireEvent.press(screen.getByRole('button', { name: 'Close' }));

    expect(await screen.findByTestId('open-rules')).toBeOnTheScreen();
    expect(screen.queryByTestId('notification-rules-screen')).toBeNull();
  });
});

describe('loading and errors (09 §8)', () => {
  it('shows the group headers with placeholder rows while loading', async () => {
    let release = () => {};
    const held = new Promise<void>((resolve) => (release = resolve));
    server.use(http.get(RULES_URL, () => held.then(() => undefined)));
    await renderRules();

    const loading = screen.getByTestId('rules-loading');
    expect(loading.props.accessibilityLabel).toBe(RULES_COPY.loading);
    expect(within(loading).getByText(RULES_COPY.billing)).toBeOnTheScreen();
    expect(within(loading).getByText(RULES_COPY.trials)).toBeOnTheScreen();
    expect(screen.queryByTestId('rules-days')).toBeNull();

    await act(async () => release());
    expect(await screen.findByTestId('rules-days')).toBeOnTheScreen();
  });

  it('shows an error with Try again when loading fails, and Try again loads', async () => {
    let fail = true;
    server.use(
      http.get(RULES_URL, () =>
        fail ? HttpResponse.error() : HttpResponse.json(DEFAULT_NOTIFICATION_RULES),
      ),
    );
    await renderRules();

    expect(await screen.findByTestId('rules-error')).toBeOnTheScreen();
    expect(screen.queryByTestId('rules-days')).toBeNull();
    // The header stays, so the screen can still be closed.
    expect(screen.getByRole('button', { name: 'Close' })).toBeOnTheScreen();

    fail = false;
    await fireEvent.press(screen.getByRole('button', { name: 'Try again' }));

    expect(await screen.findByTestId('rules-days')).toBeOnTheScreen();
  });
});

describe('saving (09 §8: optimistic)', () => {
  it('moves the switch before the server answers, then saves it', async () => {
    await renderLoaded();
    // Hold the PATCH; once released it falls through to the mock's own route.
    let release = () => {};
    const held = new Promise<void>((resolve) => (release = resolve));
    server.use(http.patch(RULES_URL, () => held.then(() => undefined)));

    await fireEvent.press(switchFor(RULES_COPY.email));

    await waitFor(() => expect(isOn(RULES_COPY.email)).toBe(true));
    expect(notificationRulesFor(ALEX).send_email).toBe(false);

    release();
    await settle();
    expect(notificationRulesFor(ALEX).send_email).toBe(true);
    expect(isOn(RULES_COPY.email)).toBe(true);
    // Only that field changed.
    expect(notificationRulesFor(ALEX)).toEqual({
      ...DEFAULT_NOTIFICATION_RULES,
      send_email: true,
    });
  });

  it.each([
    [RULES_COPY.push, 'send_push', false],
    [RULES_COPY.anyChange, 'alert_on_any_price_change', false],
    [RULES_COPY.weekly, 'weekly_summary_enabled', true],
    [RULES_COPY.monthly, 'monthly_report_enabled', true],
  ] as const)('saves "%s"', async (name, field, next) => {
    await renderLoaded();

    await fireEvent.press(switchFor(name));

    await waitFor(() => expect(isOn(name)).toBe(next));
    await settle();
    expect(notificationRulesFor(ALEX)[field]).toBe(next);
  });

  it('saves the days before a reminder with the stepper', async () => {
    await renderLoaded();

    await fireEvent.press(screen.getByTestId('rules-days-increment', HIDDEN));

    await waitFor(() => expect(shownDays('rules-days')).toBe('4 days'));
    await settle();
    expect(notificationRulesFor(ALEX).days_before_reminder).toBe(4);
  });

  it("stops the steppers at the server's maximums: 30 and 14", async () => {
    updateMockNotificationRules(ALEX, {
      days_before_reminder: 30,
      trial_alert_days_before: 14,
    });
    await renderLoaded();

    for (const id of ['rules-days-increment', 'rules-trial-days-increment']) {
      expect(screen.getByTestId(id, HIDDEN).props.accessibilityState.disabled).toBe(true);
    }
    // A screen reader's "increment" can't pass the top either.
    await act(async () => {
      screen.getByTestId('rules-trial-days').props.onAccessibilityAction({
        nativeEvent: { actionName: 'increment' },
      });
    });
    expect(shownDays('rules-trial-days')).toBe('14 days');
    expect(notificationRulesFor(ALEX).trial_alert_days_before).toBe(14);
  });

  it('stops the steppers at 1', async () => {
    updateMockNotificationRules(ALEX, {
      days_before_reminder: 1,
      trial_alert_days_before: 1,
    });
    await renderLoaded();

    for (const id of ['rules-days-decrement', 'rules-trial-days-decrement']) {
      expect(screen.getByTestId(id, HIDDEN).props.accessibilityState.disabled).toBe(true);
    }
    expect(shownDays('rules-days')).toBe('1 day');
  });

  it('saves the reminder time from the picker', async () => {
    await renderLoaded();

    await fireEvent.press(screen.getByTestId('rules-time'));
    const picker = screen.getByTestId('rules-time-picker');
    expect(picker.props.mode).toBe('time');
    // Opens on the saved time.
    expect(dateToTime(picker.props.value)).toBe('09:00:00');

    await act(async () => {
      picker.props.onChange({ type: 'set' }, new Date(2026, 10, 3, 18, 30));
    });

    await waitFor(() => expect(rowLabel('rules-time')).toBe('Reminder time, 6:30 PM'));
    await settle();
    expect(notificationRulesFor(ALEX).reminder_time).toBe('18:30:00');

    // Tapping the row again closes it.
    await fireEvent.press(screen.getByTestId('rules-time'));
    expect(screen.queryByTestId('rules-time-picker')).toBeNull();
  });

  it("doesn't save when the picker is dismissed", async () => {
    await renderLoaded();
    const patches: unknown[] = [];
    server.events.on('request:start', ({ request }) => {
      if (request.method === 'PATCH') patches.push(request.url);
    });

    await fireEvent.press(screen.getByTestId('rules-time'));
    await act(async () => {
      // Android's cancel still hands back a time; it must not be saved.
      screen
        .getByTestId('rules-time-picker')
        .props.onChange({ type: 'dismissed' }, new Date(2026, 10, 3, 18, 30));
    });

    expect(rowLabel('rules-time')).toBe('Reminder time, 9:00 AM');
    expect(patches).toEqual([]);
    server.events.removeAllListeners();
  });

  it('shows the delivery day only while the monthly report is on, and saves it', async () => {
    await renderLoaded();
    // 09 §5: hidden, not dimmed, while monthly is off.
    expect(screen.queryByTestId('rules-delivery-day')).toBeNull();

    await fireEvent.press(switchFor(RULES_COPY.monthly));
    expect(await screen.findByTestId('rules-delivery-day')).toBeOnTheScreen();
    expect(rowLabel('rules-delivery-day')).toBe('Report delivery day, 1st of month');

    await fireEvent.press(screen.getByTestId('rules-delivery-day'));
    const sheet = await screen.findByTestId('rules-day-sheet');
    expect(
      within(sheet).getByTestId('rules-day-option-1').props.accessibilityState,
    ).toEqual({
      selected: true,
    });
    // 28 days, so every month has the day.
    expect(within(sheet).getByTestId('rules-day-option-28')).toBeOnTheScreen();
    expect(within(sheet).queryByTestId('rules-day-option-29')).toBeNull();

    await fireEvent.press(within(sheet).getByTestId('rules-day-option-15'));

    await waitFor(() =>
      expect(rowLabel('rules-delivery-day')).toBe('Report delivery day, 15th of month'),
    );
    await settle();
    expect(notificationRulesFor(ALEX).report_delivery_day).toBe(15);
    expect(notificationRulesFor(ALEX).monthly_report_enabled).toBe(true);
  });

  it('moves the control back and says so when a save fails', async () => {
    await renderLoaded();
    failSaves();

    await fireEvent.press(switchFor(RULES_COPY.email));

    expect(await screen.findByText(RULES_COPY.saveFailed)).toBeOnTheScreen();
    await settle();
    expect(isOn(RULES_COPY.email)).toBe(false);
    expect(notificationRulesFor(ALEX).send_email).toBe(false);
  });

  it('moves a failed run of taps back to the saved value, not an in-between one', async () => {
    await renderLoaded();
    // Held, so all three are still out when the first one fails.
    let release = () => {};
    const held = new Promise<void>((resolve) => (release = resolve));
    server.use(http.patch(RULES_URL, () => held.then(() => HttpResponse.error())));

    await tapMoreThreeTimes();
    release();

    expect(await screen.findByText(RULES_COPY.saveFailed)).toBeOnTheScreen();
    await settle();
    expect(shownDays('rules-days')).toBe('3 days');
    expect(notificationRulesFor(ALEX).days_before_reminder).toBe(3);
  });

  it('ends a quick run of taps on the last one, on screen and on the server', async () => {
    await renderLoaded();

    await tapMoreThreeTimes();

    await settle();
    expect(notificationRulesFor(ALEX).days_before_reminder).toBe(6);
    expect(shownDays('rules-days')).toBe('6 days');
  });

  it('keeps showing the last tap while earlier saves come back', async () => {
    await renderLoaded();
    // Each PATCH waits for its own release; the saves go one at a time.
    const releases: (() => void)[] = [];
    server.use(
      http.patch(RULES_URL, () =>
        new Promise<void>((resolve) => releases.push(resolve)).then(() => undefined),
      ),
    );

    await tapMoreThreeTimes();
    // The first save ("4 days") comes back while two more are waiting.
    await waitFor(() => expect(releases).toHaveLength(1));
    await act(async () => releases[0]!());
    await waitFor(() => expect(releases).toHaveLength(2));
    await act(() => new Promise((resolve) => setTimeout(resolve, 0)));

    expect(shownDays('rules-days')).toBe('6 days');

    await act(async () => releases[1]!());
    await waitFor(() => expect(releases).toHaveLength(3));
    await act(async () => releases[2]!());
    await settle();
    expect(shownDays('rules-days')).toBe('6 days');
    expect(notificationRulesFor(ALEX).days_before_reminder).toBe(6);
  });

  it("refreshes Home's figures after the trial window changes, and only then", async () => {
    const queryClient = createTestQueryClient();
    const invalidate = jest.spyOn(queryClient, 'invalidateQueries');
    await renderLoaded(queryClient);

    await fireEvent.press(switchFor(RULES_COPY.weekly));
    await settle();
    expect(notificationRulesFor(ALEX).weekly_summary_enabled).toBe(true);
    expect(invalidate).not.toHaveBeenCalledWith({ queryKey: ['analytics'] });

    await fireEvent.press(screen.getByTestId('rules-trial-days-increment', HIDDEN));
    await settle();
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ['analytics'] });
    expect(notificationRulesFor(ALEX).trial_alert_days_before).toBe(3);
  });
});

describe('formatting', () => {
  it('says days with the right plural', () => {
    expect(formatDays(1)).toBe('1 day');
    expect(formatDays(3)).toBe('3 days');
    expect(formatDays(30)).toBe('30 days');
  });

  it("reads the server's time as a 12-hour time", () => {
    expect(formatReminderTime('09:00:00')).toBe('9:00 AM');
    expect(formatReminderTime('18:30:00')).toBe('6:30 PM');
    expect(formatReminderTime('00:05:00')).toBe('12:05 AM');
    expect(formatReminderTime('12:00:00')).toBe('12:00 PM');
    expect(formatReminderTime('07:15')).toBe('7:15 AM');
  });

  it('turns a time into a picker date and back, on local parts', () => {
    expect(dateToTime(timeToDate('18:30:00'))).toBe('18:30:00');
    expect(dateToTime(timeToDate('00:00:00'))).toBe('00:00:00');
    expect(dateToTime(new Date(2026, 0, 1, 7, 5, 59))).toBe('07:05:00');
  });

  it('names delivery days as ordinals', () => {
    const days = [1, 2, 3, 4, 11, 12, 13, 21, 22, 23, 28];
    expect(days.map(formatDeliveryDay)).toEqual([
      '1st of month',
      '2nd of month',
      '3rd of month',
      '4th of month',
      '11th of month',
      '12th of month',
      '13th of month',
      '21st of month',
      '22nd of month',
      '23rd of month',
      '28th of month',
    ]);
  });
});

describe('the mock answers like the real server', () => {
  it('rejects values out of range with the server wording, and saves nothing', () => {
    expect(updateMockNotificationRules(ALEX, { days_before_reminder: 31 }).error).toEqual(
      {
        code: 'validation_error',
        message: 'Ensure this value is less than or equal to 30.',
        fields: {
          days_before_reminder: ['Ensure this value is less than or equal to 30.'],
        },
      },
    );
    expect(
      updateMockNotificationRules(ALEX, { trial_alert_days_before: 0 }).error?.message,
    ).toBe('Ensure this value is greater than or equal to 1.');
    expect(
      updateMockNotificationRules(ALEX, { report_delivery_day: 29 }).error?.message,
    ).toBe('Ensure this value is less than or equal to 28.');
    expect(notificationRulesFor(ALEX)).toEqual(DEFAULT_NOTIFICATION_RULES);
  });

  it('stores "18:30" as "18:30:00", and ignores fields it does not know', () => {
    const { rules } = updateMockNotificationRules(ALEX, {
      reminder_time: '18:30',
      nope: 1,
    });
    expect(rules).toEqual({ ...DEFAULT_NOTIFICATION_RULES, reminder_time: '18:30:00' });
  });
});
