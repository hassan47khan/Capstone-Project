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

    /** The hero currency total — Home's spend card (06 §2, 32/40). */
    displayLg: {
      fontFamily: fontFamily.display,
      fontSize: 32,
      lineHeight: 40,
      letterSpacing: -0.6,
      color: colors.text,
      ...numericVariant,
    },
    /** Screen titles, `Amount size="large"`, empty and error states. */
    displayMd: {
      fontFamily: fontFamily.display,
      fontSize: 24,
      letterSpacing: -0.4,
      color: colors.text,
    },
    /**
     * Screen header titles (03 §4) and bottom-sheet titles (02 §12). Named for
     * its job rather than its size: it sits between `displayMd` and
     * `displaySm`, and the 02 §12 sheets measured 20 on the destructive sheet.
     */
    displayTitle: {
      fontFamily: fontFamily.display,
      fontSize: 20,
      lineHeight: 28,
      letterSpacing: -0.3,
      color: colors.text,
    },
    /**
     * Section headers inside a screen — 06 §2 draws all three of Home's at
     * 18/24. 02 §12's currency sheet measured 18 too and was normalized up to
     * 20; this role is where that value belongs. Tracking is interpolated
     * between `displayTitle` (-0.3) and nothing smaller, flagged in 01 §4.
     */
    displaySm: {
      fontFamily: fontFamily.display,
      fontSize: 18,
      lineHeight: 24,
      letterSpacing: -0.25,
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
     * Section headers (02 §14). Bold 12 with +0.5 tracking, measured on the
     * Analytics group headers and the Detail price-history label. 02's earlier
     * 11px SemiBold was a misread, and 11 would have broken 01 §4's 12pt floor
     * for new text anyway.
     */
    sectionLabel: {
      fontFamily: fontFamily.bodyBold,
      fontSize: 12,
      letterSpacing: 0.5,
      textTransform: 'uppercase',
      color: colors.textMuted,
    },
    /** An AlertCard's first line — 02 §20 measures Bold 14/20 on node 4:2968. */
    alertTitle: {
      fontFamily: fontFamily.bodyBold,
      fontSize: 14,
      lineHeight: 20,
      color: colors.text,
    },
    /**
     * An AlertCard's body — Medium 12/16. `text`, not `textMuted`: muted grey on
     * the flattened warning tint is 4.22:1, an AA failure at 12px (01 §1).
     */
    alertBody: {
      fontFamily: fontFamily.bodyMedium,
      fontSize: 12,
      lineHeight: 16,
      color: colors.text,
    },
    /** The value between a Stepper's − and + (02 §16). */
    stepperValue: {
      fontFamily: fontFamily.bodyMedium,
      fontSize: 16,
      color: colors.text,
      ...numericVariant,
    },
    /** Toast message — Figma node 3:955, DM Sans SemiBold 15 in `success`. */
    toast: {
      fontFamily: fontFamily.bodySemiBold,
      fontSize: 15,
      color: colors.success,
    },

    // --- Below the 12pt floor: one role, and never the sole carrier ----------

    /**
     * Tab bar labels, and the only size under 12 in the app. Allowed at 11 only
     * because a 20px icon directly above it carries the meaning.
     *
     * There is no `micro` role. 01 §4 retires it and forbids building a 9 or
     * 10px style at all: both sub-12 sizes the prototype used carried
     * information of their own (the billing cycle, the active count), so both
     * were raised to `caption`.
     */
    tab: {
      fontFamily: fontFamily.bodySemiBold,
      fontSize: 11,
      color: colors.textMuted,
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
