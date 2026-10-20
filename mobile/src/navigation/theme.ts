/**
 * React Navigation theme.
 *
 * What this is for
 *   Telling React Navigation our colours, so the surfaces IT draws — the screen
 *   background behind a push transition, the card beneath a modal — match the
 *   app instead of defaulting to white.
 *
 * Why it is worth doing
 *   Without it there is a white flash at the edges of every push animation on a
 *   warm-cream app (or a glaring one in dark mode). It is a small thing that
 *   makes the difference between feeling designed and feeling assembled.
 *
 * Why it is a function
 *   The colours follow the live theme, so RootNavigator builds this from
 *   `useTheme()`. Built on React Navigation's own Dark/Default theme so its
 *   fonts and any colour we do not override suit the scheme.
 */
import { DarkTheme, DefaultTheme, type Theme } from '@react-navigation/native';

import type { ColorScheme, ColorTokens } from '@/theme';

export function getNavigationTheme(colors: ColorTokens, scheme: ColorScheme): Theme {
  const base = scheme === 'dark' ? DarkTheme : DefaultTheme;
  return {
    ...base,
    dark: scheme === 'dark',
    colors: {
      ...base.colors,
      primary: colors.accent,
      /** The ground behind screens, including mid-transition. */
      background: colors.bg,
      /** Headers and the tab bar, if a default one is ever used. */
      card: colors.tabBar,
      text: colors.text,
      border: colors.border,
      notification: colors.danger,
    },
  };
}
