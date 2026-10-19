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
 *   The subscription path is singular, as 03 specifies; the Phase-0 plural
 *   `subscriptions/:id` is gone.
 *
 * Cold start and background
 *   Both arrive through `getInitialURL` (cold) and `subscribe` (backgrounded),
 *   and both go through `routeIncomingUrl` first, which parks an App link that
 *   arrives while signed out (see pendingLink.ts).
 *
 * Security note
 *   A deep link is untrusted input: anything can send the app a URL. The token
 *   in it is only ever forwarded to the server, which validates it. The client
 *   never infers "this user is verified" from the mere presence of a link.
 */
import type { LinkingOptions } from '@react-navigation/native';
import { Linking } from 'react-native';

import { routeIncomingUrl } from './pendingLink';
import type { RootStackParamList } from './types';

export const linking: LinkingOptions<RootStackParamList> = {
  prefixes: ['subtrak://'],

  async getInitialURL() {
    return routeIncomingUrl(await Linking.getInitialURL());
  },

  subscribe(listener) {
    const subscription = Linking.addEventListener('url', ({ url }) => {
      const routed = routeIncomingUrl(url);
      if (routed) listener(routed);
    });
    return () => subscription.remove();
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
        },
      },
    },
  },
};
