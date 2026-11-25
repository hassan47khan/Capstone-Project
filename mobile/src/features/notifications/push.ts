/**
 * Push registration (Epic E: US-12, US-13; spec §8 and §10).
 *
 * When the app asks
 *   Never at launch. iOS gives an app exactly one chance to show the system
 *   prompt; spend it before the user has anything to be warned about and most
 *   people say no, permanently. The app asks the first time someone saves a
 *   trial or a subscription the server will send reminders for, through
 *   `enablePush({ ask: true })` from PushProvider. Everywhere else it only
 *   *refreshes* a registration the user already allowed (`ask: false`).
 *
 * What it does
 *   Checks the permission, asks once if it may, gets an Expo push token, and
 *   POSTs it to /devices. The device id the server returns is kept so sign out
 *   can DELETE it, or this phone would keep getting the last person's alerts.
 *
 * What it never does
 *   Throw. Every outcome is a value, because a push problem must not break
 *   the save that triggered it: the inbox is always the fallback (spec §8,
 *   delivery step 4). Tokens are never logged (spec §11).
 */
import Constants from 'expo-constants';
import * as Device from 'expo-device';
import * as Notifications from 'expo-notifications';
import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';

import { FEATURE_PUSH } from '@/config/features';

import { deleteDevice, registerDevice } from './api';

const DEVICE_ID_KEY = 'subtrak.push.device';
const ASKED_KEY = 'subtrak.push.asked';
const EXPLAINED_KEY = 'subtrak.push.explained';

/** Android 8+ shows nothing without a channel, and 13+ prompts only once one exists. */
export const ANDROID_CHANNEL = 'reminders';

export type PushOutcome =
  /** Token sent to the server. */
  | 'registered'
  /** The user said no, now or before. Alerts stay in the inbox. */
  | 'denied'
  /** Not asked yet, and this call wasn't allowed to ask. */
  | 'not_asked'
  /** Feature off, web, or a simulator: no push here at all. */
  | 'unsupported'
  /** No EAS project id in the build, so Expo can't issue a token. */
  | 'unconfigured'
  /** Expo or our server failed. Tried again on the next launch. */
  | 'failed';

async function read(key: string): Promise<string | null> {
  try {
    return await SecureStore.getItemAsync(key);
  } catch {
    return null;
  }
}

async function write(key: string, value: string): Promise<void> {
  try {
    await SecureStore.setItemAsync(key, value);
  } catch {
    // Losing a flag only means asking or explaining once more. Not worth failing.
  }
}

async function remove(key: string): Promise<void> {
  try {
    await SecureStore.deleteItemAsync(key);
  } catch {
    // Nothing to do.
  }
}

/** The EAS project id Expo needs to issue a token, from app.config.ts. */
export function easProjectId(): string | null {
  const fromConfig = (
    Constants.expoConfig?.extra as { eas?: { projectId?: string } } | undefined
  )?.eas?.projectId;
  return fromConfig ?? Constants.easConfig?.projectId ?? null;
}

function platform(): 'ios' | 'android' | null {
  return Platform.OS === 'ios' || Platform.OS === 'android' ? Platform.OS : null;
}

async function ensureChannel(): Promise<void> {
  if (Platform.OS !== 'android') return;
  await Notifications.setNotificationChannelAsync(ANDROID_CHANNEL, {
    name: 'Reminders',
    description: 'Trial endings, renewals and price changes',
    // The enum is re-exported through `export *`, which the import plugin's
    // resolver can't follow; TypeScript checks it fine.
    // eslint-disable-next-line import/namespace
    importance: Notifications.AndroidImportance.DEFAULT,
  });
}

/**
 * Asks (if allowed and never asked before), then registers.
 *
 * `ask: false` is the quiet path for app start: it registers only when the
 * user already allowed push, and never shows the system prompt.
 */
export async function enablePush({ ask }: { ask: boolean }): Promise<PushOutcome> {
  const os = platform();
  if (!FEATURE_PUSH || !os || !Device.isDevice) return 'unsupported';

  try {
    await ensureChannel();
    let permission = await Notifications.getPermissionsAsync();

    if (!permission.granted) {
      const askedBefore = (await read(ASKED_KEY)) === 'yes';
      if (!permission.canAskAgain) return 'denied';
      if (!ask) return askedBefore ? 'denied' : 'not_asked';
      if (askedBefore) return 'denied';
      await write(ASKED_KEY, 'yes');
      permission = await Notifications.requestPermissionsAsync();
      if (!permission.granted) return 'denied';
    }

    const projectId = easProjectId();
    if (!projectId) return 'unconfigured';

    const { data: token } = await Notifications.getExpoPushTokenAsync({ projectId });
    const device = await registerDevice(token, os);
    await write(DEVICE_ID_KEY, device.id);
    return 'registered';
  } catch {
    // Deliberately not logged: the error can carry the token.
    return 'failed';
  }
}

/**
 * Whether the denied explanation still needs showing, and records that it has.
 * Spec §10: "show a one-time explanation".
 */
export async function takeDeniedExplanation(): Promise<boolean> {
  if ((await read(EXPLAINED_KEY)) === 'yes') return false;
  await write(EXPLAINED_KEY, 'yes');
  return true;
}

/** True when the OS has push turned off for SubTrak (the inbox says so). */
export async function pushIsBlocked(): Promise<boolean> {
  if (!FEATURE_PUSH || !platform() || !Device.isDevice) return false;
  try {
    const permission = await Notifications.getPermissionsAsync();
    return (
      !permission.granted &&
      (!permission.canAskAgain || (await read(ASKED_KEY)) === 'yes')
    );
  } catch {
    return false;
  }
}

/** How long sign out waits for the server before giving up on the DELETE. */
const UNREGISTER_TIMEOUT_MS = 3000;

/**
 * Stops this phone receiving the signed-in user's alerts. Called on sign out,
 * while the session can still authenticate the DELETE. Best effort and
 * bounded: a slow or failed call must not hold up signing out. If it fails,
 * the next account to sign in here re-registers the token, and the server
 * moves it to them.
 */
export async function unregisterForPush(): Promise<void> {
  const id = await read(DEVICE_ID_KEY);
  if (!id) return;
  await remove(DEVICE_ID_KEY);
  let timer: ReturnType<typeof setTimeout> | undefined;
  // If the timeout wins, the DELETE can still fail later; handle that here so
  // it isn't an unhandled rejection.
  const deleting = deleteDevice(id);
  deleting.catch(() => {});
  try {
    await Promise.race([
      deleting,
      new Promise((resolve) => {
        timer = setTimeout(resolve, UNREGISTER_TIMEOUT_MS);
      }),
    ]);
  } catch {
    // Already gone (404) or unreachable: either way, nothing more to do.
  } finally {
    clearTimeout(timer);
  }
}

/**
 * The deep link a tapped push opens (spec §10: "tapping a notification
 * deep-links to the subscription"). The server puts `subscription_id` in the
 * push's data (notifications/tasks.py). Push data is untrusted input, so the
 * id is encoded and anything else is ignored.
 */
export function linkForPush(
  response: Notifications.NotificationResponse | null,
): string | null {
  const data = response?.notification.request.content.data as
    { subscription_id?: unknown } | undefined;
  const id = data?.subscription_id;
  if (typeof id !== 'string' || id.length === 0) return null;
  return `subtrak://subscription/${encodeURIComponent(id)}`;
}
