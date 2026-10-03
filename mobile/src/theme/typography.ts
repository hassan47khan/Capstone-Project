/**
 * Typography scale.
 *
 * What this is for
 *   Every font family, size, weight, line height and letter spacing in the app.
 *   Screens never write `fontSize: 16` — they spread one of these objects.
 *
 * The two families and why there are two
 *   Newsreader (a serif) is the editorial voice: amounts, screen titles, monogram
 *   letters. Hanken Grotesk (a grotesque sans) is the interface voice: labels,
 *   body copy, captions, buttons. The split is what makes an amount read as a
 *   figure worth noticing rather than another line of UI.
 *
 * Why `fontVariant` is on every amount
 *   `tabular-nums` makes every digit the same width, so a column of prices lines
 *   up on the decimal point instead of jittering. `lining-nums` stops Newsreader
 *   from rendering old-style numerals, where 3, 4, 7 and 9 drop below the
 *   baseline — correct for prose, wrong for money.
 *
 * Font weights in React Native
 *   RN cannot synthesise a weight from a single font file; it picks the family
 *   whose name matches. So each weight is a separately loaded family name, not a
 *   `fontWeight` property. `fonts.ts` loads exactly the faces named here.
 */
import type { TextStyle } from 'react-native';

import { colors } from './tokens';

/**
 * Loaded font family names. These strings must match the keys passed to
 * `useFonts` in src/theme/fonts.ts exactly, or text silently falls back to the
 * system font and the design quietly breaks.
 */
export const fontFamily = {
  /** Newsreader — amounts, titles, monograms. */
  displayRegular: 'Newsreader_400Regular',
  displayMedium: 'Newsreader_500Medium',
  displaySemiBold: 'Newsreader_600SemiBold',

  /** Hanken Grotesk — all interface text. */
  bodyRegular: 'HankenGrotesk_400Regular',
  bodyMedium: 'HankenGrotesk_500Medium',
  bodySemiBold: 'HankenGrotesk_600SemiBold',
  bodyBold: 'HankenGrotesk_700Bold',
} as const;

/** Applied to every numeral so columns of money align. See the note above. */
export const numericVariant: Pick<TextStyle, 'fontVariant'> = {
  fontVariant: ['lining-nums', 'tabular-nums'],
};

/**
 * The type scale.
 *
 * Sizes are taken from the prototype. Where the design shows "32 / 38" that is
 * size over line height.
 */
export const typography = {
  // --- Display (Newsreader) ------------------------------------------------

  /** The hero amount on Home and Insights. The dollars half of an `Amount`. */
  amountHero: {
    fontFamily: fontFamily.displayMedium,
    fontSize: 52,
    lineHeight: 58,
    color: colors.ink,
    ...numericVariant,
  },
  /** The cents half of a hero amount — smaller and `ink2`, as the design shows. */
  amountHeroCents: {
    fontFamily: fontFamily.displayMedium,
    fontSize: 32,
    lineHeight: 36,
    color: colors.ink2,
    ...numericVariant,
  },
  /** A secondary amount: the paired figure on Insights, the price on a detail screen. */
  amountLarge: {
    fontFamily: fontFamily.displayMedium,
    fontSize: 32,
    lineHeight: 38,
    color: colors.ink,
    ...numericVariant,
  },
  amountLargeCents: {
    fontFamily: fontFamily.displayMedium,
    fontSize: 20,
    lineHeight: 26,
    color: colors.ink2,
    ...numericVariant,
  },

  /** Tab-screen title: "Overview", "Subscriptions", "Insights", "Settings". */
  screenTitle: {
    fontFamily: fontFamily.displayMedium,
    fontSize: 32,
    lineHeight: 38,
    // Large serif at this size needs negative tracking or it reads as too loose.
    // -0.015em at 32px is -0.48px.
    letterSpacing: -0.48,
    color: colors.ink,
  },
  /** The Welcome screen headline only — "Know what you pay, before it renews." */
  onboardingTitle: {
    fontFamily: fontFamily.displayMedium,
    fontSize: 46,
    lineHeight: 50,
    letterSpacing: -0.69,
    color: colors.ink,
  },
  /** Auth screen titles — "Create your account", "Welcome back". */
  authTitle: {
    fontFamily: fontFamily.displayMedium,
    fontSize: 34,
    lineHeight: 40,
    letterSpacing: -0.51,
    color: colors.ink,
  },

  // --- Interface (Hanken Grotesk) ------------------------------------------

  /** List-row title: a subscription name, a settings row label. */
  rowTitle: {
    fontFamily: fontFamily.bodySemiBold,
    fontSize: 16,
    lineHeight: 22,
    color: colors.ink,
  },
  /** Default body copy. */
  body: {
    fontFamily: fontFamily.bodyRegular,
    fontSize: 15,
    lineHeight: 22,
    color: colors.ink2,
  },
  /** Body copy that carries weight — a supporting sentence under a headline. */
  bodyLarge: {
    fontFamily: fontFamily.bodyRegular,
    fontSize: 17,
    lineHeight: 26,
    color: colors.ink2,
  },
  /** Field label above an input. Always visible — never a placeholder-only label. */
  fieldLabel: {
    fontFamily: fontFamily.bodySemiBold,
    fontSize: 14,
    lineHeight: 20,
    color: colors.ink,
  },
  /** Helper text under a field, and list-row subtitles. */
  caption: {
    fontFamily: fontFamily.bodyRegular,
    fontSize: 13,
    lineHeight: 18,
    color: colors.ink3,
  },
  /** Section eyebrow above a title, and grouped-list section headers. */
  eyebrow: {
    fontFamily: fontFamily.bodyRegular,
    fontSize: 13,
    lineHeight: 18,
    color: colors.ink3,
  },
  /** Button text. */
  button: {
    fontFamily: fontFamily.bodySemiBold,
    fontSize: 16,
    lineHeight: 22,
  },
  /** Bottom-tab label. */
  tabLabel: {
    fontFamily: fontFamily.bodyMedium,
    fontSize: 12,
    lineHeight: 16,
  },
  /** Badge and chip text. */
  badge: {
    fontFamily: fontFamily.bodySemiBold,
    fontSize: 13,
    lineHeight: 18,
  },
} as const;

export type TypographyToken = keyof typeof typography;

/**
 * Caps how far the OS font-size setting can scale a given style.
 *
 * Layouts must survive the largest system font (prompt section 10), but an
 * unbounded multiplier turns a 52px hero amount into something that clips. The
 * rule we apply: body and label text scales freely (no cap), while display type
 * that is already large is capped — it is big enough to read at 1.0 and growing
 * it further only costs layout.
 */
export const maxFontSizeMultiplier = {
  display: 1.4,
  body: undefined,
} as const;
