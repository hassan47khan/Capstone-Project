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

/**
 * Page grounds, light and dark. Must equal `lightColors.bg` and `darkColors.bg`
 * in src/theme/tokens.ts — tokens.test.ts asserts it — so the splash and the
 * first screen share one ground and there is no flash between them.
 */
const BG_LIGHT = '#f6f4ee';
const BG_DARK = '#121a1c';

/**
 * The EAS project id. Expo needs it to issue push tokens (expo-notifications),
 * so without one the app skips push registration and keeps alerts in the
 * inbox. It is not a secret: it ends up in every build. Set EAS_PROJECT_ID in
 * mobile/.env.local after `eas init`, or let `eas init` write it here.
 */
const EAS_PROJECT_ID = process.env.EAS_PROJECT_ID;

export default ({ config }: ConfigContext): ExpoConfig => ({
  ...config,
  name: 'SubTrak',
  slug: 'subtrak',
  version: '1.0.0',
  orientation: 'portrait',
  icon: './assets/icon.png',
  scheme: 'subtrak',
  // Light and dark are both designed (src/theme/tokens.ts). ThemeProvider follows
  // the OS unless the user picks one; this lets the OS report its setting.
  userInterfaceStyle: 'automatic',
  // Note: there is no top-level `splash` key. SDK 54 moved splash configuration
  // into the `expo-splash-screen` config plugin, declared in `plugins` below.
  ios: {
    supportsTablet: true,
    bundleIdentifier: 'edu.csc325.subtrak',
  },
  android: {
    package: 'edu.csc325.subtrak',
    // Android push goes through Firebase (FCM). The file comes from the
    // Firebase console; locally it's a path, on EAS a file environment
    // variable. Without it the build still works, just without Android push.
    ...(process.env.GOOGLE_SERVICES_JSON
      ? { googleServicesFile: process.env.GOOGLE_SERVICES_JSON }
      : {}),
    adaptiveIcon: {
      // The launcher icon is not themed by the OS; it keeps the brand cream.
      backgroundColor: BG_LIGHT,
      foregroundImage: './assets/android-icon-foreground.png',
      monochromeImage: './assets/android-icon-monochrome.png',
    },
    predictiveBackGestureEnabled: false,
  },
  web: {
    favicon: './assets/favicon.png',
  },
  extra: {
    ...config.extra,
    ...(EAS_PROJECT_ID ? { eas: { projectId: EAS_PROJECT_ID } } : {}),
  },
  plugins: [
    'expo-secure-store',
    'expo-font',
    // SDK 58 asks for both packages' config plugins to be declared.
    '@react-native-community/datetimepicker',
    'expo-status-bar',
    // Push (US-13). Android draws the small notification icon from the
    // monochrome launcher layer; the channel itself is created in push.ts.
    [
      'expo-notifications',
      {
        icon: './assets/android-icon-monochrome.png',
        color: BG_DARK,
      },
    ],
    // expo-web-browser and expo-crypto (Connect Gmail) need no entry: crypto
    // ships no plugin, and web-browser's only changes Android when
    // `experimentalLauncherActivity` is set. Its Custom Tabs <queries> and
    // proxy activity come from the library's own AndroidManifest, merged at
    // build time.
    // Biometric unlock on Log In (handoff 05 §5). iOS shows this string the
    // first time the app asks for Face ID.
    [
      'expo-local-authentication',
      {
        faceIDPermission: 'Allow SubTrak to use Face ID to log you in.',
      },
    ],
    [
      'expo-splash-screen',
      {
        image: './assets/splash-icon.png',
        resizeMode: 'contain',
        // Matches the theme's `bg`, so the splash and the first screen share one
        // ground and there is no flash between them — in either appearance.
        backgroundColor: BG_LIGHT,
        dark: {
          image: './assets/splash-icon.png',
          backgroundColor: BG_DARK,
        },
      },
    ],
  ],
});
