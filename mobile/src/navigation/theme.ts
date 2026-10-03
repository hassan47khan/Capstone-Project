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
 *   warm-paper app. It is a small thing that makes the difference between
 *   feeling designed and feeling assembled.
 */
import { DefaultTheme, type Theme } from '@react-navigation/native';

import { colors } from '@/theme';

export const navigationTheme: Theme = {
  ...DefaultTheme,
  colors: {
    ...DefaultTheme.colors,
    primary: colors.accent,
    /** The ground behind screens, including mid-transition. */
    background: colors.paper,
    /** Headers and the tab bar, if a default one is ever used. */
    card: colors.tabBg,
    text: colors.ink,
    border: colors.line,
    notification: colors.danger,
  },
};
