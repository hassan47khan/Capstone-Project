/**
 * Design tokens — the single source of truth for colour, spacing, radius and size.
 *
 * What this is for
 *   Every visual constant in the app. Screens and components read colours from
 *   `useTheme()` and import the static scales from `@/theme`; the ESLint config
 *   forbids a raw hex value anywhere under src/features or src/components, so
 *   this file is the only place a colour is spelled out.
 *
 * Where the values come from
 *   Figma file kyUS7F8bg4x7GpcPEF4UDN ("Full Integrated Prototype Epic A, B, C"),
 *   variable collection `color/*`, as specified by handoff 01-design-tokens.md.
 *   The semantic names below match the Figma variable names so design and code
 *   refer to the same thing. Values that were hardcoded in Figma, derived, or
 *   changed for contrast are marked where they are declared; the full reasoning
 *   is in CONTRAST.md next to this file.
 *
 * How to change a colour
 *   Edit it here, then run `npm test`. tokens.test.ts recomputes every WCAG
 *   contrast pair from these values, in both themes, and fails if the change
 *   breaks one. Adjust the token until it passes — never the test.
 */

// --- Colour ----------------------------------------------------------------

/**
 * One theme's colours. Light and dark share these names exactly, so no
 * component ever references a theme directly — it asks `useTheme()` for
 * `colors.text` and gets whichever is live.
 */
export interface ColorTokens {
  /** Warm cream page background. */
  bg: string;
  /** Cards, rows, inputs. */
  surface: string;
  /** Bar-chart tracks, inset fills, muted chips. Never put `textMuted` on it. */
  surface2: string;
  /** Card borders and row dividers. Decorative: below 3:1 on purpose. */
  border: string;
  /**
   * Input outlines and secondary-button borders. Not in Figma: `border` is
   * 1.51:1 on white, and WCAG 1.4.11 needs a control's edge at 3:1.
   */
  borderControl: string;

  /** Primary text. */
  text: string;
  /** Secondary text, inactive tab labels. */
  textMuted: string;
  /** The `/mo` suffix on price badges. Darkened from Figma's #78817b (4.02:1). */
  textSubtle: string;

  /** Primary buttons, active tab, links, prices. */
  accent: string;
  /** Text and icons drawn on an `accent` fill. */
  onAccent: string;
  /** Selected rows, the "Active" badge, avatar backgrounds. */
  accentSurface: string;

  /** Positive figures, confirmation totals. */
  success: string;
  /** Pale green "Monthly Total" card fill. */
  successSurface: string;

  /** Destructive actions and validation errors ONLY. Never data. */
  danger: string;
  /** Errored-field background. */
  dangerSurface: string;

  /** Notice banner: background, border, text. Used for price changes. */
  noticeSurface: string;
  noticeBorder: string;
  noticeText: string;

  /** Bottom tab bar and sticky footers. */
  tabBar: string;
  /** Switch track when off. 3:1 on surface so "off" is visible, not just pale. */
  toggleOff: string;
}

export type ColorToken = keyof ColorTokens;

/** Light theme. The first ten are live Figma variables; see notes for the rest. */
export const lightColors: ColorTokens = {
  bg: '#f6f4ee',
  surface: '#ffffff',
  surface2: '#ece8de',
  border: '#d8d2c5',
  borderControl: '#8f897c',

  text: '#18272b',
  textMuted: '#626f6c',
  textSubtle: '#66706a',

  accent: '#105b5d',
  onAccent: '#ffffff',
  accentSurface: '#dbe8e5',

  success: '#267465',
  // Hardcoded in Figma; promoted per 01 §1.
  successSurface: '#e7f0e9',

  danger: '#b44735',
  dangerSurface: '#f9ece8',

  noticeSurface: '#f8ebcb',
  noticeBorder: '#e6cf98',
  noticeText: '#4e3703',

  // The Figma tab bar is plain surface.
  tabBar: '#ffffff',
  toggleOff: '#8b877d',
};

/**
 * Dark theme. Not drawn in Figma — derived to keep the same roles: a deep
 * teal-ink ground (the light theme's `text`, lifted), cream text, and a lighter
 * accent so it still reads at 4.5:1. Every pair is asserted in tokens.test.ts.
 */
