/**
 * Trial Shield (11 §2.5). Alex's three trials from the seed: Hulu 29/31 days,
 * Notion AI 21/30, Duolingo Max 9/30 — the frame's 93.6% / 70.4% / 30.2%.
 */
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { fireEvent, screen, waitFor, within } from '@testing-library/react-native';
import { http, HttpResponse } from 'msw';
import { StyleSheet } from 'react-native';

import { SessionProvider } from '@/session/SessionContext';
import { tokenStore } from '@/session/tokenStore';
import { alexTrials } from '@/test/aiFixtures';
import { MOCK_EMAILS } from '@/test/fixtures';
import { renderWithProviders } from '@/test/render';
import { server } from '@/test/server';
import { lightColors } from '@/theme';

import {
  actionsFor,
  atRiskCaption,
  chipTone,
  daysLeftLabel,
  TrialShieldScreen,
} from './TrialShieldScreen';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const Stack = createNativeStackNavigator<any>();

async function renderTrials(email: string = MOCK_EMAILS.full) {
  await tokenStore.setRefreshToken(`mock-refresh-${email}`);
  return renderWithProviders(
    <SessionProvider>
      <NavigationContainer>
        <Stack.Navigator screenOptions={{ headerShown: false }}>
          <Stack.Screen name="TrialShield" component={TrialShieldScreen} />
        </Stack.Navigator>
      </NavigationContainer>
    </SessionProvider>,
  );
}

beforeEach(async () => {
  await tokenStore.clear();
});

describe('rules (11 §2.5)', () => {
  it('days-left chips are never danger: warning ≤ 3, neutral to 14, success after', () => {
    expect([2, 3, 4, 14, 15, 21].map(chipTone)).toEqual([
      'warning',
      'warning',
      'neutral',
      'neutral',
      'success',
      'success',
    ]);
  });

  it('actions follow urgency', () => {
    const [hulu, notion, duolingo] = alexTrials.results;
    expect(actionsFor(hulu!)).toEqual(['guide', 'keep']);
    expect(actionsFor(notion!)).toEqual(['remind', 'guide']);
    expect(actionsFor(duolingo!)).toEqual(['remind']);
  });

  it('one window in the caption, singular and plural', () => {
    expect(atRiskCaption(1, 3)).toBe('1 trial converts to a paid plan within 3 days');
    expect(atRiskCaption(2, 1)).toBe('2 trials convert to a paid plan within 1 day');
    expect(daysLeftLabel(1)).toBe('1 day left');
    expect(daysLeftLabel(0)).toBe('Ends today');
  });
});

describe('Trial Shield screen', () => {
  it('us12_at_risk_card_uses_the_users_window', async () => {
    await renderTrials();

    const card = await screen.findByTestId('trials-at-risk');
    expect(within(card).getByText('At risk soon')).toBeOnTheScreen();
    expect(within(card).getByText('$17.99')).toBeOnTheScreen();
    expect(
      within(card).getByText('1 trial converts to a paid plan within 3 days'),
    ).toBeOnTheScreen();
  });

  it('progress is elapsed ÷ trial length, from the server', async () => {
    await renderTrials();
    await screen.findByTestId('trial-sub-hulu');

    const widths = ['sub-hulu', 'sub-notion-ai', 'sub-duolingo-max'].map((id) => {
      const track = screen.getByTestId(`trial-progress-${id}`);
      return StyleSheet.flatten(track.props.children.props.style).width;
    });
    expect(widths).toEqual(['94%', '70%', '30%']);
    expect(screen.getByTestId('trial-progress-sub-hulu')).toHaveProp(
      'accessibilityValue',
      { min: 0, max: 31, now: 29 },
    );
  });

  it('the urgent chip is the warning tint, not danger', async () => {
    await renderTrials();
    const chip = await screen.findByTestId('trial-days-sub-hulu');
    expect(chip).toHaveTextContent('2 days left');
    const style = StyleSheet.flatten(chip.props.style);
    expect(style.backgroundColor).toBe(lightColors.warningSurface);
    expect(style.backgroundColor).not.toBe(lightColors.danger);
  });

  it('us13_keep_it_stops_the_nagging_and_hides_the_at_risk_card', async () => {
    await renderTrials();

    await fireEvent.press(await screen.findByTestId('trial-keep-sub-hulu'));

    // The mock route records the decision and the next GET leaves Hulu out of
    // the at-risk total, as the server does.
    await waitFor(() => expect(screen.queryByTestId('trials-at-risk')).toBeNull());
    expect(screen.getByTestId('trial-keep-sub-hulu')).toBeDisabled();
  });

  it('Remind me sets the reminder', async () => {
    await renderTrials();

    await fireEvent.press(await screen.findByTestId('trial-remind-sub-duolingo-max'));

    await waitFor(() =>
      expect(screen.getByTestId('trial-remind-sub-duolingo-max')).toHaveTextContent(
        'Reminder set',
      ),
    );
  });

  it('Cancel guide is guidance, with the end date and the charge', async () => {
    await renderTrials();

    await fireEvent.press(await screen.findByTestId('trial-guide-sub-hulu'));

    const sheet = await screen.findByTestId('trial-guide-sheet');
    expect(within(sheet).getByText('How to cancel Hulu')).toBeOnTheScreen();
    expect(
      within(sheet).getByText("Do it before Oct 3, 2026 so you aren't charged $17.99."),
    ).toBeOnTheScreen();
  });

  it('someone with no trials gets an empty state, not a blank screen', async () => {
    await renderTrials(MOCK_EMAILS.empty);
    expect(await screen.findByTestId('trials-empty')).toBeOnTheScreen();
    expect(screen.queryByTestId('trials-at-risk')).toBeNull();
  });

  it('a failed load shows an error with Try again', async () => {
    server.use(
      http.get('*/trials', () =>
        HttpResponse.json(
          { error: { code: 'server_error', message: 'Down.' } },
          { status: 503 },
        ),
      ),
    );
    await renderTrials();
    expect(await screen.findByTestId('trials-error')).toBeOnTheScreen();
  });
});
