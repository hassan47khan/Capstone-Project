/**
 * Accessibility guard on the palette — both themes.
 *
 * What this is for
 *   Recomputes every colour pairing the design actually uses, in light AND dark,
 *   and fails if one drops below its WCAG threshold. Accessibility is graded,
 *   and contrast is the one part of it that can be proven by arithmetic rather
 *   than by eye. The human-readable version of these numbers is CONTRAST.md.
 *
 * How to read a failure
 *   The message names the theme, the pair and the ratio. Fix it by changing the
 *   TOKEN in tokens.ts until it passes — never by lowering the threshold here.
 *
 * What this does NOT prove
 *   That text is readable in practice. It checks foreground against the
 *   background we intend to draw it on; it cannot know if a screen puts muted
 *   text on `surface2`. That pair is deliberately below 4.5:1 and is forbidden
 *   by convention (see the last describe block), not by this arithmetic.
 */
import {
  CONTRAST_LARGE_TEXT_AND_GRAPHICS,
  CONTRAST_TEXT,
  contrastRatio,
  relativeLuminance,
} from './contrast';
import {
  CATEGORY_KEYS,
  CATEGORY_SLUGS,
  categorySlugToKey,
  darkCategoryColors,
  darkColors,
  darkServicePalette,
  lightCategoryColors,
  lightColors,
  lightServicePalette,
  opacity,
  serviceTint,
  type CategoryColors,
  type ColorTokens,
  type ServiceColors,
} from './tokens';

/** Formats a ratio as `6.24:1` for readable failure messages. */
const fmt = (n: number) => `${n.toFixed(2)}:1`;

/**
 * Asserts a pair meets its threshold, with a message that says what to do.
 * Written as a helper so every failure reads the same way.
 */
function expectContrast(
  label: string,
  foreground: string,
  background: string,
  minimum: number,
) {
  const ratio = contrastRatio(foreground, background);

  expect({ pair: label, ratio: fmt(ratio), meets: ratio >= minimum }).toEqual({
    pair: label,
    ratio: fmt(ratio),
    meets: true,
  });
}

