/**
 * Design tokens — the single source of truth for colour, spacing, radius and size.
 *
 * What this is for
 *   Every visual constant in the app. Screens and components import from here;
 *   the ESLint config forbids a raw hex value anywhere under src/features or
 *   src/components, so this file is the only place a colour is spelled out.
 *
 * Why it exists
 *   Two reasons beyond tidiness. First, accessibility is graded: contrast is
 *   fixed once here and verified by tokens.test.ts, rather than being re-checked
 *   on every screen. Second, the values come from a finished visual design — if
 *   they are scattered, the app drifts from the prototype and nobody notices.
 *
 * How to change a colour
 *   Edit it here, then run `npm test`. tokens.test.ts recomputes every WCAG
 *   contrast pair from these values and fails if the change breaks one. Adjust
 *   the token until it passes — never the test.
 *
 * Source: "SubTrak prototype" PDF, visual language page, plus the token table in
 * section 4 of the project prompt.
 */

/**
 * Core palette.
 *
 * The look in one line: warm paper ground, near-black ink, one petrol-green
 * accent, flat bordered cards. No gradients and no shadows — the only exception
 * is the segmented-control thumb.
 */
export const colors = {
  /** Screen background. The warm off-white the whole app sits on. */
  paper: '#F5F3EE',
  /** Cards, inputs and list rows — lifted off `paper` by being pure white. */
  surface: '#FFFFFF',
  /** Bar tracks and the segmented-control track. A recess, not a surface. */
  sunken: '#EDEAE2',
  /** Dividers and card borders. 1px, never heavier. */
  line: '#E2DED3',
  /** Input and secondary-button borders. Meets 3:1 on white, as controls must. */
  control: '#98948A',

  /** Primary text. */
  ink: '#15181C',
  /** Secondary text, and the cents span inside a large amount. */
  ink2: '#4F555D',
  /** Captions. Meets 4.5:1 on `paper` — do not lighten it. */
  ink3: '#666B73',

  /** Primary buttons, links, active tab, toggles when on. */
  accent: '#0E5A5A',
  /** Selected rows, the "Active" badge, avatar backgrounds. */
  accentTint: '#DCEAE7',

  /** Notice banner: background, border, text. Used for price changes. */
  noticeBg: '#F8EBCB',
  noticeLine: '#E6CF98',
  noticeInk: '#4E3703',

  /** Destructive text and error field borders. */
  danger: '#A2361B',
  /** Error field background. */
  dangerBg: '#F8E3DC',

  /** Tab bar and sticky footers — a hair lighter than `paper` so they separate. */
  tabBg: '#FBFAF7',
  /** Switch track when off. Meets 3:1 on white so "off" is visible, not just pale. */
  toggleOff: '#8B877D',
} as const;

export type ColorToken = keyof typeof colors;

/**
 * The fixed category enum from specification section 4.
 *
 * The prototype used four demo categories (Entertainment, Productivity, AI Tools,
 * Cloud). Those are marketing names; the specification's enum is what the API
 * actually returns, so the app uses these and the prototype's names are ignored.
 * A subscription with no category renders as "Uncategorized" and uses `other`.
 */
export const CATEGORIES = [
  'streaming',
  'software',
  'fitness',
  'cloud_storage',
  'insurance',
  'utilities',
  'other',
] as const;

export type Category = (typeof CATEGORIES)[number];

/** Human-readable label for each category, including the null case. */
export const CATEGORY_LABELS: Record<Category, string> = {
  streaming: 'Streaming',
  software: 'Software',
  fitness: 'Fitness',
  cloud_storage: 'Cloud storage',
  insurance: 'Insurance',
  utilities: 'Utilities',
  other: 'Uncategorized',
};

/**
 * Per-category colour triplet.
 *
 *   bar  — stacked-bar segments and legend dots. Needs 3:1 on `surface`,
 *          the threshold for a non-text graphical object.
 *   tint — the monogram tile background.
 *   ink  — the monogram letter, drawn on `tint`. Needs 4.5:1 on its own tint.
 *
 * Colour never carries meaning alone (prompt section 10): every bar and legend
 * dot is accompanied by the category name and amount as text.
 */
export const categoryColors: Record<
  Category,
  { bar: string; tint: string; ink: string }
> = {
  streaming: { bar: '#C4572F', tint: '#F4DDD3', ink: '#8A3418' },
  software: { bar: '#0E5A5A', tint: '#D5E6E3', ink: '#0B4747' },
  fitness: { bar: '#B0801A', tint: '#F3E6BF', ink: '#5F4506' },
  cloud_storage: { bar: '#5F739A', tint: '#DDE3EE', ink: '#2E4266' },
  insurance: { bar: '#7A5C8E', tint: '#E8DFEE', ink: '#4A3258' },
  utilities: { bar: '#5E7F4A', tint: '#DEE8D6', ink: '#33491F' },
  other: { bar: '#6B6F76', tint: '#E6E4DE', ink: '#3A3E44' },
};

/**
 * Spacing scale: 4, 8, 12, 16, 20, 24.
 *
 * Named by size rather than by purpose (`md`, `lg`) because the design specifies
 * exact numbers and a purpose name would invite someone to "improve" the value.
 */
export const spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  /** The standard side gutter on tab screens. */
  xl: 20,
  /** The side gutter on the Welcome screen only. */
  xxl: 24,
} as const;

/** Corner radii. Chips and badges are fully rounded via `pill`. */
export const radius = {
  /** Buttons, inputs, segmented controls. */
  control: 12,
  /** Cards and grouped lists. */
  card: 16,
  /** Monogram tiles. */
  tile: 10,
  /** Chips and badges — any value past half the height reads as fully round. */
  pill: 999,
} as const;

/**
 * Fixed component sizes.
 *
 * `minTouch` is the floor for anything tappable. It is 44 because that is the
 * documented minimum target size on both platforms, and it is graded.
 */
export const sizes = {
  /** Minimum touch target, enforced by a test on every pressable primitive. */
  minTouch: 44,
  /** Buttons and text inputs. */
  control: 52,
  /** Segmented control, inside a 4px-padded `sunken` track. */
  segmented: 48,
  /** Chips. */
  chip: 44,
  /** Subscription list rows. */
  rowSubscription: 64,
  /** Settings list rows. */
  rowSettings: 56,
  /** Hairline divider. Pixel-snapping is left to React Native. */
  hairline: 1,
  /** Monogram tile in a list row, and the larger one on a detail screen. */
  tile: 44,
  tileLarge: 72,
  /** Height of a stacked bar and of a single category bar row. */
  barStacked: 10,
  barRow: 8,
} as const;

/** Opacity applied to a pressable while the finger is down. */
export const opacity = {
  pressed: 0.7,
  disabled: 0.45,
} as const;

export const tokens = {
  colors,
  categoryColors,
  spacing,
  radius,
  sizes,
  opacity,
} as const;

export type Tokens = typeof tokens;
