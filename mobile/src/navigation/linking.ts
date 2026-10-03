/**
 * Deep linking configuration.
 *
 * What this is for
 *   Mapping URLs to screens, so the links in SubTrak's emails open the right
 *   place in the app.
 *
 * Why it exists in Phase 0, before the screens are built
 *   Email verification (US-1) and password reset (US-3) are useless without it:
 *   both send a link carrying a one-time token, and that token has to reach a
 *   screen. Defining the routes now means the Phase 1 screens are written
 *   against a URL shape that already exists rather than inventing one each.
 *
 * The scheme
 *   `subtrak://` is declared in app.config.ts. A production build would also
 *   claim https links to the backend's domain via universal links, which needs
 *   server-side association files — out of scope for the capstone.
 *
 * Security note
 *   A deep link is untrusted input: anything can send the app a URL. The token
 *   in it is only ever forwarded to the server, which validates it. The client
 *   never infers "this user is verified" from the mere presence of a link.
 */
import type { LinkingOptions } from '@react-navigation/native';

import type { RootStackParamList } from './types';

export const linking: LinkingOptions<RootStackParamList> = {
  prefixes: ['subtrak://'],

  config: {
    screens: {
      Auth: {
        screens: {
          // subtrak://verify-email?token=abc — from the US-1 verification email.
          ConfirmEmail: 'verify-email',
          // subtrak://reset-password?token=abc — from the US-3 reset email.
          ResetPassword: 'reset-password',
          LogIn: 'login',
        },
      },
      App: {
        screens: {
          // subtrak://subscriptions/sub_123 — where a renewal notification
          // taps through to (Epic E). The route exists now so the notification
          // payload shape can be agreed with the backend team early.
          SubscriptionDetail: 'subscriptions/:id',
          Settings: 'settings',
        },
      },
    },
  },
};
