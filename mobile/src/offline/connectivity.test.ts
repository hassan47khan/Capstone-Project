import NetInfo from '@react-native-community/netinfo';
import { onlineManager, QueryObserver } from '@tanstack/react-query';

import { networkError } from '@/api/errors';
import { createQueryClient } from '@/api/queryClient';
import { createTestQueryClient } from '@/test/render';

import { isOnlineState, watchConnectivity } from './connectivity';

describe('connectivity (11 §3.4)', () => {
  it('counts a connection with no route to the internet as offline', () => {
    expect(isOnlineState({ isConnected: true, isInternetReachable: true })).toBe(true);
    // Unknown reachability isn't evidence of an outage: no banner.
    expect(isOnlineState({ isConnected: true, isInternetReachable: null })).toBe(true);
    expect(isOnlineState({ isConnected: true, isInternetReachable: false })).toBe(false);
    expect(isOnlineState({ isConnected: false, isInternetReachable: null })).toBe(false);
  });

  it('feeds NetInfo to the online manager', () => {
    type Listener = (state: {
      isConnected: boolean;
      isInternetReachable: boolean;
    }) => void;
    const netinfo: { listener?: Listener } = {};
    jest.mocked(NetInfo.addEventListener).mockImplementation((fn) => {
      netinfo.listener = fn as unknown as Listener;
      return () => undefined;
    });

    const stop = watchConnectivity();
    netinfo.listener?.({ isConnected: false, isInternetReachable: false });
    expect(onlineManager.isOnline()).toBe(false);
    netinfo.listener?.({ isConnected: true, isInternetReachable: true });
    expect(onlineManager.isOnline()).toBe(true);
    stop();
  });

  it.each([
    ['the app client', createQueryClient],
    ['the test client', createTestQueryClient],
  ])('with %s, an offline request fails fast instead of pausing', async (_name, make) => {
    const client = make();
    onlineManager.setOnline(false);
    const offline = networkError();
    const observer = new QueryObserver(client, {
      queryKey: ['offline-check'],
      queryFn: () => Promise.reject(offline),
      retry: false,
    });
    const settled = new Promise<void>((resolve) => {
      const stop = observer.subscribe((result) => {
        if (result.status === 'error') {
          stop();
          resolve();
        }
      });
    });

    await settled;

    const result = observer.getCurrentResult();
    expect(result.fetchStatus).toBe('idle');
    expect(result.error).toBe(offline);
    client.clear();
  });
});
