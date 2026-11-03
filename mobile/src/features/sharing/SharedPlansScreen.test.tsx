/**
 * Shared plans (11 §2.6). Alex's Netflix, split three ways by the server:
 * $5.17 (Alex, owner, paid) + $5.16 (Jordan, paid) + $5.16 (Sam, pending,
 * no email).
 */
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { fireEvent, screen, waitFor, within } from '@testing-library/react-native';
import { http, HttpResponse } from 'msw';
import { Share } from 'react-native';

import { SessionProvider } from '@/session/SessionContext';
import { tokenStore } from '@/session/tokenStore';
import { alexSharedPlans } from '@/test/aiFixtures';
import { MOCK_EMAILS } from '@/test/fixtures';
import { renderWithProviders } from '@/test/render';
import { server } from '@/test/server';

import { initials, outstandingCaption, SharedPlansScreen } from './SharedPlansScreen';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const Stack = createNativeStackNavigator<any>();

async function renderPlans(email: string = MOCK_EMAILS.full) {
  await tokenStore.setRefreshToken(`mock-refresh-${email}`);
  return renderWithProviders(
    <SessionProvider>
      <NavigationContainer>
        <Stack.Navigator screenOptions={{ headerShown: false }}>
          <Stack.Screen name="SharedPlans" component={SharedPlansScreen} />
        </Stack.Navigator>
      </NavigationContainer>
    </SessionProvider>,
  );
}

beforeEach(async () => {
  await tokenStore.clear();
});

afterEach(() => {
  jest.restoreAllMocks();
});

describe('helpers', () => {
  it('initials from the first and last name', () => {
    expect(initials('Alex Kim')).toBe('AK');
    expect(initials('Sam')).toBe('S');
    expect(initials('  ')).toBe('?');
  });

  it('names the one person who owes', () => {
    expect(outstandingCaption(alexSharedPlans.results)).toBe(
      'Sam still owes you for Netflix',
    );
  });
});

