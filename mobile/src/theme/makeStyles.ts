/**
 * makeStyles — themed StyleSheets without re-creating them on every render.
 *
 * What this is for
 *   A component's styles depend on the live theme, so they cannot be a
 *   module-level `StyleSheet.create`. This is the one pattern every component
 *   uses instead:
 *
 *     const useStyles = makeStyles(({ colors, typography }) => ({
 *       label: { ...typography.labelSemibold, color: colors.accent },
 *     }));
 *
 *     function Thing() {
 *       const styles = useStyles();
 *       ...
 *     }
 *
 * Why it caches
 *   The factory runs once per scheme, not once per render: results are cached on
 *   the scheme's `colors` object, which ThemeProvider shares across all
 *   consumers. Flipping light/dark builds the other sheet once and keeps both.
 */
import { StyleSheet } from 'react-native';

import { useTheme, type SchemeTheme } from './ThemeProvider';
import type { ColorTokens } from './tokens';

export function makeStyles<T extends StyleSheet.NamedStyles<T>>(
  factory: (theme: SchemeTheme) => T,
): () => T {
  const cache = new WeakMap<ColorTokens, T>();

  return function useStyles(): T {
    const theme = useTheme();
    let styles = cache.get(theme.colors);
    if (!styles) {
      styles = StyleSheet.create(factory(theme));
      cache.set(theme.colors, styles);
    }
    return styles;
  };
}
