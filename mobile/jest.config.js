/**
 * Jest configuration.
 *
 * What this is for
 *   Runs the unit and component suites. The project prompt requires Jest, React
 *   Native Testing Library and MSW, and the capstone guidelines require a stated
 *   coverage figure, so coverage collection is configured here too.
 *
 * Why several settings look unusual
 *   React Native code cannot run in a plain Node environment: it is untranspiled
 *   ESM that imports native modules. `jest-expo` supplies the transform and the
 *   mocks for those. Everything below is the delta on top of that preset, and
 *   each entry exists because without it the suite fails in a specific way. The
 *   comments say which way, because these are the settings people waste an
 *   afternoon on.
 */

const expoPreset = require('jest-expo/jest-preset');

/** @type {import('jest').Config} */
module.exports = {
  preset: 'jest-expo',

  /**
   * Adds `.mjs` to the files Babel transforms.
   *
   * jest-expo's transform key is `\.[jt]sx?$`, which covers .js/.jsx/.ts/.tsx and
   * NOT .mjs. MSW v3's dependency tree ships several packages whose build output
   * is .mjs, so without this they reach the runtime untransformed and fail with
   * "Cannot use import statement outside a module" — even though
   * transformIgnorePatterns correctly allowlists them. Allowlisting a package and
   * transforming its file extension are two separate switches, and both are
   * needed.
   *
   * The `.mjs` entry reuses the preset's own babel-jest configuration rather than
   * declaring a second one, so the two can never drift apart.
   */
  transform: {
    ...expoPreset.transform,
    '\\.mjs$': expoPreset.transform['\\.[jt]sx?$'],
  },

  moduleFileExtensions: ['ts', 'tsx', 'js', 'jsx', 'mjs', 'cjs', 'json', 'node'],

  /**
   * Packages that ship untranspiled ESM and must go through Babel.
   *
   * Two things to know before editing this.
   *
   * 1. Names are matched as PREFIXES, with no trailing separator. That is
   *    deliberate and is how jest-expo's own list works: `expo` has to cover
   *    `expo-modules-core`, `expo-font` and every other `expo-*` package.
   *    Appending a `[\\/]` here breaks all of them with
   *    "SyntaxError: Cannot use import statement outside a module".
   *
   * 2. The leading separator is `[\\/]`, not `/`. On Windows the paths Jest
   *    matches against contain backslashes, so a hard-coded `/` silently fails
   *    to match and nothing gets transformed.
   *
   * The first entry is jest-expo's list plus our additions; the two that follow
   * are carried over from the preset unchanged — they re-exclude specific
   * subpaths that must NOT be transformed.
   */
  transformIgnorePatterns: [
    'node_modules[\\\\/](?!(' +
      [
        // --- jest-expo's defaults ---
        '\\.pnpm',
        'react-native',
        '@react-native',
        '@react-native-community',
        'expo',
        '@expo',
        '@expo-google-fonts',
        'react-navigation',
        '@react-navigation',
        '@sentry[\\\\/]react-native',
        'native-base',
        'standard-navigation',
        // --- ours ---
        'lucide-react-native',

        // TanStack Query v5 ships ESM only.
        '@tanstack',

        // React Native Testing Library v14's renderer.
        'test-renderer',

        // MSW v3 and every ESM-only package in its dependency tree. The list is
        // long because MSW's transitive deps went ESM-only; it was produced by
        // scanning node_modules for `"type": "module"` rather than guessed, so
        // if a future MSW release adds one, rescan rather than adding by trial
        // and error.
        'msw',
        '@msw',
        '@mswjs',
        '@bundled-es-modules',
        '@epic-web',
        '@open-draft',
        '@ungap',
        'rettime',
        'tagged-tag',
        'outvariant',
        'until-async',
        'strict-event-emitter',
        'headers-polyfill',
        'is-node-process',
        'set-cookie-parser',
        'cookie',
        'psl',
        'nanoid',
        'graphql',
      ].join('|') +
      '))',
    '[\\\\/]node_modules[\\\\/]react-native-reanimated[\\\\/]plugin[\\\\/]',
    '[\\\\/]node_modules[\\\\/]@react-native[\\\\/]babel-preset[\\\\/]',
  ],

  /**
   * Runs BEFORE the test framework is installed. MSW v3 reaches for web platform
   * globals the React Native Jest environment does not define (TextEncoder,
   * structuredClone, ReadableStream, BroadcastChannel). They must exist before
   * MSW is imported, which is why this is `setupFiles` and not `setupFilesAfterEnv`.
   */
  // ORDER MATTERS. perf-shim must run before polyfills, because polyfills
  // imports undici and undici captures `performance.markResourceTiming` at
  // module load. See the header of perf-shim.ts.
  setupFiles: ['<rootDir>/src/test/perf-shim.ts', '<rootDir>/src/test/polyfills.ts'],

  /**
   * Runs AFTER the framework is available, so it can call beforeAll/afterEach.
   * Starts the MSW server and installs the module mocks (fonts, icons, secure store).
   */
  setupFilesAfterEnv: ['<rootDir>/src/test/setup.tsx'],

  /**
   * Makes Node resolve the "react-native" export condition. Without this, `msw`
   * resolves to its browser build and fails at import time.
   */
  testEnvironmentOptions: {
    customExportConditions: ['react-native', 'require', 'default'],
  },

  // Mirrors the `@/*` path alias in tsconfig.json so imports resolve identically
  // in Metro, tsc and Jest.
  moduleNameMapper: {
    '^@/(.*)$': '<rootDir>/src/$1',
  },

  testMatch: ['**/*.test.ts', '**/*.test.tsx'],

  collectCoverageFrom: [
    'src/**/*.{ts,tsx}',
    // Excluded because they contain no branching logic worth a coverage number:
    // type declarations, barrel files, and the test harness itself.
    '!src/**/*.d.ts',
    '!src/**/index.ts',
    '!src/test/**',
  ],

  clearMocks: true,
};
