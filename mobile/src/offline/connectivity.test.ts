import NetInfo from '@react-native-community/netinfo';
import { onlineManager, QueryClient } from '@tanstack/react-query';

import { isOnlineState, watchConnectivity } from './connectivity';

describe('connectivity (11 §3.4)', () => {
  it('counts a connection with no route to the internet as offline', () => {
    expect(isOnlineState({ isConnected: true, isInternetReachable: true })).toBe(true);
    expect(isOnlineState({ isConnected: true, isInternetReachable: null })).toBe(true);
    expect(isOnlineState({ isConnected: true, isInternetReachable: false })).toBe(false);
    expect(isOnlineState({ isConnected: false, isInternetReachable: null })).toBe(false);
  });

  it('feeds NetInfo to the online manager and keeps requests failing fast', () => {
    const client = new QueryClient({ defaultOptions: { queries: { staleTime: 5 } } });
    type Listener = (state: {
      isConnected: boolean;
      isInternetReachable: boolean;
    }) => void;
    const netinfo: { listener?: Listener } = {};
    jest.mocked(NetInfo.addEventListener).mockImplementation((fn) => {
      netinfo.listener = fn as unknown as Listener;
      return () => undefined;
    });

    const stop = watchConnectivity(client);
    netinfo.listener?.({ isConnected: false, isInternetReachable: false });
    expect(onlineManager.isOnline()).toBe(false);
    netinfo.listener?.({ isConnected: true, isInternetReachable: true });
    expect(onlineManager.isOnline()).toBe(true);

    const defaults = client.getDefaultOptions();
    expect(defaults.queries?.networkMode).toBe('always');
    expect(defaults.queries?.staleTime).toBe(5);
    expect(defaults.mutations?.networkMode).toBe('always');
    stop();
  });
});
