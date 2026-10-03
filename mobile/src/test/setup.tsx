/**
 * Jest setup — runs once per test file, after the framework is available.
 *
 * What this is for
 *   Replaces the handful of modules that cannot work in a Node process with
 *   predictable fakes, and starts the MSW server that serves the mock API.
 *
 * Why each mock exists
 *   Every one of these would otherwise either throw (native module missing) or
 *   make tests non-deterministic (async font loading, SVG output). The goal is
 *   that a component test asserts the component's own behaviour, not the
 *   behaviour of a font loader.
 */
// React Native Testing Library v14 registers its matchers (toBeOnTheScreen,
// toHaveAccessibilityState, toHaveStyle, ...) automatically on import. The
// separate '/extend-expect' entry point that older guides mention was removed
// in v12.4 — importing it now fails with "Cannot find module".
import { server } from './server';
import { resetMockState } from './routes';

/**
 * Fonts: `useFonts` is asynchronous and returns `[false, null]` on first render.
 * Unmocked, every screen test would render the splash branch and assert nothing.
 * Returning "loaded" immediately lets tests see the real UI.
 *
 * The cost: we never exercise the not-yet-loaded branch in tests. That branch is
 * three lines in src/theme/fonts.ts and is covered by looking at the app.
 */
jest.mock('expo-font', () => ({
  useFonts: () => [true, null],
  loadAsync: jest.fn().mockResolvedValue(undefined),
  isLoaded: () => true,
}));

jest.mock('@expo-google-fonts/newsreader', () => ({
  useFonts: () => [true, null],
  Newsreader_400Regular: 'Newsreader_400Regular',
  Newsreader_500Medium: 'Newsreader_500Medium',
  Newsreader_600SemiBold: 'Newsreader_600SemiBold',
}));

jest.mock('@expo-google-fonts/hanken-grotesk', () => ({
  useFonts: () => [true, null],
  HankenGrotesk_400Regular: 'HankenGrotesk_400Regular',
  HankenGrotesk_500Medium: 'HankenGrotesk_500Medium',
  HankenGrotesk_600SemiBold: 'HankenGrotesk_600SemiBold',
  HankenGrotesk_700Bold: 'HankenGrotesk_700Bold',
}));

/**
 * Secure store is a native module with no JS implementation, so it throws in
 * Jest. An in-memory map behaves the same from the caller's point of view and
 * lets us test the token lifecycle (save, read, clear) for real.
 *
 * What this does NOT prove: that the OS keychain actually persists or encrypts
 * anything. That is only observable on a device.
 */
jest.mock('expo-secure-store', () => {
  const store = new Map<string, string>();
  return {
    isAvailableAsync: jest.fn().mockResolvedValue(true),
    getItemAsync: jest.fn(async (key: string) => store.get(key) ?? null),
    setItemAsync: jest.fn(async (key: string, value: string) => {
      store.set(key, value);
    }),
    deleteItemAsync: jest.fn(async (key: string) => {
      store.delete(key);
    }),
    __reset: () => store.clear(),
  };
});

/**
 * Lucide renders real SVG trees. Unmocked, every component snapshot fills with
 * hundreds of path elements and becomes unreadable, and assertions on the
 * surrounding UI get buried. This stand-in keeps the one thing tests care about
 * — that an icon-only button carries an accessible label.
 */
jest.mock('lucide-react-native', () => {
  // `require` rather than an import: a jest.mock factory is hoisted above every
  // import in the file, so anything it references must be loaded inside it.
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const React = require('react');
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { View } = require('react-native');

  // Any icon name resolves to the same stub component, so adding an icon to a
  // screen never requires touching this mock.
  return new Proxy(
    {},
    {
      get: (_target, iconName: string) => {
        const Icon = (props: Record<string, unknown>) =>
          React.createElement(View, {
            ...props,
            testID: props.testID ?? `icon-${iconName}`,
          });
        Icon.displayName = `MockIcon(${iconName})`;
        return Icon;
      },
    },
  );
});

/**
 * MSW lifecycle.
 *
 * `onUnhandledFrame: 'error'` is deliberate and strict: a request with no
 * handler fails the test loudly instead of hanging or returning undefined. That
 * turns "I forgot to mock this endpoint" into an immediate, named failure.
 *
 * Note the option name. MSW v2 called this `onUnhandledRequest`; v3 renamed it
 * to `onUnhandledFrame`, because it now covers WebSocket connections too. The
 * old name is silently ignored rather than rejected, so a copied-in v2 snippet
 * leaves unhandled requests merely warning.
 */
beforeAll(() => {
  server.listen({ onUnhandledFrame: 'error' });
});

// Per-test overrides (a handler that returns 503, say) are discarded between
// tests so one test's failure injection cannot leak into the next. The route
// table's in-memory writes are rolled back for the same reason: a test that
// creates a subscription must not change what the next test sees.
afterEach(() => {
  server.resetHandlers();
  resetMockState();
});

afterAll(() => {
  server.close();
});
