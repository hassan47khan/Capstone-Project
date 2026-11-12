/**
 * "Was the charge different?" (US-19): the Home prompt and the amount screen,
 * against the mock /charges routes (src/test/chargeFixtures.ts).
 */
import { NavigationContainer, useNavigation, useRoute } from '@react-navigation/native';
import {
  createNativeStackNavigator,
  type NativeStackNavigationProp,
} from '@react-navigation/native-stack';
import { fireEvent, screen, waitFor, within } from '@testing-library/react-native';
import { http, HttpResponse } from 'msw';
import { useEffect } from 'react';
import { Text } from 'react-native';

import { HomeScreen } from '@/features/home/HomeScreen';
import type { AppStackParamList } from '@/navigation/types';
import { SessionProvider } from '@/session/SessionContext';
import { tokenStore } from '@/session/tokenStore';
import { alexCharges, confirmMockCharge } from '@/test/chargeFixtures';
import { MOCK_EMAILS } from '@/test/fixtures';
import { createTestQueryClient, renderWithProviders } from '@/test/render';
import { server } from '@/test/server';

import { CHARGE_COPY } from './chargeCopy';
import { ConfirmChargeScreen } from './ConfirmChargeScreen';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const Stack = createNativeStackNavigator<any>();

function Stub() {
  const route = useRoute();
  return <Text testID="stub">{route.name}</Text>;
}

const SPOTIFY = 'chg-spotify-0904';
const ICLOUD = 'chg-icloud-0901';

/** Home, with the real ConfirmCharge modal above it. */
async function renderHome() {
  await tokenStore.setRefreshToken(`mock-refresh-${MOCK_EMAILS.full}`);
  await renderWithProviders(
    <SessionProvider>
      <NavigationContainer>
        <Stack.Navigator screenOptions={{ headerShown: false }}>
          <Stack.Screen name="Home" component={HomeScreen} />
          <Stack.Screen name="ConfirmCharge" component={ConfirmChargeScreen} />
          <Stack.Screen name="MainTabs" component={Stub} />
          <Stack.Screen name="SubscriptionDetail" component={Stub} />
          <Stack.Screen name="ProfileAccount" component={Stub} />
        </Stack.Navigator>
      </NavigationContainer>
    </SessionProvider>,
    { queryClient: createTestQueryClient(), reduceMotion: true },
  );
}

/** Opens ConfirmCharge for `id` over a stub, so Go back has somewhere to go. */
function opener(id: string) {
  return function Before() {
    const navigation = useNavigation<NativeStackNavigationProp<AppStackParamList>>();
    useEffect(() => {
      navigation.navigate('ConfirmCharge', { id });
    }, [navigation]);
    return <Text testID="stub">Before</Text>;
  };
}

/** The amount screen on its own, opened for `id`. */
async function renderScreen(id: string) {
  await tokenStore.setRefreshToken(`mock-refresh-${MOCK_EMAILS.full}`);
  await renderWithProviders(
    <SessionProvider>
      <NavigationContainer>
        <Stack.Navigator screenOptions={{ headerShown: false }}>
          <Stack.Screen name="Before" component={opener(id)} />
          <Stack.Screen name="ConfirmCharge" component={ConfirmChargeScreen} />
        </Stack.Navigator>
      </NavigationContainer>
    </SessionProvider>,
    { queryClient: createTestQueryClient(), reduceMotion: true },
  );
}

async function openDifferent(id = SPOTIFY) {
  await renderHome();
  await fireEvent.press(await screen.findByTestId(`charge-${id}-different`));
  await screen.findByTestId('charge-amount');
}

beforeEach(async () => {
  await tokenStore.clear();
});

describe('the Home prompt', () => {
  it('us19_home_asks_about_each_bill_that_went_by_newest_first', async () => {
    await renderHome();

    const section = await screen.findByTestId('home-charges');
    expect(within(section).getByText(CHARGE_COPY.section)).toBeOnTheScreen();
    const spotify = within(section).getByTestId(`charge-${SPOTIFY}`);
    expect(within(spotify).getByText('Spotify, Sep 4')).toBeOnTheScreen();
    expect(within(spotify).getByText('We expected $10.99.')).toBeOnTheScreen();
    expect(
      within(spotify).getByLabelText(
        'Spotify billed on September 4, 2026. We expected $10.99. Was the charge different?',
      ),
    ).toBeOnTheScreen();
    expect(within(section).getByTestId(`charge-${ICLOUD}`)).toBeOnTheScreen();
  });

  it('us19_home_hides_the_prompt_when_nothing_is_waiting', async () => {
    server.use(http.get('*/charges', () => HttpResponse.json({ results: [] })));
    await renderHome();

    await screen.findByTestId('spend-card');
    expect(screen.queryByTestId('home-charges')).toBeNull();
    expect(screen.queryByText(CHARGE_COPY.section)).toBeNull();
  });

  it('us19_thats_right_confirms_the_expected_amount_in_place', async () => {
    let sent: unknown = 'nothing';
    server.events.on('request:start', async ({ request }) => {
      if (request.url.endsWith(`/charges/${SPOTIFY}/confirm`)) {
        sent = await request.clone().json();
      }
    });
    await renderHome();

    await fireEvent.press(await screen.findByTestId(`charge-${SPOTIFY}-confirm`));

    expect(
      await screen.findByText('Saved. Spotify charged the expected $10.99.'),
    ).toBeOnTheScreen();
    await waitFor(() => expect(screen.queryByTestId(`charge-${SPOTIFY}`)).toBeNull());
    // No amount: the server takes the expected one.
    expect(sent).toEqual({});
    expect(screen.getByTestId(`charge-${ICLOUD}`)).toBeOnTheScreen();
    server.events.removeAllListeners();
  });

  it('us19_a_failed_confirm_says_so_on_the_card', async () => {
    server.use(http.post('*/charges/:id/confirm', () => HttpResponse.error()));
    await renderHome();

    await fireEvent.press(await screen.findByTestId(`charge-${SPOTIFY}-confirm`));

    expect(await screen.findByText(CHARGE_COPY.offline)).toBeOnTheScreen();
    expect(screen.getByTestId(`charge-${SPOTIFY}`)).toBeOnTheScreen();
  });

  it('us19_a_failed_list_retries_inline_and_home_still_renders', async () => {
    server.use(
      http.get('*/charges', () =>
        HttpResponse.json(
          { error: { code: 'server_error', message: 'Down.' } },
          { status: 500 },
        ),
      ),
    );
    await renderHome();

    const section = await screen.findByTestId('home-charges');
    expect(within(section).getByRole('button', { name: /try again/i })).toBeOnTheScreen();
    expect(screen.getByTestId('spend-card')).toBeOnTheScreen();
  });
});