export const darkColors: ColorTokens = {
  bg: '#121a1c',
  surface: '#1b2528',
  surface2: '#253033',
  border: '#34403f',
  borderControl: '#76827f',

  text: '#ece8de',
  textMuted: '#a7b0ad',
  textSubtle: '#959e99',

  accent: '#62b5ae',
  onAccent: '#0f1a1b',
  accentSurface: '#1d3a3a',

  success: '#6bbfa6',
  successSurface: '#1b3530',

  danger: '#e58a77',
  dangerSurface: '#3b2420',

  noticeSurface: '#3a3020',
  noticeBorder: '#6b5a33',
  noticeText: '#f0d9a0',

  tabBar: '#172123',
  toggleOff: '#76827f',
};

// --- Categories --------------------------------------------------------------

/**
 * The seven system categories (handoff 04 §Category).
 *
 * `CATEGORY_SLUGS` is what the API sends; `CategoryKey` is the camelCase token
 * key the server also returns as `color_token_key`. One taxonomy, used
 * everywhere — this replaced the specification's streaming/software/… enum.
 */
export const CATEGORY_SLUGS = [
  'entertainment',
  'productivity',
  'ai-tools',
  'cloud-storage',
  'news-media',
  'health-wellness',
  'other',
] as const;

export type Category = (typeof CATEGORY_SLUGS)[number];

export const CATEGORY_KEYS = [
  'entertainment',
  'productivity',
  'aiTools',
  'cloudStorage',
  'newsMedia',
  'healthWellness',
  'other',
] as const;

export type CategoryKey = (typeof CATEGORY_KEYS)[number];

export const categorySlugToKey: Record<Category, CategoryKey> = {
  entertainment: 'entertainment',
  productivity: 'productivity',
  'ai-tools': 'aiTools',
  'cloud-storage': 'cloudStorage',
  'news-media': 'newsMedia',
  'health-wellness': 'healthWellness',
  other: 'other',
};

/**
 * A subscription with no category (null). Distinct from the `other` category so
 * the two never render as the same word; it borrows `other`'s colour (US-8).
 */
export const UNCATEGORIZED_LABEL = 'Uncategorized';

/** Human-readable label for each category. */
export const CATEGORY_LABELS: Record<Category, string> = {
  entertainment: 'Entertainment',
  productivity: 'Productivity',
  'ai-tools': 'AI Tools',
  'cloud-storage': 'Cloud Storage',
  'news-media': 'News & Media',
  'health-wellness': 'Health & Wellness',
  other: 'Other',
};

export type CategoryColors = Record<CategoryKey, string>;

/**
 * One muted, low-chroma fill per category: chart bars, donut slices, legend
 * dots. Each is at least 3:1 on `surface`, `surface2` and `bg` (WCAG 1.4.11),
 * and colour never carries meaning alone — every use is paired with the label.
 *
 * Never use one for a destructive action, and never put an `entertainment`
 * dot next to a `danger` button: the hues are close (01 §2).
 */
export const lightCategoryColors: CategoryColors = {
  entertainment: '#be705e', // Figma
  productivity: '#9c7a2e', // Figma #b38b35, darkened: 2.58:1 on surface2
  aiTools: '#8a7798', // Figma donut legend, node 4:2957
  cloudStorage: '#507c92', // Figma donut legend, node 4:2952
  newsMedia: '#7c7a4a', // Derived — no fill in Figma
  healthWellness: '#547f78', // Figma #5d9088, darkened: 2.95:1 on surface2
  other: '#78746b', // Derived — neutral greige
};

export const darkCategoryColors: CategoryColors = {
  entertainment: '#d08a78',
  productivity: '#c9a55a',
  aiTools: '#a996b8',
  cloudStorage: '#7ba3b8',
  newsMedia: '#a8a571',
  healthWellness: '#7fb0a7',
  other: '#a39e93',
};

// --- Service tiles -------------------------------------------------------------

/** A service logo's circle fill and initial colour. */
export interface ServiceColors {
  tint: string;
  ink: string;
}

/**
 * Muted tint/ink pairs for a service with no catalog brand colour (01 §3).
 * Every `ink` meets 4.5:1 on its own `tint`.
 */
