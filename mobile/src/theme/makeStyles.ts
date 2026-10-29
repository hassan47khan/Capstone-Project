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
import {
  StyleSheet,
  type ImageStyle,
  type TextStyle,
  type ViewStyle,
} from 'react-native';

import { useTheme, type SchemeTheme } from './ThemeProvider';
import type { ColorTokens } from './tokens';

/**
 * React Native 0.88's types no longer export `StyleSheet.NamedStyles`. This is its
 * old definition. It must stay a mapped type over `T` so each style literal keeps
 * its narrow types (`flexDirection: 'row'`, not `string`).
 */
type NamedStyles<T> = { [P in keyof T]: ViewStyle | TextStyle | ImageStyle };

export function makeStyles<T extends NamedStyles<T>>(
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