describe('entering the real amount', () => {
  it('us19_it_was_different_opens_the_form_for_that_charge', async () => {
    await openDifferent();

    expect(screen.getByText(CHARGE_COPY.screenTitle)).toBeOnTheScreen();
    expect(screen.getByText('Spotify')).toBeOnTheScreen();
    expect(screen.getByText('Billed Sep 4, 2026')).toBeOnTheScreen();
    expect(screen.getByTestId('charge-expected')).toHaveTextContent(
      'We expected $10.99.',
    );
    expect(screen.getByTestId('charge-save')).toBeDisabled();
  });

  it('us19_higher_amount_is_saved_and_home_stops_asking', async () => {
    let sent: unknown;
    server.events.on('request:start', async ({ request }) => {
      if (request.url.endsWith(`/charges/${SPOTIFY}/confirm`)) {
        sent = await request.clone().json();
      }
    });
    await openDifferent();

    await fireEvent.changeText(screen.getByTestId('charge-amount'), '12.99');
    await fireEvent.press(screen.getByTestId('charge-save'));

    expect(
      await screen.findByText(
        'Saved. Spotify charged $12.99, more than the $10.99 expected.',
      ),
    ).toBeOnTheScreen();
    await waitFor(() => expect(screen.queryByTestId('charge-screen')).toBeNull());
    await waitFor(() => expect(screen.queryByTestId(`charge-${SPOTIFY}`)).toBeNull());
    // Sent as a decimal string, never a number.
    expect(sent).toEqual({ amount: '12.99' });
    server.events.removeAllListeners();
  });

  it('us19_amount_must_be_a_price_above_zero', async () => {
    await openDifferent();

    await fireEvent.changeText(screen.getByTestId('charge-amount'), '0');
    await fireEvent(screen.getByTestId('charge-amount'), 'blur');

    expect(screen.getByText('Enter a valid price greater than $0.')).toBeOnTheScreen();
    expect(screen.getByTestId('charge-save')).toBeDisabled();
  });

  it('us19_server_field_error_shows_under_the_amount', async () => {
    server.use(
      http.post('*/charges/:id/confirm', () =>
        HttpResponse.json(
          {
            error: {
              code: 'validation_error',
              message: 'Too big.',
              fields: {
                amount: ['Ensure that there are no more than 10 digits in total.'],
              },
            },
          },
          { status: 400 },
        ),
      ),
    );
    await openDifferent();

    await fireEvent.changeText(screen.getByTestId('charge-amount'), '12.99');
    await fireEvent.press(screen.getByTestId('charge-save'));

    expect(
      await screen.findByText('Ensure that there are no more than 10 digits in total.'),
    ).toBeOnTheScreen();
    expect(screen.getByTestId('charge-screen')).toBeOnTheScreen();
  });

  it('us19_offline_keeps_the_form_and_says_so_under_the_amount', async () => {
    server.use(http.post('*/charges/:id/confirm', () => HttpResponse.error()));
    await openDifferent();

    await fireEvent.changeText(screen.getByTestId('charge-amount'), '12.99');
    await fireEvent.press(screen.getByTestId('charge-save'));

    expect(await screen.findByText(CHARGE_COPY.offline)).toBeOnTheScreen();
    expect(screen.getByTestId('charge-amount').props.value).toBe('12.99');
  });

  it('us19_already_confirmed_elsewhere_goes_back_with_a_note', async () => {
    await openDifferent();
    // Confirmed on another device while the form was open.
    confirmMockCharge(MOCK_EMAILS.full, SPOTIFY, {});

    await fireEvent.changeText(screen.getByTestId('charge-amount'), '12.99');
    await fireEvent.press(screen.getByTestId('charge-save'));

    expect(await screen.findByText(CHARGE_COPY.alreadyConfirmed)).toBeOnTheScreen();
    await waitFor(() => expect(screen.queryByTestId('charge-screen')).toBeNull());
  });
});

describe('the amount screen on its own', () => {
  it('us19_a_charge_no_longer_waiting_shows_nothing_to_confirm', async () => {
    await renderScreen('chg-unknown');

    expect(await screen.findByText(CHARGE_COPY.goneTitle)).toBeOnTheScreen();
    await fireEvent.press(screen.getByRole('button', { name: CHARGE_COPY.goBack }));
    await waitFor(() => expect(screen.queryByTestId('charge-screen')).toBeNull());
  });

  it('us19_a_failed_load_shows_an_error_with_retry', async () => {
    server.use(
      http.get('*/charges', () =>
        HttpResponse.json(
          { error: { code: 'server_error', message: 'Down.' } },
          { status: 500 },
        ),
      ),
    );
    await renderScreen(alexCharges[0]!.id);

    expect(await screen.findByTestId('charge-error')).toBeOnTheScreen();
  });
});
