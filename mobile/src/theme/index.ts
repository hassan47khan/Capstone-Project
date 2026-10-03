/**
 * Theme barrel.
 *
 * Everything visual is imported from `@/theme`, so a component never reaches
 * into an individual theme file. That keeps the "no raw hex, no raw font sizes"
 * rule to a single import line per file and makes it obvious in review when
 * something bypasses the system.
 */

export {
  CONTRAST_LARGE_TEXT_AND_GRAPHICS,
  CONTRAST_TEXT,
  contrastRatio,
} from './contrast';
export { fontAssets, useAppFonts } from './fonts';
export {
  CATEGORIES,
  CATEGORY_LABELS,
  categoryColors,
  colors,
  opacity,
  radius,
  sizes,
  spacing,
  tokens,
} from './tokens';
export type { Category, ColorToken, Tokens } from './tokens';
export {
  fontFamily,
  maxFontSizeMultiplier,
  numericVariant,
  typography,
} from './typography';
export type { TypographyToken } from './typography';
