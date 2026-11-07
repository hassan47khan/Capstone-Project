import { onlineManager, useQuery } from '@tanstack/react-query';
import { act, fireEvent, screen } from '@testing-library/react-native';
import { View } from 'react-native';

import { createTestQueryClient, renderWithProviders } from '@/test/render';

import { OFFLINE_COPY, OfflineBanner } from './OfflineBanner';

const goOffline = () => act(async () => onlineManager.setOnline(false));
const goOnline = () => act(async () => onlineManager.setOnline(true));

/** A screen reading one cached query, as a mounted tab would. */
function Reads({ queryKey }: { queryKey: string[] }) {
  useQuery({ queryKey, queryFn: () => new Promise<never>(() => undefined) });
  return null;
}

/** Two tabs' worth of banners, as bottom tabs keep both mounted. */
function TwoTabs() {
  return (
    <View>
      <View testID="tab-home">
        <OfflineBanner />
      </View>
      <View testID="tab-calendar">
        <OfflineBanner />
      </View>
    </View>
  );
}

const at = (hour: number, minute: number) => new Date(2026, 9, 1, hour, minute).getTime();

describe('OfflineBanner (11 §3.4)', () => {
  it('is hidden while online', async () => {
    await renderWithProviders(<OfflineBanner />);

    expect(screen.queryByTestId('offline-banner')).toBeNull();
  });

  it('gives the oldest time any mounted screen is showing, and goes away on reconnect', async () => {
    const client = createTestQueryClient();
    client.setQueryData(['home'], { ok: true }, { updatedAt: at(17, 10) });
    client.setQueryData(['calendar'], { ok: true }, { updatedAt: at(15, 5) });
    // Cached but not on any screen: says nothing about what's shown.
    client.setQueryDefaults(['old'], { gcTime: Infinity });
    client.setQueryData(['old'], { ok: true }, { updatedAt: at(9, 0) });
    await renderWithProviders(
      <>
        <Reads queryKey={['home']} />
        <Reads queryKey={['calendar']} />
        <OfflineBanner />
      </>,
      { queryClient: client },
    );

    await goOffline();
    expect(screen.getByText(OFFLINE_COPY.showing('3:05 PM'))).toBeOnTheScreen();

    await goOnline();
    expect(screen.queryByTestId('offline-banner')).toBeNull();
  });

  it('says only that the phone is offline when no screen shows cached data', async () => {
    await renderWithProviders(<OfflineBanner />);

    await goOffline();
    expect(screen.getByText(OFFLINE_COPY.offline)).toBeOnTheScreen();
  });

  it('dismissing hides it in every tab, and the next outage brings it back', async () => {
    await renderWithProviders(<TwoTabs />);
    await goOffline();
    expect(screen.getAllByTestId('offline-banner')).toHaveLength(2);

    await fireEvent.press(
      screen.getAllByRole('button', { name: 'Dismiss offline notice' })[0]!,
    );
    expect(screen.queryAllByTestId('offline-banner')).toHaveLength(0);

    await goOnline();
    await goOffline();
    expect(screen.getAllByTestId('offline-banner')).toHaveLength(2);
  });
});
