/**
 * Add subscription (07 §1–3, §9, §12) against the mock API.
 */
import { NavigationContainer, useRoute } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { act, fireEvent, screen, waitFor } from '@testing-library/react-native';
import { http, HttpResponse } from 'msw';
import { Button, PixelRatio, Text } from 'react-native';

import { SessionProvider } from '@/session/SessionContext';
import { tokenStore } from '@/session/tokenStore';
import { MOCK_EMAILS } from '@/test/fixtures';
import { createTestQueryClient, renderWithProviders } from '@/test/render';
import { server } from '@/test/server';

import { ADD_COPY, AddSubscriptionScreen } from './AddSubscriptionScreen';
import { FORM_COPY } from './formRules';

// A fixed "today" for the start-date rule.
jest.mock('./today', () => ({ localToday: () => '2026-10-23' }));

// Loosely typed: the stubs stand in for routes in several navigators.
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

// A screen underneath the modal, with a button that opens Add.
function Home({ navigation }: { navigation: { navigate: (name: string) => void } }) {
  return (
    <Button title="Open add" onPress={() => navigation.navigate('AddSubscription')} />
  );
}

async function renderAdd() {
  await tokenStore.setRefreshToken(`mock-refresh-${MOCK_EMAILS.full}`);
  await renderWithProviders(
    <SessionProvider>
      <NavigationContainer>
        <Stack.Navigator screenOptions={{ headerShown: false }}>
          <Stack.Screen name="Home" component={Home} />
          <Stack.Screen name="AddSubscription" component={AddSubscriptionScreen} />
          <Stack.Screen name="SubscriptionDetail" component={Stub} />
        </Stack.Navigator>
      </NavigationContainer>
    </SessionProvider>,
    { queryClient: createTestQueryClient(), reduceMotion: true },
  );
  await fireEvent.press(screen.getByText('Open add'));
  await screen.findByTestId('add-screen');
}

/** Picks an option in one of the form's Select fields. */
async function choose(field: string, value: string) {
  await fireEvent.press(screen.getByTestId(field));
  await fireEvent.press(screen.getByTestId(`${field}-option-${value}`));
}

/** Sets the start date through the native picker. */
async function pickStartDate(year: number, monthIndex: number, day: number) {
  await fireEvent.press(screen.getByTestId('form-start'));
  const picker = screen.getByTestId('form-start-picker');
  await act(async () => {
    picker.props.onChange({ type: 'set' }, new Date(year, monthIndex, day));
  });
}

/** Fills in a valid Headspace: $12.99 every 2 months. */
async function fillHeadspace() {
  await fireEvent.changeText(screen.getByTestId('form-name'), 'Headspace');
  await fireEvent.changeText(screen.getByTestId('form-price'), '12.99');
  await choose('form-category', 'health-wellness');
  await fireEvent.press(screen.getByTestId('form-cycle-custom'));
  // The stepper's +/- are hidden from screen readers (the control is one
  // adjustable element), so the test has to include hidden elements.
  await fireEvent.press(
    screen.getByTestId('form-custom-count-increment', { includeHiddenElements: true }),
  );
  await pickStartDate(2025, 9, 15);
}

beforeEach(async () => {
  await tokenStore.clear();
  // Default text size, so the billing cycle shows as five segments (02 §4).
  jest.spyOn(PixelRatio, 'getFontScale').mockReturnValue(1);
});

describe('the empty form (07 §3)', () => {
  it('starts on Monthly with all five cycles, and Save disabled', async () => {
    await renderAdd();

    expect(screen.getByText(ADD_COPY.title)).toBeOnTheScreen();
    for (const cycle of ['weekly', 'monthly', 'quarterly', 'yearly', 'custom']) {
      expect(screen.getByTestId(`form-cycle-${cycle}`)).toBeOnTheScreen();
    }
    expect(screen.getByTestId('form-cycle-monthly')).toBeSelected();
    expect(screen.getByTestId('add-save')).toBeDisabled();
    // No errors before the user has done anything.
    expect(screen.queryByText(FORM_COPY.nameRequired)).toBeNull();
  });

  it('us7_custom_cycle_shows_every_n_unit_and_keeps_all_five_segments', async () => {
    await renderAdd();

    expect(screen.queryByTestId('form-custom')).toBeNull();
    await fireEvent.press(screen.getByTestId('form-cycle-custom'));

    expect(screen.getByTestId('form-custom')).toBeOnTheScreen();
    expect(screen.getByTestId('form-cycle-quarterly')).toBeOnTheScreen();
  });
});

