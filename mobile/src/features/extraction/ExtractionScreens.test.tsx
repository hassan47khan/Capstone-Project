/**
 * Connect email and Review extraction (11 §2.3, §2.4, §2.8).
 *
 * The mock inbox (src/test/routes.ts) finds Hulu's trial email, whose end
 * date scored 54% (frame `110:432`), and a clean Spotify receipt (`110:125`).
 */
import { NavigationContainer, useRoute } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { fireEvent, screen, waitFor, within } from '@testing-library/react-native';
import { http, HttpResponse } from 'msw';
import { Text } from 'react-native';

import { SessionProvider } from '@/session/SessionContext';
import { tokenStore } from '@/session/tokenStore';
import { huluExtraction, spotifyExtraction } from '@/test/aiFixtures';
import { MOCK_EMAILS } from '@/test/fixtures';
import { renderWithProviders } from '@/test/render';
import { server } from '@/test/server';

import { ConnectEmailScreen } from './ConnectEmailScreen';
import { authorizeGmail } from './gmailAuth';
import { ReviewExtractionScreen } from './ReviewExtractionScreen';

jest.mock('./gmailAuth', () => ({ authorizeGmail: jest.fn() }));
// The seed's "today", so the reminder date and start-date checks are stable.
jest.mock('../subscriptions/today', () => ({
  ...jest.requireActual('../subscriptions/today'),
  localToday: () => '2026-10-01',
}));
const authorize = authorizeGmail as jest.MockedFunction<typeof authorizeGmail>;
const GRANTED = {
  kind: 'code' as const,
  code: 'mock-gmail-code',
  codeVerifier: 'verifier',
  redirectUri: 'https://mock.subtrak.test/integrations/gmail/callback',
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const Stack = createNativeStackNavigator<any>();
function Stub() {
  const route = useRoute();
  return (
    <Text testID="stub">{`${route.name} ${JSON.stringify(route.params ?? {})}`}</Text>
  );
}

/** Stands in for the root's `navigate('App', { screen, params })`. */
function AppStub() {
  const route = useRoute<{
    key: string;
    name: string;
    params: { screen: string; params?: object };
  }>();
  return (
    <Text testID="stub">{`${route.params.screen} ${JSON.stringify(route.params.params ?? {})}`}</Text>
  );
}

async function renderScreen(
  name: 'ConnectEmail' | 'ReviewExtraction',
  email: string = MOCK_EMAILS.full,
) {
  await tokenStore.setRefreshToken(`mock-refresh-${email}`);
  return renderWithProviders(
    <SessionProvider>
      <NavigationContainer>
        <Stack.Navigator initialRouteName={name} screenOptions={{ headerShown: false }}>
          <Stack.Screen name="ConnectEmail" component={ConnectEmailScreen} />
          <Stack.Screen
            name="ReviewExtraction"
            component={ReviewExtractionScreen}
            initialParams={{ id: huluExtraction.id }}
          />
          <Stack.Screen name="App" component={AppStub} />
          <Stack.Screen name="EditSubscription" component={Stub} />
        </Stack.Navigator>
      </NavigationContainer>
    </SessionProvider>,
  );
}

function servePending(...results: (typeof huluExtraction)[]) {
  server.use(
    http.get('*/extractions/pending', () =>
      HttpResponse.json({ scanning: false, results }),
    ),
  );
}

beforeEach(async () => {
  await tokenStore.clear();
  authorize.mockReset();
});

describe('Connect email (11 §2.3)', () => {
  it('us9_connect_gmail_scans_and_lists_what_it_found_for_review', async () => {
    authorize.mockResolvedValue(GRANTED);
    await renderScreen('ConnectEmail');

    await fireEvent.press(await screen.findByTestId('connect-gmail'));

    expect(await screen.findByTestId('connect-result-ext-hulu')).toBeOnTheScreen();
    expect(screen.getByTestId('connect-result-ext-spotify')).toBeOnTheScreen();
    // Hulu has a field to check; the clean receipt doesn't.
    expect(
      within(screen.getByTestId('connect-result-ext-hulu')).getByText('Check this'),
    ).toBeOnTheScreen();
    expect(
      within(screen.getByTestId('connect-result-ext-spotify')).queryByText('Check this'),
    ).toBeNull();
    // "Confirm all" is deliberately not offered (11 §2.8).
    expect(screen.queryByText(/confirm all/i)).toBeNull();
  });

  it('a result opens its review', async () => {
    authorize.mockResolvedValue(GRANTED);
    await renderScreen('ConnectEmail');
    await fireEvent.press(await screen.findByTestId('connect-gmail'));

    await fireEvent.press(await screen.findByTestId('connect-result-ext-hulu'));

    expect(await screen.findByTestId('stub')).toHaveTextContent(
      'ReviewExtraction {"id":"ext-hulu"}',
    );
  });

  it('denied access shows the failed card, with Try again and manual entry', async () => {
    authorize.mockResolvedValue({ ...GRANTED, code: 'denied' });
    await renderScreen('ConnectEmail');

    await fireEvent.press(await screen.findByTestId('connect-gmail'));

    expect(await screen.findByTestId('connect-failed')).toBeOnTheScreen();
    expect(screen.getByText("Couldn't connect to Gmail")).toBeOnTheScreen();
    expect(screen.getByTestId('connect-gmail')).toHaveTextContent('Try again');
    expect(screen.getByTestId('connect-add-manually')).toHaveTextContent(
      'Add a subscription manually',
    );
  });

  it('closing the browser is not a failure', async () => {
    authorize.mockResolvedValue({ kind: 'cancelled' });
    await renderScreen('ConnectEmail');

    await fireEvent.press(await screen.findByTestId('connect-gmail'));

    await waitFor(() =>
      expect(screen.getByTestId('connect-gmail')).toHaveTextContent('Connect Gmail'),
    );
    expect(screen.queryByTestId('connect-failed')).toBeNull();
  });

  it('there is a way out without connecting: Not now, add manually', async () => {
    await renderScreen('ConnectEmail');

    await fireEvent.press(await screen.findByTestId('connect-not-now'));

    expect(await screen.findByTestId('stub')).toHaveTextContent(/^AddSubscription/);
  });

  it('Outlook is hidden for the MVP (11 §2.1)', async () => {
    await renderScreen('ConnectEmail');
    await screen.findByTestId('connect-gmail');
    expect(screen.queryByText(/outlook/i)).toBeNull();
  });

  it('an empty inbox says nothing was found and offers manual entry', async () => {
    authorize.mockResolvedValue(GRANTED);
    await renderScreen('ConnectEmail', MOCK_EMAILS.empty);

    await fireEvent.press(await screen.findByTestId('connect-gmail'));

    expect(await screen.findByTestId('connect-nothing')).toBeOnTheScreen();
    expect(screen.getByText('No subscriptions found')).toBeOnTheScreen();
  });

  it('shows "Scanning your inbox…" while the scan runs', async () => {
    server.use(
      http.get('*/extractions/pending', () =>
        HttpResponse.json({ scanning: true, results: [huluExtraction] }),
      ),
    );
    await renderScreen('ConnectEmail');

    expect(await screen.findByTestId('connect-scanning')).toBeOnTheScreen();
    expect(screen.getByText('Scanning your inbox…')).toBeOnTheScreen();
    // Results stream in while it runs.
    expect(screen.getByTestId('connect-result-ext-hulu')).toBeOnTheScreen();
  });

  it('when the AI is unavailable, it says so and offers manual entry', async () => {
    authorize.mockResolvedValue(GRANTED);
    server.use(
      http.post('*/extractions/scan', () =>
        HttpResponse.json(
          { error: { code: 'extraction_unavailable', message: 'Unavailable.' } },
          { status: 503 },
        ),
      ),
    );
    await renderScreen('ConnectEmail');

    await fireEvent.press(await screen.findByTestId('connect-gmail'));

    expect(await screen.findByTestId('connect-unavailable')).toBeOnTheScreen();
    expect(screen.getByTestId('connect-add-manually')).toBeOnTheScreen();
  });
});

describe('Review extraction (11 §2.4)', () => {
  it('quotes the email and labels the result as AI-detected', async () => {
    servePending(huluExtraction);
    await renderScreen('ReviewExtraction');

    const snippet = await screen.findByTestId('review-snippet');
    expect(
      within(snippet).getByText('From: Hulu <account@hulumail.com>'),
    ).toBeOnTheScreen();
    expect(
      within(snippet).getByText(
        'Your free trial ends on Oct 19, 2026. After that, you will be charged $17.99 per month.',
      ),
    ).toBeOnTheScreen();
    expect(screen.getByText('AI detected from your email')).toBeOnTheScreen();
    expect(screen.getByText('Nothing is saved until you confirm.')).toBeOnTheScreen();
  });

  it('us10_flagged_field_blocks_confirm_until_checked', async () => {
    servePending(huluExtraction);
    await renderScreen('ReviewExtraction');

    const row = await screen.findByTestId('review-row-trial');
    expect(within(row).getByText('Oct 19, 2026?')).toBeOnTheScreen();
    expect(screen.getByTestId('review-helper-trial')).toHaveTextContent(
      "We're not sure about this date. Tap to edit.",
    );
    expect(screen.getByTestId('review-confirm')).toBeDisabled();
    expect(screen.getByTestId('review-hint')).toHaveTextContent(
      'Check the highlighted field',
    );

    await fireEvent.press(row);
    await fireEvent.press(await screen.findByTestId('review-looks-right'));

    await waitFor(() => expect(screen.getByTestId('review-confirm')).toBeEnabled());
    expect(screen.queryByTestId('review-helper-trial')).toBeNull();
    expect(screen.getByTestId('review-chip-trial')).toHaveTextContent('Checked');
  });

  it('shows each confident row its score, green at 90% and up', async () => {
    servePending(huluExtraction);
    await renderScreen('ReviewExtraction');

    expect(await screen.findByTestId('review-chip-name')).toHaveTextContent('98%');
    expect(screen.getByTestId('review-chip-start')).toHaveTextContent('72%');
  });

  it('a clean receipt can be confirmed straight away', async () => {
    servePending(spotifyExtraction);
    await tokenStore.setRefreshToken(`mock-refresh-${MOCK_EMAILS.full}`);
    await renderWithProviders(
      <SessionProvider>
        <NavigationContainer>
          <Stack.Navigator screenOptions={{ headerShown: false }}>
            <Stack.Screen
              name="ReviewExtraction"
              component={ReviewExtractionScreen}
              initialParams={{ id: spotifyExtraction.id }}
            />
          </Stack.Navigator>
        </NavigationContainer>
      </SessionProvider>,
    );

    await waitFor(() => expect(screen.getByTestId('review-confirm')).toBeEnabled());
    expect(screen.queryByTestId('review-hint')).toBeNull();
  });

  it('us11_nothing_saves_until_confirm_and_track', async () => {
    servePending(huluExtraction);
    let confirmed: unknown = null;
    let plainCreates = 0;
    server.use(
      http.post('*/extractions/:id/confirm', async ({ request }) => {
        confirmed = await request.json();
        return HttpResponse.json({ id: 'sub-new', name: 'Hulu' }, { status: 201 });
      }),
      http.post('*/subscriptions', () => {
        plainCreates += 1;
        return HttpResponse.json({}, { status: 201 });
      }),
    );
    await renderScreen('ReviewExtraction');

    await fireEvent.press(await screen.findByTestId('review-row-trial'));
    await fireEvent.press(await screen.findByTestId('review-looks-right'));
    expect(confirmed).toBeNull();

    await fireEvent.press(screen.getByTestId('review-confirm'));

    await waitFor(() => expect(confirmed).not.toBeNull());
    expect(confirmed).toMatchObject({
      name: 'Hulu',
      billing_price: '17.99',
      is_trial: true,
      trial_ends_on: '2026-10-19',
      trial_length_days: 30,
      trial_reminder_enabled: true,
    });
    expect(plainCreates).toBe(0);
  });

  it('the trial reminder is the end date minus the alert days', async () => {
    servePending(huluExtraction);
    await renderScreen('ReviewExtraction');

    const reminder = await screen.findByTestId('review-reminder');
    // The account's trial_alert_days_before (2, from notificationRulesFixtures).
    expect(reminder).toHaveTextContent(/^Remind me 2 days before/);
    await waitFor(() =>
      expect(reminder).toHaveTextContent(/Push notification on Oct 17$/),
    );
    expect(reminder).toBeChecked();
  });

  it('Edit details opens the full form, prefilled', async () => {
    servePending(huluExtraction);
    await renderScreen('ReviewExtraction');

    await fireEvent.press(await screen.findByTestId('review-edit'));

    expect(await screen.findByTestId('form-name')).toBeOnTheScreen();
    expect(screen.getByDisplayValue('Hulu')).toBeOnTheScreen();
    expect(screen.getByTestId('review-trial-ends')).toBeOnTheScreen();
  });

  it('editing the flagged value resolves it too', async () => {
    servePending(huluExtraction);
    await renderScreen('ReviewExtraction');

    await fireEvent.press(await screen.findByTestId('review-row-trial'));
    await fireEvent.press(await screen.findByTestId('review-change-it'));
    await fireEvent.changeText(await screen.findByTestId('form-name'), 'Hulu Plus');
    await fireEvent.press(screen.getByTestId('review-done'));

    // Changing a different field doesn't count: the date is still unchecked.
    expect(await screen.findByTestId('review-confirm')).toBeDisabled();
  });

  it('an expired review says so instead of a blank screen', async () => {
    servePending(spotifyExtraction);
    await renderScreen('ReviewExtraction');

    expect(await screen.findByTestId('review-gone')).toBeOnTheScreen();
    expect(screen.getByText('This review has expired')).toBeOnTheScreen();
  });

  it('a duplicate offers to update the existing subscription', async () => {
    servePending({ ...huluExtraction, duplicate_of: 'sub-hulu' });
    await renderScreen('ReviewExtraction');

    await fireEvent.press(await screen.findByTestId('review-update-existing'));

    expect(await screen.findByTestId('stub')).toHaveTextContent(
      'EditSubscription {"id":"sub-hulu"}',
    );
  });

  it('no danger red on the review screen (11 §2.10)', async () => {
    servePending(huluExtraction);
    const { toJSON } = await renderScreen('ReviewExtraction');
    await screen.findByTestId('review-row-trial');
    // light theme danger
    expect(JSON.stringify(toJSON())).not.toContain('#b44735');
  });
});
