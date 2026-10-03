/**
 * Babel configuration.
 *
 * What this is for
 *   Metro and Jest both compile through Babel. The Expo preset does essentially
 *   all of the work; this file exists for one addition that only matters in Jest.
 *
 * Why the preset is referenced as `expo/internal/babel-preset`
 *   SDK 57 no longer publishes `babel-preset-expo` as a standalone package — it
 *   lives inside the `expo` package. That is the same path jest-expo's own
 *   transform configuration points at, so following it keeps Metro and Jest on
 *   one preset instead of two that can drift.
 *
 * Why `transform-import-meta` is here
 *   Several packages in MSW's dependency tree are ESM and use `import.meta.url`
 *   to locate their own files on disk. Jest runs CommonJS, so Babel rewrites
 *   those modules — and without this plugin `import.meta.url` compiles to
 *   `undefined`. MSW's HTTP interceptor then calls
 *   `new URL('./llhttp/llhttp.wasm', undefined)` and the whole suite dies on
 *   import with "TypeError: Invalid URL" before any test runs. The plugin
 *   substitutes the CommonJS equivalent derived from `__filename`.
 *
 *   It is scoped to the `test` environment so the app bundle is untouched:
 *   Metro handles ESM natively and needs no rewriting.
 */
module.exports = function babelConfig(api) {
  api.cache(true);

  return {
    presets: ['expo/internal/babel-preset'],
    env: {
      test: {
        plugins: ['babel-plugin-transform-import-meta'],
      },
    },
  };
};