describe('validation (07 §3)', () => {
  it('shows a field error when the user leaves it, not before', async () => {
    await renderAdd();

    const name = screen.getByTestId('form-name');
    await fireEvent(name, 'focus');
    expect(screen.queryByText(FORM_COPY.nameRequired)).toBeNull();
    await fireEvent(name, 'blur');
    expect(screen.getByText(FORM_COPY.nameRequired)).toBeOnTheScreen();
  });

  it('us7_price_zero_rejected', async () => {
    await renderAdd();

    await fireEvent.changeText(screen.getByTestId('form-price'), '0');
    await fireEvent(screen.getByTestId('form-price'), 'blur');
    expect(screen.getByText('Enter a valid price greater than $0.')).toBeOnTheScreen();
  });

  it('us7_future_start_date_rejected', async () => {
    await renderAdd();

    await pickStartDate(2026, 11, 25);
    expect(screen.getByText(FORM_COPY.startInFuture)).toBeOnTheScreen();
  });

  it('enables Save once every required field is valid', async () => {
    await renderAdd();

    await fillHeadspace();
    expect(screen.getByTestId('add-save')).toBeEnabled();
  });
});

describe('saving', () => {
  it('us7_manual_add_saves_and_opens_the_new_subscription', async () => {
    await renderAdd();
    await fillHeadspace();

    await fireEvent.press(screen.getByTestId('add-save'));

    expect(await screen.findByTestId('stub')).toHaveTextContent(
      'SubscriptionDetail {"id":"sub_new_1"}',
    );
  });

  it("shows the server's field message under the right field, keeping the input", async () => {
    server.use(
      http.post(
        '*/subscriptions',
        () =>
          HttpResponse.json(
            {
              error: {
                code: 'validation_error',
                message: 'A card number is not allowed.',
                fields: { payment_label: ['A card number is not allowed.'] },
              },
            },
            { status: 400 },
          ),
        { once: true },
      ),
    );
    await renderAdd();
    await fillHeadspace();

    await fireEvent.press(screen.getByTestId('add-save'));

    expect(await screen.findByText('A card number is not allowed.')).toBeOnTheScreen();
    expect(screen.getByTestId('form-name').props.value).toBe('Headspace');
  });

  it('shows a banner when the server is down, keeping the input', async () => {
    server.use(
      http.post(
        '*/subscriptions',
        () =>
          HttpResponse.json(
            { error: { code: 'server_error', message: 'SubTrak is unavailable.' } },
            { status: 503 },
          ),
        { once: true },
      ),
    );
    await renderAdd();
    await fillHeadspace();

    await fireEvent.press(screen.getByTestId('add-save'));

    expect(await screen.findByTestId('add-form-error')).toBeOnTheScreen();
    expect(screen.getByTestId('form-price').props.value).toBe('12.99');
  });
});

describe('closing (07 §1)', () => {
  it('an untouched form closes without asking', async () => {
    await renderAdd();

    await fireEvent.press(screen.getByLabelText('Close'));
    expect(await screen.findByText('Open add')).toBeOnTheScreen();
  });

  it('a form with something typed asks before discarding', async () => {
    await renderAdd();
    await fireEvent.changeText(screen.getByTestId('form-name'), 'Net');

    await fireEvent.press(screen.getByLabelText('Close'));
    expect(screen.getByText('Discard changes?')).toBeOnTheScreen();

    await fireEvent.press(screen.getByText('Discard'));
    expect(await screen.findByText('Open add')).toBeOnTheScreen();
  });
});

// Holds POST /subscriptions until release() is called, then lets the mock answer.
function holdSaves() {
  let release: () => void = () => {};
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  server.use(
    http.post('*/subscriptions', async () => {
      await gate;
      return undefined; // fall through to the normal mock route
    }),
  );
  return () => act(async () => release());
}

