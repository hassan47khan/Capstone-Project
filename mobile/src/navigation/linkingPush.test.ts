/**
 * A tapped push opens its subscription (US-13; spec §10), through the same
 * deep-link path and parking as any other link.
 */
import { Linking } from 'react-native';

import { pushMock, tappedPush } from '@/test/pushMock';

import { linking } from './linking';
import { resetPendingLink, setAppMounted, takePendingLink } from './pendingLink';

beforeEach(() => {
  resetPendingLink();
  jest.spyOn(Linking, 'getInitialURL').mockResolvedValue(null);
});

it('us13_tap_while_running_opens_the_subscription', () => {
  setAppMounted(true);
  const listener = jest.fn();
  const unsubscribe = linking.subscribe!(listener);
  for (const tapped of pushMock.responseListeners)
    tapped(tappedPush({ subscription_id: 'sub-hulu' }));
  expect(listener).toHaveBeenCalledWith('subtrak://subscription/sub-hulu');
  unsubscribe!();
  expect(pushMock.responseListeners.size).toBe(0);
});

it('us13_tap_that_launched_the_app_opens_the_subscription', async () => {
  setAppMounted(true);
  pushMock.lastResponse = tappedPush({ subscription_id: 'sub-spotify' });
  await expect(linking.getInitialURL!()).resolves.toBe(
    'subtrak://subscription/sub-spotify',
  );
});

it('us13_tap_while_signed_out_is_parked_until_sign_in', async () => {
  pushMock.lastResponse = tappedPush({ subscription_id: 'sub-hulu' });
  await expect(linking.getInitialURL!()).resolves.toBeNull();
  expect(takePendingLink()).toBe('subtrak://subscription/sub-hulu');
});

it('ignores a push with no subscription in it', () => {
  setAppMounted(true);
  const listener = jest.fn();
  linking.subscribe!(listener);
  for (const tapped of pushMock.responseListeners) tapped(tappedPush({}));
  expect(listener).not.toHaveBeenCalled();
});
