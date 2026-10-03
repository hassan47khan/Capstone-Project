/**
 * Expo application configuration.
 *
 * What this is for
 *   Declares the app's identity (name, slug, icons, splash) and the native config
 *   plugins Expo needs to wire up. Expo reads this at build and dev-server start.
 *
 * Why it exists as a .ts file rather than app.json
 *   A TypeScript config can read `process.env`, so the API base URL and the mock
 *   switch flow from the environment into `extra` and stay in one place. A static
 *   app.json cannot do that.
 *
 * How the environment reaches the app
 *   Anything prefixed `EXPO_PUBLIC_` is inlined into the JS bundle by Metro at
 *   build time and read through `src/config/env.ts`. It is deliberately NOT
 *   mirrored into `extra` here: two sources for the same value is how they end
 *   up disagreeing. Nothing secret may live in this file either — the bundle
 *   ships to devices and can be read off them.
 */
import type { ExpoConfig, ConfigContext } from 'expo/config';

/** Brand ground colour. Kept in sync with `tokens.colors.paper` in src/theme/tokens.ts. */
const PAPER = '#F5F3EE';

export default ({ config }: ConfigContext): ExpoConfig => ({
  ...config,
  name: 'SubTrak',
  slug: 'subtrak',
  version: '1.0.0',
  orientation: 'portrait',
  icon: './assets/icon.png',
  scheme: 'subtrak',
  // The design is a single light theme (see the prototype's visual language page).
  // Locking this prevents the OS dark mode from inverting colours we never designed.
  userInterfaceStyle: 'light',
  // Note: there is no top-level `splash` key. SDK 54 moved splash configuration
  // into the `expo-splash-screen` config plugin, declared in `plugins` below.
  ios: {
    supportsTablet: true,
    bundleIdentifier: 'edu.csc325.subtrak',
  },
  android: {
    package: 'edu.csc325.subtrak',
    adaptiveIcon: {
      backgroundColor: PAPER,
      foregroundImage: './assets/android-icon-foreground.png',
      monochromeImage: './assets/android-icon-monochrome.png',
    },
    predictiveBackGestureEnabled: false,
  },
  web: {
    favicon: './assets/favicon.png',
  },
  plugins: [
    'expo-secure-store',
    'expo-font',
    [
      'expo-splash-screen',
      {
        image: './assets/splash-icon.png',
        resizeMode: 'contain',
        // Matches tokens.colors.paper, so the splash and the first screen share
        // one ground and there is no flash of white between them.
        backgroundColor: PAPER,
      },
    ],
  ],
});