describe('review fixes', () => {
  it('a grey Save explains what is missing', async () => {
    await renderAdd();

    expect(screen.getByTestId('add-save-hint')).toHaveTextContent(
      'To save, check: name, price, category and start date.',
    );
    await fillHeadspace();
    expect(screen.queryByTestId('add-save-hint')).toBeNull();
  });

  it('a 400 for a field the form has no slot for still shows a message', async () => {
    server.use(
      http.post(
        '*/subscriptions',
        () =>
          HttpResponse.json(
            {
              error: {
                code: 'validation_error',
                message: 'That billing cycle is not supported.',
                fields: { billing_cycle: ['That billing cycle is not supported.'] },
              },
            },
            { status: 400 },
          ),
        { once: true },
      ),
    );
    await renderAdd();
    await fillHeadspace();

    await fireEvent.press(screen.getByTestId('add-save'));

    expect(await screen.findByTestId('add-form-error')).toHaveTextContent(
      'That billing cycle is not supported.',
    );
  });

  it('retrying the same save reuses its Idempotency-Key', async () => {
    const keys: (string | null)[] = [];
    server.use(
      http.post('*/subscriptions', ({ request }) => {
        keys.push(request.headers.get('idempotency-key'));
        if (keys.length === 1) {
          return HttpResponse.json(
            { error: { code: 'server_error', message: 'Down.' } },
            { status: 503 },
          );
        }
        return undefined; // second try: the normal mock route answers
      }),
    );
    await renderAdd();
    await fillHeadspace();

    await fireEvent.press(screen.getByTestId('add-save'));
    await screen.findByTestId('add-form-error');
    await fireEvent.press(screen.getByTestId('add-save'));

    expect(await screen.findByTestId('stub')).toHaveTextContent(/^SubscriptionDetail/);
    expect(keys).toHaveLength(2);
    expect(keys[0]).toBeTruthy();
    expect(keys[1]).toBe(keys[0]);
  });

  it('a changed form gets a new Idempotency-Key', async () => {
    const keys: (string | null)[] = [];
    server.use(
      http.post('*/subscriptions', ({ request }) => {
        keys.push(request.headers.get('idempotency-key'));
        return HttpResponse.json(
          { error: { code: 'server_error', message: 'Down.' } },
          { status: 503 },
        );
      }),
    );
    await renderAdd();
    await fillHeadspace();

    await fireEvent.press(screen.getByTestId('add-save'));
    await screen.findByTestId('add-form-error');
    await fireEvent.changeText(screen.getByTestId('form-notes'), 'Family plan');
    await fireEvent.press(screen.getByTestId('add-save'));
    await screen.findByTestId('add-form-error');

    expect(keys).toHaveLength(2);
    expect(keys[1]).not.toBe(keys[0]);
  });

  it('switching to a currency without cents trims the typed price', async () => {
    await renderAdd();
    await fireEvent.changeText(screen.getByTestId('form-price'), '12.99');

    await choose('form-currency', 'JPY');

    expect(screen.getByTestId('form-price').props.value).toBe('12');
  });

  it('the cycle fields are locked while saving', async () => {
    const release = holdSaves();
    await renderAdd();
    await fillHeadspace();

    await fireEvent.press(screen.getByTestId('add-save'));
    // "Saving" switches on a moment after the press.
    await waitFor(() => expect(screen.getByTestId('form-cycle-lock')).toBeDisabled());

    await release();
    await screen.findByTestId('stub');
  });

  it("can't be closed while saving, then moves on once saved", async () => {
    const release = holdSaves();
    await renderAdd();
    await fillHeadspace();

    await fireEvent.press(screen.getByTestId('add-save'));
    await waitFor(() => expect(screen.getByTestId('add-save')).toBeBusy());

    // Pressing X mid-save does nothing: no "Discard?" (it couldn't be honoured).
    await fireEvent.press(screen.getByLabelText('Close'));
    expect(screen.queryByText('Discard changes?')).toBeNull();
    expect(screen.getByTestId('add-screen')).toBeOnTheScreen();

    await release();
    expect(await screen.findByTestId('stub')).toHaveTextContent(/^SubscriptionDetail/);
  });

  it('after a failed save, closing works again (with the discard prompt)', async () => {
    server.use(
      http.post(
        '*/subscriptions',
        () =>
          HttpResponse.json(
            { error: { code: 'server_error', message: 'Down.' } },
            { status: 503 },
          ),
        { once: true },
      ),
    );
    await renderAdd();
    await fillHeadspace();
    await fireEvent.press(screen.getByTestId('add-save'));
    await screen.findByTestId('add-form-error');

    await fireEvent.press(screen.getByLabelText('Close'));
    expect(screen.getByText('Discard changes?')).toBeOnTheScreen();
  });
});
