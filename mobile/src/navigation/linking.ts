/**
 * Deep linking configuration (handoff 03 §6).
 *
 * What this is for
 *   Mapping URLs to screens, so the links in SubTrak's emails and notifications
 *   open the right place in the app.
 *
 * The three links
 *   subtrak://verify-email?token=…      → EmailConfirmed      (Auth)
 *   subtrak://reset-password?token=…    → CreateNewPassword   (Auth)
 *   subtrak://subscription/:id          → SubscriptionDetail  (App)
 *   subtrak://family-invite?token=…     → FamilyInvite        (App, 10 §3.5)
 *   The subscription path is singular, as 03 specifies; the Phase-0 plural
 *   `subscriptions/:id` is gone.
 *
 * Cold start and background
 *   Both arrive through `getInitialURL` (cold) and `subscribe` (backgrounded),
 *   and both go through `routeIncomingUrl` first, which parks an App link that
 *   arrives while signed out (see pendingLink.ts).
 *
 * Tapped push notifications (US-13, spec §10)
 *   A tapped reminder opens its subscription. It is turned into the same
 *   `subscription/:id` link here (`linkForPush`), so it gets the same parking
 *   when nobody is signed in. Cold start reads the response that launched the
 *   app; a running app listens for new ones. This is Expo's documented pattern
 *   for push with React Navigation.
 *
 * Security note
 *   A deep link is untrusted input: anything can send the app a URL. The token
 *   in it is only ever forwarded to the server, which validates it. The client
 *   never infers "this user is verified" from the mere presence of a link.
 */
import type { LinkingOptions } from '@react-navigation/native';
import * as Notifications from 'expo-notifications';
import { Linking } from 'react-native';

import { FEATURE_PUSH } from '@/config/features';
import { linkForPush } from '@/features/notifications/push';

import { routeIncomingUrl } from './pendingLink';
import type { RootStackParamList } from './types';

export const linking: LinkingOptions<RootStackParamList> = {
  prefixes: ['subtrak://'],

  async getInitialURL() {
    const url = await Linking.getInitialURL();
    if (url) return routeIncomingUrl(url);
    if (!FEATURE_PUSH) return null;
    return routeIncomingUrl(linkForPush(Notifications.getLastNotificationResponse()));
  },

  subscribe(listener) {
    const open = (url: string | null) => {
      const routed = routeIncomingUrl(url);
      if (routed) listener(routed);
    };
    const subscription = Linking.addEventListener('url', ({ url }) => open(url));
    const tapped = FEATURE_PUSH
      ? Notifications.addNotificationResponseReceivedListener((response) =>
          open(linkForPush(response)),
        )
      : null;
    return () => {
      subscription.remove();
      tapped?.remove();
    };
  },

  config: {
    screens: {
      Auth: {
        screens: {
          EmailConfirmed: 'verify-email',
          CreateNewPassword: 'reset-password',
          Login: 'login',
        },
      },
      App: {
        screens: {
          SubscriptionDetail: 'subscription/:id',
          FamilyInvite: 'family-invite',
        },
      },
    },
  },
};
