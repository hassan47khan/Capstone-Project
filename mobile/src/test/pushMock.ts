/**
 * A controllable stand-in for the native push modules (expo-notifications,
 * expo-device and the EAS project id from expo-constants). setup.tsx installs
 * it; a test changes `pushMock` to set the scene and reads the jest.fn calls.
 *
 * Defaults are "a simulator": `isDevice` is false, so every screen test runs
 * with push unsupported and never registers a device by accident. A push test
 * sets `isDevice` and a permission explicitly.
 */
export interface MockPermission {
  status: 'granted' | 'denied' | 'undetermined';
  granted: boolean;
  canAskAgain: boolean;
  expires: 'never';
}

export function permission(
  status: MockPermission['status'],
  canAskAgain = true,
): MockPermission {
  return { status, granted: status === 'granted', canAskAgain, expires: 'never' };
}

type Listener = (event: unknown) => void;

export const pushMock = {
  isDevice: false,
  projectId: 'test-project-id' as string | null,
  current: permission('undetermined'),
  /** What the system prompt answers. */
  answer: permission('granted'),
  token: 'ExponentPushToken[test-token]',
  lastResponse: null as unknown,
  responseListeners: new Set<Listener>(),
  receivedListeners: new Set<Listener>(),
};

export function resetPushMock(): void {
  pushMock.isDevice = false;
  pushMock.projectId = 'test-project-id';
  pushMock.current = permission('undetermined');
  pushMock.answer = permission('granted');
  pushMock.token = 'ExponentPushToken[test-token]';
  pushMock.lastResponse = null;
  pushMock.responseListeners.clear();
  pushMock.receivedListeners.clear();
}

/** A tapped push, shaped like expo-notifications' NotificationResponse. */
export function tappedPush(data: Record<string, unknown>) {
  return {
    actionIdentifier: 'expo.modules.notifications.actions.DEFAULT',
    notification: {
      date: 0,
      request: { identifier: 'push-1', content: { title: 'Reminder', body: '', data } },
    },
  };
}

export function mockNotificationsModule() {
  const subscribe = (set: Set<Listener>) => (listener: Listener) => {
    set.add(listener);
    return { remove: () => set.delete(listener) };
  };
  return {
    AndroidImportance: { DEFAULT: 3 },
    setNotificationHandler: jest.fn(),
    setNotificationChannelAsync: jest.fn(async () => null),
    getPermissionsAsync: jest.fn(async () => pushMock.current),
    requestPermissionsAsync: jest.fn(async () => {
      pushMock.current = pushMock.answer;
      return pushMock.answer;
    }),
    getExpoPushTokenAsync: jest.fn(async () => ({ type: 'expo', data: pushMock.token })),
    getLastNotificationResponse: jest.fn(() => pushMock.lastResponse),
    addNotificationResponseReceivedListener: jest.fn(
      subscribe(pushMock.responseListeners),
    ),
    addNotificationReceivedListener: jest.fn(subscribe(pushMock.receivedListeners)),
  };
}
