import { onlineManager } from '@tanstack/react-query';
import { act, fireEvent, screen } from '@testing-library/react-native';

import { createTestQueryClient, renderWithProviders } from '@/test/render';

import { OFFLINE_COPY, OfflineBanner } from './OfflineBanner';

const goOffline = () => act(async () => onlineManager.setOnline(false));
const goOnline = () => act(async () => onlineManager.setOnline(true));

describe('OfflineBanner (11 §3.4)', () => {
  it('is hidden while online', async () => {
    await renderWithProviders(<OfflineBanner />);

    expect(screen.queryByTestId('offline-banner')).toBeNull();
  });

  it('says when the shown data is from, and goes away on reconnect', async () => {
    // The test client drops unobserved data at once (gcTime 0); keep this one.
    const client = createTestQueryClient();
    client.setQueryDefaults(['analytics'], { gcTime: Infinity });
    const at = new Date(2026, 9, 1, 15, 5).getTime();
    client.setQueryData(['analytics', 'summary'], { ok: true }, { updatedAt: at });
    await renderWithProviders(<OfflineBanner />, { queryClient: client });

    await goOffline();
    expect(screen.getByText(OFFLINE_COPY.showing('3:05 PM'))).toBeOnTheScreen();

    await goOnline();
    expect(screen.queryByTestId('offline-banner')).toBeNull();
  });

  it('says only that the phone is offline when nothing is cached', async () => {
    await renderWithProviders(<OfflineBanner />);

    await goOffline();
    expect(screen.getByText(OFFLINE_COPY.offline)).toBeOnTheScreen();
  });

  it('can be dismissed, and comes back with the next outage', async () => {
    await renderWithProviders(<OfflineBanner />);
    await goOffline();

    await fireEvent.press(screen.getByRole('button', { name: 'Dismiss offline notice' }));
    expect(screen.queryByTestId('offline-banner')).toBeNull();

    await goOnline();
    await goOffline();
    expect(screen.getByTestId('offline-banner')).toBeOnTheScreen();
  });
});
