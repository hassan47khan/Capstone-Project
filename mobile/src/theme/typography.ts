/**
 * Typography scale.
 *
 * What this is for
 *   Every font family, size, weight and letter spacing in the app. Screens never
 *   write `fontSize: 16` — they spread one of the roles `useTheme().typography`
 *   returns.
 *
 * The two families and why there are two
 *   DM Serif Display is the editorial voice: currency totals and screen titles.
 *   DM Sans is the interface voice: labels, body, captions, buttons. Both are
 *   Google Fonts under the SIL Open Font License, bundled via @expo-google-fonts.
 *
 * Optical size
 *   DM Sans is a variable font with an `opsz` axis and Figma sets `opsz: 14`
 *   throughout. React Native cannot set variation axes, so it is set by choice of
 *   file instead: the static faces in @expo-google-fonts/dm-sans are the opsz-14
 *   instance (checked in the files' STAT table). Nothing per text node.
 *
 * Why roles take colours
 *   The scale bakes in each role's default colour, and the colour depends on the
 *   live theme. So the scale is built by `createTypography(colors)` once per
 *   theme (memoized in ThemeProvider) rather than being a static object.
 *
 * Font weights in React Native
 *   RN cannot synthesise a weight from a single font file; it picks the family
 *   whose name matches. So each weight is a separately loaded family name, not a
 *   `fontWeight` property. `fonts.ts` loads exactly the faces named here.
 *
 * Dynamic Type
 *   Every role scales with the OS font-size setting (React Native's default).
 *   Nothing here or in a component may set `allowFontScaling={false}`.
 */
import type { TextStyle } from 'react-native';

import type { ColorTokens } from './tokens';

/**
 * Loaded font family names. These strings must match the keys passed to
 * `useFonts` in src/theme/fonts.ts exactly, or text silently falls back to the
 * system font and the design quietly breaks.
 */
export const fontFamily = {
  /** DM Serif Display — totals and titles. It has one weight. */
  display: 'DMSerifDisplay_400Regular',

  /** DM Sans — all interface text. */
  bodyRegular: 'DMSans_400Regular',
  bodyMedium: 'DMSans_500Medium',
  bodySemiBold: 'DMSans_600SemiBold',
  bodyBold: 'DMSans_700Bold',
} as const;

/**
 * Applied to every numeral so columns of money align: `tabular-nums` makes each
 * digit the same width, `lining-nums` keeps them on the baseline.
 */
export const numericVariant: Pick<TextStyle, 'fontVariant'> = {
  fontVariant: ['lining-nums', 'tabular-nums'],
};

/** Builds the type scale (01 §4) for one theme's colours. */
export function createTypography(colors: ColorTokens) {
  return {
    // --- Display (DM Serif Display) ------------------------------------------

    /** Large currency totals. */
    displayLg: {
      fontFamily: fontFamily.display,
      fontSize: 28,
      letterSpacing: -0.6,
      color: colors.text,
      ...numericVariant,
    },
    /** Screen and section titles. */
    displayMd: {
      fontFamily: fontFamily.display,
      fontSize: 24,
      letterSpacing: -0.4,
      color: colors.text,
    },

    // --- Interface (DM Sans) ---------------------------------------------------

    /** Input text, button labels. */
    bodyLg: {
      fontFamily: fontFamily.bodyRegular,
      fontSize: 15,
      color: colors.text,
    },
    /** Body copy. */
    bodyMd: {
      fontFamily: fontFamily.bodyRegular,
      fontSize: 14,
      color: colors.text,
    },
    /** Settings row labels. */
    labelMd: {
      fontFamily: fontFamily.bodyMedium,
      fontSize: 14,
      color: colors.text,
    },
    /** Field labels, list titles. */
    labelSemibold: {
      fontFamily: fontFamily.bodySemiBold,
      fontSize: 14,
      color: colors.text,
    },
    /** Category amounts. */
    labelBold: {
      fontFamily: fontFamily.bodyBold,
      fontSize: 14,
      color: colors.text,
      ...numericVariant,
    },
    /** Price badge primary figure. */
    price: {
      fontFamily: fontFamily.bodyBold,
      fontSize: 16,
      color: colors.accent,
      ...numericVariant,
    },
    /** "Next bill: …", helper text. The smallest size allowed for new text. */
    caption: {
      fontFamily: fontFamily.bodyRegular,
      fontSize: 12,
      color: colors.textMuted,
    },

    /** The value half of a two-tone row subtitle: "Oct 12, 2026" (02 §9). */
    captionStrong: {
      fontFamily: fontFamily.bodyMedium,
      fontSize: 12,
      color: colors.text,
    },
    /**
     * Section headers (02 §14). 02 asks for 11px; it is 12 because 01 §4 allows
     * no new text below the 12pt floor.
     */
    sectionLabel: {
      fontFamily: fontFamily.bodySemiBold,
      fontSize: 12,
      letterSpacing: 0.5,
      textTransform: 'uppercase',
      color: colors.textMuted,
    },
    /** Toast message — Figma node 3:955, DM Sans SemiBold 15 in `success`. */
    toast: {
      fontFamily: fontFamily.bodySemiBold,
      fontSize: 15,
      color: colors.success,
    },

    // --- Below the 12pt floor: deliberate, and never the sole carrier --------

    /** Tab bar labels. Allowed at 11 only because a 20px icon carries the meaning. */
    tab: {
      fontFamily: fontFamily.bodySemiBold,
      fontSize: 11,
      color: colors.textMuted,
    },
    /** The `/mo` suffix. Allowed at 10 only beside the 16px figure it qualifies. */
    micro: {
      fontFamily: fontFamily.bodyRegular,
      fontSize: 10,
      color: colors.textSubtle,
    },
  } satisfies Record<string, TextStyle>;
}

export type Typography = ReturnType<typeof createTypography>;
export type TypographyToken = keyof Typography;

/**
 * Caps how far the OS font-size setting can scale a given style.
 *
 * Layouts must survive the largest system font, but an unbounded multiplier
 * turns a display total into something that clips. Body and label text scale
 * freely; display type, already large, is capped.
 */
export const maxFontSizeMultiplier = {
  display: 1.4,
  body: undefined,
} as const;
