/**
 * WCAG contrast arithmetic.
 *
 * What this is for
 *   Computing the contrast ratio between two colours, so tokens.test.ts can
 *   verify the palette rather than trusting that somebody checked it in Figma.
 *
 * Why it lives in src/ and not in the test file
 *   Keeping it importable means a future screen can assert its own pairs, and it
 *   documents the thresholds in one place rather than leaving 4.5 and 3.0 as
 *   magic numbers scattered through tests.
 *
 * How the maths works (WCAG 2.1, 1.4.3 and 1.4.11)
 *   1. Convert each 8-bit channel to the 0–1 range.
 *   2. Linearise it — undo the sRGB gamma curve, because the stored value is
 *      perceptual, not physical light.
 *   3. Weight the channels by how sensitive the eye is to each (green dominates).
 *      That gives relative luminance L.
 *   4. Ratio = (lighter + 0.05) / (darker + 0.05). The 0.05 models ambient screen
 *      glare, which is why pure black on pure white is 21:1 and not infinity.
 */

/** Minimum ratio for normal-sized text against its background. */
export const CONTRAST_TEXT = 4.5;

/**
 * Minimum ratio for large text (roughly 18pt+, or 14pt+ bold), for control
 * boundaries such as an input border, and for meaningful graphics such as a
 * category bar.
 */
export const CONTRAST_LARGE_TEXT_AND_GRAPHICS = 3;

/** Parses `#RGB` or `#RRGGBB` into three 0–255 channel values. */
function parseHex(hex: string): [number, number, number] {
  const cleaned = hex.replace('#', '');

  const full =
    cleaned.length === 3
      ? cleaned
          .split('')
          .map((c) => c + c)
          .join('')
      : cleaned;

  if (full.length !== 6 || !/^[0-9a-fA-F]{6}$/.test(full)) {
    throw new Error(`Not a hex colour: "${hex}"`);
  }

  return [
    parseInt(full.slice(0, 2), 16),
    parseInt(full.slice(2, 4), 16),
    parseInt(full.slice(4, 6), 16),
  ];
}

/**
 * Relative luminance of a colour, 0 (black) to 1 (white).
 *
 * The 0.03928 branch is the linear toe of the sRGB transfer curve: very dark
 * values are not gamma-encoded, so they are divided rather than raised to 2.4.
 */
export function relativeLuminance(hex: string): number {
  const [r, g, b] = parseHex(hex);

  const linear = [r, g, b].map((channel) => {
    const v = channel / 255;
    return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
  }) as [number, number, number];

  // Coefficients are the sRGB luminance weights: the eye is far more sensitive
  // to green than to blue, so green counts for ~72% of perceived brightness.
  return 0.2126 * linear[0] + 0.7152 * linear[1] + 0.0722 * linear[2];
}

/**
 * Contrast ratio between two colours, from 1 (identical) to 21 (black on white).
 * Order does not matter — the lighter colour is always the numerator.
 */
export function contrastRatio(a: string, b: string): number {
  const la = relativeLuminance(a);
  const lb = relativeLuminance(b);

  const lighter = Math.max(la, lb);
  const darker = Math.min(la, lb);

  return (lighter + 0.05) / (darker + 0.05);
}