export const lightServicePalette: readonly ServiceColors[] = [
  { tint: '#f4e3dd', ink: '#8a3f2c' },
  { tint: '#f3ead3', ink: '#6b521b' },
  { tint: '#dfece9', ink: '#355f58' },
  { tint: '#e9e3ef', ink: '#5a4868' },
  { tint: '#dde7ee', ink: '#2f5468' },
  { tint: '#ebeadb', ink: '#55532f' },
  { tint: '#e9e7e2', ink: '#4f4b43' },
];

export const darkServicePalette: readonly ServiceColors[] = [
  { tint: '#3a2620', ink: '#e7a493' },
  { tint: '#3a3120', ink: '#dcc07f' },
  { tint: '#203532', ink: '#95c7bd' },
  { tint: '#2f2838', ink: '#c4b2d3' },
  { tint: '#1f2e38', ink: '#9cc0d3' },
  { tint: '#30301f', ink: '#c7c48e' },
  { tint: '#2c2a26', ink: '#c9c4b9' },
];

/**
 * Picks a service's colours from its name. Deterministic — never random — so
 * the same name is the same colour on every device and every launch.
 *
 * Case and surrounding whitespace are ignored, so "Netflix" and " netflix "
 * match.
 */
export function serviceTint(
  name: string,
  palette: readonly ServiceColors[] = lightServicePalette,
): ServiceColors {
  const key = name.trim().toLowerCase();
  // FNV-1a: tiny, stable across JS engines, and spreads short strings well.
  let hash = 0x811c9dc5;
  for (let i = 0; i < key.length; i += 1) {
    hash ^= key.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  // The palette is a non-empty constant, so the index is always in range.
  return palette[hash % palette.length] as ServiceColors;
}

// --- Spacing, radius, sizing -----------------------------------------------

/** 4pt base scale, as observed in the Figma file. */
export const spacing = {
  /** Icon-to-label gap in the tab bar. */
  xs: 4,
  /** Label-to-input gap, intra-group gap. */
  sm: 8,
  /** Logo-to-text gap in list rows. */
  md: 12,
  /** Row horizontal padding, screen gutter. */
  lg: 16,
  /** Summary-card inner padding. */
  xl: 20,
  /** Card padding, screen gutter on the 402-wide baseline. */
  xxl: 24,
} as const;

/**
 * Corner radii.
 *
 * `button` is 6, not the 5 Figma draws: cards are 6 and buttons 5, a 1px
 * difference that was almost certainly unintentional. Normalized to 6 per 01 §5
 * and flagged to the designer in CONTRAST.md.
 */
export const radius = {
  /** Cards, inputs, list rows, bar tracks. */
  card: 6,
  /** Buttons. */
  button: 6,
  /** Progress bars, chips, badges. */
  pill: 999,
  /** 40px service logo circles. */
  avatar: 20,
  /** 48px centre add button. */
  fab: 24,
} as const;

/** The floor for anything tappable. Graded, and enforced by component tests. */
export const touchTarget = {
  min: 44,
} as const;

/** The design baseline frame: iPhone 16 Pro. */
export const device = {
  baseline: 402,
} as const;

/**
 * Fixed component sizes carried over from Phase 0. Handoff 02 re-measures
 * every component against Figma and replaces these.
 */
export const sizes = {
  /** Minimum touch target — kept as an alias of `touchTarget.min`. */
  minTouch: touchTarget.min,
  /** Buttons and text inputs. */
  control: 52,
  /** Segmented control, inside a 4px-padded `surface2` track. */
  segmented: 48,
  /** Chips. */
  chip: 44,
  /** Subscription list rows (Figma sub-card: 72). */
  rowSubscription: 72,
  /** Settings list rows. */
  rowSettings: 56,
  /** Hairline divider. Pixel-snapping is left to React Native. */
  hairline: 1,
  /** Service logo circle in a list row, and the larger one on a detail screen. */
  tile: 40,
  tileLarge: 72,
  /** Height of a stacked bar and of a single category bar (Figma bar track: 12). */
  barStacked: 12,
  barRow: 12,
  /** Gap between stacked-bar segments. */
  barGap: 2,
} as const;

/** Opacity applied to a pressable while the finger is down, and when disabled. */
export const opacity = {
  pressed: 0.7,
  disabled: 0.45,
} as const;

export const tokens = {
  lightColors,
  darkColors,
  lightCategoryColors,
  darkCategoryColors,
  spacing,
  radius,
  touchTarget,
  device,
  sizes,
  opacity,
} as const;

export type Tokens = typeof tokens;
