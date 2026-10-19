/**
 * Theme barrel.
 *
 * Everything visual is imported from `@/theme`, so a component never reaches
 * into an individual theme file. Colours come from `useTheme()` (or a
 * `makeStyles` factory), never from `lightColors`/`darkColors` directly — those
 * are exported for the contrast tests and app.config only.
 */

export {
  CONTRAST_LARGE_TEXT_AND_GRAPHICS,
  CONTRAST_TEXT,
  contrastRatio,
} from './contrast';
export { fontAssets, useAppFonts } from './fonts';
export { makeStyles } from './makeStyles';
export { schemeThemes, ThemeProvider, useTheme } from './ThemeProvider';
export type {
  ColorScheme,
  SchemeTheme,
  Theme,
  ThemePreference,
  ThemeProviderProps,
} from './ThemeProvider';
export {
  CATEGORY_KEYS,
  CATEGORY_LABELS,
  UNCATEGORIZED_LABEL,
  CATEGORY_SLUGS,
  categorySlugToKey,
  darkCategoryColors,
  darkColors,
  darkServicePalette,
  device,
  lightCategoryColors,
  lightColors,
  lightServicePalette,
  opacity,
  radius,
  serviceTint,
  sizes,
  spacing,
  tokens,
  touchTarget,
} from './tokens';
export type {
  Category,
  CategoryColors,
  CategoryKey,
  ColorToken,
  ColorTokens,
  ServiceColors,
  Tokens,
} from './tokens';
export {
  createTypography,
  fontFamily,
  maxFontSizeMultiplier,
  numericVariant,
} from './typography';
export type { Typography, TypographyToken } from './typography';