/** The colour a translucent layer actually renders as, over an opaque ground. */
function composite(foreground: string, background: string, alpha: number): string {
  const channels = (hex: string) =>
    [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
  const fg = channels(foreground);
  const bg = channels(background);
  return `#${fg
    .map((value, i) =>
      Math.round(value * alpha + (bg[i] ?? 0) * (1 - alpha))
        .toString(16)
        .padStart(2, '0'),
    )
    .join('')}`;
}

interface ThemeUnderTest {
  name: 'light' | 'dark';
  colors: ColorTokens;
  categories: CategoryColors;
  services: readonly ServiceColors[];
}

const THEMES: ThemeUnderTest[] = [
  {
    name: 'light',
    colors: lightColors,
    categories: lightCategoryColors,
    services: lightServicePalette,
  },
  {
    name: 'dark',
    colors: darkColors,
    categories: darkCategoryColors,
    services: darkServicePalette,
  },
];

describe('contrast arithmetic', () => {
  // Sanity checks on the helper itself. If these drift, every assertion below
  // is meaningless, so they are tested first.
  it('computes the known extremes of the WCAG scale', () => {
    expect(contrastRatio('#000000', '#FFFFFF')).toBeCloseTo(21, 2);
    expect(contrastRatio('#FFFFFF', '#FFFFFF')).toBeCloseTo(1, 5);
  });

  it('is symmetric — argument order does not change the ratio', () => {
    expect(contrastRatio(lightColors.text, lightColors.bg)).toBeCloseTo(
      contrastRatio(lightColors.bg, lightColors.text),
      10,
    );
  });

  it('accepts shorthand hex', () => {
    expect(relativeLuminance('#FFF')).toBeCloseTo(relativeLuminance('#FFFFFF'), 10);
  });

  it('rejects anything that is not a hex colour', () => {
    expect(() => relativeLuminance('rebeccapurple')).toThrow(/Not a hex colour/);
  });

  it('reproduces the ratios 01 §6 states as already verified', () => {
    // If these move, either the arithmetic or a Figma value changed.
    expect(fmt(contrastRatio('#626f6c', '#f6f4ee'))).toBe('4.76:1');
    expect(fmt(contrastRatio('#105b5d', '#ffffff'))).toBe('7.85:1');
    expect(fmt(contrastRatio('#b44735', '#ffffff'))).toBe('5.39:1');
    expect(fmt(contrastRatio('#267465', '#e7f0e9'))).toBe('4.79:1');
  });
});

describe('light and dark share one shape', () => {
  it('defines the same colour names in both themes', () => {
    expect(Object.keys(darkColors).sort()).toEqual(Object.keys(lightColors).sort());
    expect(Object.keys(darkCategoryColors).sort()).toEqual(
      Object.keys(lightCategoryColors).sort(),
    );
    expect(darkServicePalette).toHaveLength(lightServicePalette.length);
  });
});

describe.each(THEMES)('$name theme', ({ name, colors, categories, services }) => {
  describe('text', () => {
    it.each([
      ['text on bg', 'text', 'bg'],
      ['text on surface', 'text', 'surface'],
      ['text on surface2', 'text', 'surface2'],
      ['textMuted on bg', 'textMuted', 'bg'],
      ['textMuted on surface', 'textMuted', 'surface'],
      ['textMuted on tabBar', 'textMuted', 'tabBar'],
      // The `/mo` suffix. Figma's #78817b was 4.02:1 here; darkened to pass.
      ['textSubtle on surface', 'textSubtle', 'surface'],
      ['textSubtle on bg', 'textSubtle', 'bg'],
      ['accent on surface', 'accent', 'surface'],
      ['accent on bg', 'accent', 'bg'],
      ['accent on accentSurface', 'accent', 'accentSurface'],
      ['accent on tabBar', 'accent', 'tabBar'],
      ['onAccent on accent', 'onAccent', 'accent'],
      // Pressed fills (02 §1) must keep the label readable mid-press.
      ['onAccent on accentPressed', 'onAccent', 'accentPressed'],
      // The destructive button: onAccent on a danger fill, and pressed.
      ['onAccent on danger', 'onAccent', 'danger'],
      ['onAccent on dangerPressed', 'onAccent', 'dangerPressed'],
      // Secondary/ghost buttons and pressed rows fill surface2.
      ['text on surface2', 'text', 'surface2'],
      ['accent on surface2', 'accent', 'surface2'],
      ['danger on surface', 'danger', 'surface'],
      ['danger on bg', 'danger', 'bg'],
      ['danger on dangerSurface', 'danger', 'dangerSurface'],
      ['success on successSurface', 'success', 'successSurface'],
      ['noticeText on noticeSurface', 'noticeText', 'noticeSurface'],
    ] as const)('%s meets 4.5:1', (label, fg, bg) => {
      expectContrast(`${name}: ${label}`, colors[fg], colors[bg], CONTRAST_TEXT);
    });
  });

  describe('control boundaries (WCAG 1.4.11)', () => {
    // The edge of an input or an off switch must be visible, or the control is
    // invisible to a low-vision user until they tap it. `border` itself is
    // decorative and deliberately lighter — it is not tested here.
    it.each([
      ['borderControl on surface', 'borderControl', 'surface'],
      ['borderControl on bg', 'borderControl', 'bg'],
      ['toggleOff on surface', 'toggleOff', 'surface'],
      // The toggle thumb (onAccent, 02 §7) against both of its tracks.
      ['thumb on toggle on', 'onAccent', 'accent'],
      ['thumb on toggle off', 'onAccent', 'toggleOff'],
    ] as const)('%s meets 3:1', (label, fg, bg) => {
      expectContrast(
        `${name}: ${label}`,
        colors[fg],
        colors[bg],
        CONTRAST_LARGE_TEXT_AND_GRAPHICS,
      );
    });
  });

  describe('disabled states', () => {
    // WCAG exempts inactive controls from contrast minimums, so these are not
    // held to 4.5:1. They are held to 2:1 so a disabled label is still legible
    // as a label — and the real figures are recorded in CONTRAST.md.
    const DISABLED_FLOOR = 2;

    it('disabled button label stays legible on its fill', () => {
      // 02 §1: a disabled button is surface2 with a textMuted label, at full
      // opacity — no translucency to composite.
      expectContrast(
        `${name}: disabled button label`,
        colors.textMuted,
        colors.surface2,
        DISABLED_FLOOR,
      );
    });

    it('disabled input text stays legible on its field', () => {
      // 02 §2: disabled fields are surface2 with textMuted text.
      expectContrast(
        `${name}: disabled input text`,
        colors.textMuted,
        colors.surface2,
        DISABLED_FLOOR,
      );
    });

    it('the old translucent disabled style still clears the floor', () => {
      // Kept for primitives with no designed disabled state (opacity.disabled).
      const fill = composite(colors.accent, colors.bg, opacity.disabled);
      const label = composite(colors.onAccent, colors.bg, opacity.disabled);
      expectContrast(`${name}: dimmed button label`, label, fill, DISABLED_FLOOR);
    });
  });

  describe('categories', () => {
    // Bars, donut slices and legend dots are graphical objects carrying meaning:
    // 3:1 against whatever they are drawn on. Bars sit on a surface2 track,
    // legend dots on surface, and section dots on bg.
    it.each(CATEGORY_KEYS)('%s meets 3:1 on surface, surface2 and bg', (key) => {
      for (const ground of ['surface', 'surface2', 'bg'] as const) {
        expectContrast(
          `${name}: ${key} on ${ground}`,
          categories[key],
          colors[ground],
          CONTRAST_LARGE_TEXT_AND_GRAPHICS,
        );
      }
    });

    it('gives every category a distinct colour', () => {
      // Two categories sharing a colour would make a chart unreadable even
      // though each one individually passes its contrast check.
      const values = CATEGORY_KEYS.map((key) => categories[key].toLowerCase());
      expect(new Set(values).size).toBe(CATEGORY_KEYS.length);
    });

    it('never reuses danger as a category colour', () => {
      // 01 §2: danger is for destructive actions and errors only, never data.
      // The Figma donut legend broke this; the token layer cannot.
      const values = CATEGORY_KEYS.map((key) => categories[key].toLowerCase());
      expect(values).not.toContain(colors.danger.toLowerCase());
    });
  });

  describe('service tiles', () => {
    it.each(services.map((pair, i) => [i, pair] as const))(
      'palette entry %i: ink on tint meets 4.5:1',
      (i, { ink, tint }) => {
        expectContrast(`${name}: service ${i} ink on tint`, ink, tint, CONTRAST_TEXT);
      },
    );
  });
});

describe('app.config splash', () => {
  it('uses the same page ground as the theme, in both appearances', () => {
    // A mismatch shows as a flash of a different colour on every cold start.
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const makeConfig = require('../../app.config').default as (ctx: {
      config: object;
    }) => { plugins: unknown[] };
    const plugins = makeConfig({ config: {} }).plugins;
    const splash = plugins.find(
      (
        p,
      ): p is [string, { backgroundColor: string; dark: { backgroundColor: string } }] =>
        Array.isArray(p) && p[0] === 'expo-splash-screen',
    );

    expect(splash?.[1].backgroundColor).toBe(lightColors.bg);
    expect(splash?.[1].dark.backgroundColor).toBe(darkColors.bg);
  });
});

describe('category taxonomy', () => {
  it('maps every API slug to a colour token key', () => {
    // Handoff 04: one taxonomy. A slug without a key would render uncoloured.
    for (const slug of CATEGORY_SLUGS) {
      expect(CATEGORY_KEYS).toContain(categorySlugToKey[slug]);
    }
    expect(new Set(Object.values(categorySlugToKey)).size).toBe(CATEGORY_KEYS.length);
  });
});

describe('serviceTint', () => {
  it('is deterministic, and ignores case and surrounding space', () => {
    expect(serviceTint('Northside Gym')).toEqual(serviceTint('Northside Gym'));
    expect(serviceTint('  NORTHSIDE gym ')).toEqual(serviceTint('Northside Gym'));
  });

  it('spreads different names across the palette', () => {
    const names = ['Netflix', 'Spotify', 'Adobe CC', 'iCloud+', 'Headspace', 'Hulu'];
    const tints = new Set(names.map((n) => serviceTint(n).tint));
    expect(tints.size).toBeGreaterThan(2);
  });
});

describe('convention: no muted text on surface2', () => {
  it('documents why — the pair is below AA in the light theme', () => {
    // textMuted on surface2 is 4.28:1. Rather than darken the muted grey for
    // every screen, muted text is never placed on a surface2 fill. If this test
    // starts failing, the pair now passes and the convention can be dropped.
    expect(contrastRatio(lightColors.textMuted, lightColors.surface2)).toBeLessThan(
      CONTRAST_TEXT,
    );
  });
});
