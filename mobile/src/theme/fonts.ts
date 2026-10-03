/**
 * Font loading.
 *
 * What this is for
 *   Loading the two type families the design uses, and telling the app when they
 *   are ready.
 *
 * Why render is blocked until they load
 *   React Native silently falls back to the system font for a family it does not
 *   have. If the app rendered before the fonts arrived, every screen would flash
 *   from system-sans to Newsreader a moment later — and worse, the fallback
 *   metrics differ enough that the layout visibly reflows. One short splash is
 *   better than a visible lurch on every cold start.
 *
 * Which weights, and why only these
 *   Each weight is a separate font file, and every one adds to the bundle. These
 *   seven are exactly the faces src/theme/typography.ts names — nothing is
 *   loaded "just in case". If you add a weight to the type scale, add it here
 *   too, or text using it will silently render in the system font.
 */
import {
  HankenGrotesk_400Regular,
  HankenGrotesk_500Medium,
  HankenGrotesk_600SemiBold,
  HankenGrotesk_700Bold,
} from '@expo-google-fonts/hanken-grotesk';
import {
  Newsreader_400Regular,
  Newsreader_500Medium,
  Newsreader_600SemiBold,
} from '@expo-google-fonts/newsreader';
import { useFonts } from 'expo-font';

/**
 * The font map. Keys become the `fontFamily` strings used in styles, so they
 * must match `fontFamily` in typography.ts exactly — a typo here produces no
 * error, just the wrong typeface.
 */
export const fontAssets = {
  // Newsreader — amounts, screen titles, monogram letters.
  Newsreader_400Regular,
  Newsreader_500Medium,
  Newsreader_600SemiBold,

  // Hanken Grotesk — all interface text.
  HankenGrotesk_400Regular,
  HankenGrotesk_500Medium,
  HankenGrotesk_600SemiBold,
  HankenGrotesk_700Bold,
};

/**
 * Loads the fonts.
 *
 * @returns `[loaded, error]`. `loaded` is false on the first render and true
 *   once the files are ready. `error` is non-null if loading failed — the app
 *   should render anyway in that case rather than hanging on a splash screen
 *   forever, accepting system fonts as a degraded but usable result.
 */
export function useAppFonts(): [boolean, Error | null] {
  const [loaded, error] = useFonts(fontAssets);
  return [loaded, error ?? null];
}