describe('Shared plans screen', () => {
  it('us14_shows_each_share_as_the_server_split_it', async () => {
    await renderPlans();

    const plan = await screen.findByTestId('plan-plan-netflix');
    expect(within(plan).getByText('$15.49 / month  |  split 3 ways')).toBeOnTheScreen();
    expect(screen.getByTestId('plan-share-plan-netflix')).toHaveTextContent('$5.17');
    expect(
      within(screen.getByTestId('member-part-jordan')).getByText('$5.16'),
    ).toBeOnTheScreen();
    expect(
      within(screen.getByTestId('member-part-sam')).getByText('$5.16'),
    ).toBeOnTheScreen();
    expect(within(plan).getByText('2 of 3 paid')).toBeOnTheScreen();
    // The owner always pays the provider, so their share is Paid.
    expect(screen.getByTestId('member-status-part-alex')).toHaveTextContent('Paid');
    expect(screen.getByTestId('member-status-part-sam')).toHaveTextContent('Pending');
  });

  it('the Outstanding card is what the others still owe', async () => {
    await renderPlans();
    const card = await screen.findByTestId('shared-outstanding');
    expect(within(card).getByText('$5.16')).toBeOnTheScreen();
    expect(within(card).getByText('Sam still owes you for Netflix')).toBeOnTheScreen();
  });

  it('only pending people get a Remind button, never the owner', async () => {
    await renderPlans();
    await screen.findByTestId('plan-plan-netflix');
    expect(screen.getByTestId('member-remind-part-sam')).toBeOnTheScreen();
    expect(screen.queryByTestId('member-remind-part-jordan')).toBeNull();
    expect(screen.queryByTestId('member-remind-part-alex')).toBeNull();
  });

  it('us15_remind_without_an_email_opens_the_share_sheet', async () => {
    const share = jest
      .spyOn(Share, 'share')
      .mockResolvedValue({ action: 'sharedAction', activityType: undefined });
    await renderPlans();

    await fireEvent.press(await screen.findByTestId('member-remind-part-sam'));

    await waitFor(() =>
      expect(share).toHaveBeenCalledWith({
        message: 'Hi Sam Kim, your share of Netflix for October is $5.16.',
      }),
    );
  });

  it('a second reminder the same day says when it can be sent', async () => {
    jest
      .spyOn(Share, 'share')
      .mockResolvedValue({ action: 'sharedAction', activityType: undefined });
    await renderPlans();
    await fireEvent.press(await screen.findByTestId('member-remind-part-sam'));
    await waitFor(() => expect(Share.share).toHaveBeenCalled());
    // The button stays busy until the share sheet closes.
    await waitFor(() =>
      expect(screen.getByTestId('member-remind-part-sam')).toBeEnabled(),
    );

    await fireEvent.press(screen.getByTestId('member-remind-part-sam'));
    await waitFor(() =>
      expect(
        screen.getByTestId('toast', { includeHiddenElements: true }),
      ).toHaveTextContent('You already reminded Sam today. Try again tomorrow.'),
    );
  });

  it('Mark paid moves the person to Paid and Outstanding to the server figure', async () => {
    await renderPlans();
    await fireEvent.press(await screen.findByTestId('member-paid-part-sam'));

    await waitFor(() =>
      expect(screen.getByTestId('member-status-part-sam')).toHaveTextContent('Paid'),
    );
    expect(
      within(screen.getByTestId('plan-plan-netflix')).getByText('3 of 3 paid'),
    ).toBeOnTheScreen();
    // Nobody owes now, so the Outstanding card goes away.
    await waitFor(() => expect(screen.queryByTestId('shared-outstanding')).toBeNull());
    expect(screen.queryByTestId('member-paid-part-sam')).toBeNull();
    expect(screen.queryByTestId('member-remind-part-sam')).toBeNull();
    expect(
      screen.getByTestId('toast', { includeHiddenElements: true }),
    ).toHaveTextContent(/Sam marked as paid\./);
  });

  it('Undo on the toast puts them back to Pending', async () => {
    await renderPlans();
    await fireEvent.press(await screen.findByTestId('member-paid-part-sam'));
    await waitFor(() =>
      expect(screen.getByTestId('member-status-part-sam')).toHaveTextContent('Paid'),
    );

    await fireEvent.press(screen.getByText('Undo'));

    await waitFor(() =>
      expect(screen.getByTestId('member-status-part-sam')).toHaveTextContent('Pending'),
    );
    expect(await screen.findByTestId('shared-outstanding')).toBeOnTheScreen();
  });

  it('a failed Mark paid leaves the row as it was and says why', async () => {
    server.use(
      http.post('*/shared-plans/:plan/payments/:payment/paid', () =>
        HttpResponse.json(
          { error: { code: 'server_error', message: 'Something went wrong.' } },
          { status: 500 },
        ),
      ),
    );
    await renderPlans();
    await fireEvent.press(await screen.findByTestId('member-paid-part-sam'));

    await waitFor(() =>
      expect(
        screen.getByTestId('toast', { includeHiddenElements: true }),
      ).toBeOnTheScreen(),
    );
    expect(screen.getByTestId('member-status-part-sam')).toHaveTextContent('Pending');
  });

  it('a failed list load is an error with Try again', async () => {
    server.use(
      http.get('*/shared-plans', () =>
        HttpResponse.json(
          { error: { code: 'server_error', message: 'Something went wrong.' } },
          { status: 500 },
        ),
      ),
    );
    await renderPlans();
    expect(await screen.findByTestId('shared-error')).toBeOnTheScreen();
  });

  it('someone with no plans sees the empty state and New shared plan', async () => {
    await renderPlans(MOCK_EMAILS.empty);
    expect(await screen.findByTestId('shared-empty')).toBeOnTheScreen();
    expect(screen.queryByTestId('shared-outstanding')).toBeNull();
    expect(screen.getByTestId('shared-new')).toBeOnTheScreen();
  });

  it('New shared plan saves, closes the sheet and shows the server split', async () => {
    await renderPlans(MOCK_EMAILS.full);
    await fireEvent.press(await screen.findByTestId('shared-new'));

    await fireEvent.press(await screen.findByTestId('new-plan-subscription'));
    await fireEvent.press(await screen.findByText('Spotify'));
    await fireEvent.changeText(screen.getByTestId('new-plan-name-0'), 'Jordan Kim');
    await fireEvent.press(screen.getByTestId('new-plan-save'));

    expect(
      await screen.findByText('Spotify is now shared 2 ways.', {
        includeHiddenElements: true,
      }),
    ).toBeTruthy();
    expect(await screen.findByTestId('plan-plan-sub-spotify')).toBeOnTheScreen();
  });

  it('sharing a subscription twice says it is already shared', async () => {
    await renderPlans(MOCK_EMAILS.full);
    await fireEvent.press(await screen.findByTestId('shared-new'));

    await fireEvent.press(await screen.findByTestId('new-plan-subscription'));
    // The plan card behind also says Netflix; the sheet's option is the last one.
    const options = await screen.findAllByText('Netflix');
    await fireEvent.press(options[options.length - 1]!);
    await fireEvent.changeText(screen.getByTestId('new-plan-name-0'), 'Jordan Kim');
    await fireEvent.press(screen.getByTestId('new-plan-save'));

    expect(await screen.findByTestId('new-plan-error')).toHaveTextContent(
      'That subscription is already shared.',
    );
  });

  it('Save stays disabled until a subscription and a person are chosen', async () => {
    await renderPlans();
    await fireEvent.press(await screen.findByTestId('shared-new'));
    expect(await screen.findByTestId('new-plan-save')).toBeDisabled();
  });
});
