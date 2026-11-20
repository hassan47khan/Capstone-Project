/**
 * Push registration (US-13; spec §10): when the app may ask, what it sends,
 * and that nothing here can throw into the save that triggered it.
 * Against the mock /devices route and the fake native modules in pushMock.ts.
 */
import * as Notifications from 'expo-notifications';
import * as SecureStore from 'expo-secure-store';
import { http, HttpResponse } from 'msw';

import { configureTokenHooks } from '@/api/client';
import { MOCK_EMAILS } from '@/test/fixtures';
import { mockDevicesFor } from '@/test/notificationFixtures';
import { permission, pushMock, tappedPush } from '@/test/pushMock';
import { server } from '@/test/server';

import {
  enablePush,
  linkForPush,
  pushIsBlocked,
  takeDeniedExplanation,
  unregisterForPush,
} from './push';

const ALEX = MOCK_EMAILS.full;

beforeEach(async () => {
  // The asked/explained flags live in the (in-memory) secure store.
  (SecureStore as unknown as { __reset: () => void }).__reset();
  // Signed in as Alex, without mounting the session provider.
  configureTokenHooks({
    getAccessToken: () => `mock-access-${ALEX}`,
    getRefreshToken: async () => null,
    onTokensRefreshed: async () => {},
    onRefreshFailed: async () => {},
  });
  pushMock.isDevice = true;
});

describe('enablePush', () => {
  it('us13_never_prompts_on_the_quiet_path', async () => {
    expect(await enablePush({ ask: false })).toBe('not_asked');
    expect(Notifications.requestPermissionsAsync).not.toHaveBeenCalled();
    expect(mockDevicesFor(ALEX)).toEqual([]);
  });

  it('us13_asks_after_a_save_and_registers_the_token', async () => {
    expect(await enablePush({ ask: true })).toBe('registered');
    expect(Notifications.requestPermissionsAsync).toHaveBeenCalledTimes(1);
    expect(Notifications.getExpoPushTokenAsync).toHaveBeenCalledWith({
      projectId: 'test-project-id',
    });
    expect(mockDevicesFor(ALEX)).toHaveLength(1);
  });

  it('us13_already_allowed_registers_quietly_at_launch', async () => {
    pushMock.current = permission('granted');
    expect(await enablePush({ ask: false })).toBe('registered');
    expect(Notifications.requestPermissionsAsync).not.toHaveBeenCalled();
  });

  it('us13_denied_is_asked_once_ever', async () => {
    pushMock.answer = permission('denied', true);
    expect(await enablePush({ ask: true })).toBe('denied');
    // Android can technically ask again; we still don't nag.
    expect(await enablePush({ ask: true })).toBe('denied');
    expect(Notifications.requestPermissionsAsync).toHaveBeenCalledTimes(1);
    expect(mockDevicesFor(ALEX)).toEqual([]);
  });

  it('us13_denied_in_os_settings_never_prompts', async () => {
    pushMock.current = permission('denied', false);
    expect(await enablePush({ ask: true })).toBe('denied');
    expect(Notifications.requestPermissionsAsync).not.toHaveBeenCalled();
  });

  it('us13_simulator_is_unsupported', async () => {
    pushMock.isDevice = false;
    expect(await enablePush({ ask: true })).toBe('unsupported');
    expect(Notifications.getPermissionsAsync).not.toHaveBeenCalled();
  });

  it('us13_no_eas_project_skips_registration', async () => {
    pushMock.projectId = null;
    expect(await enablePush({ ask: true })).toBe('unconfigured');
    expect(Notifications.getExpoPushTokenAsync).not.toHaveBeenCalled();
  });

  it('us13_server_failure_is_a_value_not_a_throw', async () => {
    server.use(
      http.post('*/devices', () =>
        HttpResponse.json(
          { error: { code: 'server_error', message: 'x' } },
          { status: 500 },
        ),
      ),
    );
    await expect(enablePush({ ask: true })).resolves.toBe('failed');
  });

  it('us13_expo_token_failure_is_a_value_not_a_throw', async () => {
    jest
      .mocked(Notifications.getExpoPushTokenAsync)
      .mockRejectedValueOnce(new Error('no fcm'));
    await expect(enablePush({ ask: true })).resolves.toBe('failed');
  });
});

describe('unregisterForPush', () => {
  it('us13_sign_out_removes_this_device', async () => {
    await enablePush({ ask: true });
    expect(mockDevicesFor(ALEX)).toHaveLength(1);
    await unregisterForPush();
    expect(mockDevicesFor(ALEX)).toEqual([]);
  });

  it('does nothing when this phone never registered', async () => {
    await expect(unregisterForPush()).resolves.toBeUndefined();
  });
});

describe('takeDeniedExplanation', () => {
  it('us13_denied_explanation_shows_once', async () => {
    const first = await takeDeniedExplanation();
    const second = await takeDeniedExplanation();
    expect([first, second]).toEqual([true, false]);
  });
});

describe('pushIsBlocked', () => {
  it('is false before the user was ever asked', async () => {
    expect(await pushIsBlocked()).toBe(false);
  });

  it('is true once the OS has push turned off', async () => {
    pushMock.current = permission('denied', false);
    expect(await pushIsBlocked()).toBe(true);
  });

  it('is false when push is allowed', async () => {
    pushMock.current = permission('granted');
    expect(await pushIsBlocked()).toBe(false);
  });
});

describe('linkForPush', () => {
  const respond = (data: Record<string, unknown>) =>
    tappedPush(data) as unknown as Notifications.NotificationResponse;

  it('us13_tap_opens_the_subscription', () => {
    expect(
      linkForPush(respond({ subscription_id: 'sub-hulu', kind: 'trial_ending' })),
    ).toBe('subtrak://subscription/sub-hulu');
  });

  it('encodes the id, because push data is untrusted', () => {
    expect(linkForPush(respond({ subscription_id: '../x?y' }))).toBe(
      'subtrak://subscription/..%2Fx%3Fy',
    );
  });

  it('ignores a push with no subscription', () => {
    expect(linkForPush(respond({}))).toBeNull();
    expect(linkForPush(respond({ subscription_id: 42 }))).toBeNull();
    expect(linkForPush(null)).toBeNull();
  });
});
