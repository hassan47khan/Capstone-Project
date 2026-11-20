/**
 * Contrast audit of a rendered screen (11 §3.5).
 *
 * What this is for
 *   Proving a screen is readable in a theme by measuring what it actually
 *   renders, rather than trusting that every token pair in CONTRAST.md is the
 *   pair a screen ends up using. It walks the host tree React Native would draw
 *   and, for every piece of text, measures its colour against the ground it
 *   sits on: the nearest ancestor `backgroundColor`, with translucent fills and
 *   `opacity` flattened onto what is under them, starting from the page `bg`.
 *
 * It also catches a light-theme leak: any colour on a dark render that belongs
 * to the light token set and not to the dark one.
 *
 * What it does NOT prove
 *   React Test Renderer has no layout, so "the ground" is the tree parent, not
 *   whatever is painted behind the text. An absolutely positioned label over a
 *   sibling is measured against its parent. Every screen in this app places text
 *   inside the view that paints its fill, so the two agree; a new overlay would
 *   need its own check.
 *
 * What it exempts, as WCAG does
 *   - Inactive controls (`accessibilityState.disabled`, or `aria-disabled`).
 *   - Decorative subtrees hidden from assistive tech
 *     (`importantForAccessibility="no-hide-descendants"` or
 *     `accessibilityElementsHidden`): service marks, skeletons, and chart
 *     labels whose figures are stated in text beside the chart.
 *   - Placeholder text in an empty input is measured as text.
 */
import {
  CONTRAST_LARGE_TEXT_AND_GRAPHICS,
  CONTRAST_TEXT,
  contrastRatio,
  type ColorTokens,
} from '@/theme';

/** One host node as `toJSON()` returns it. */
interface HostNode {
  type: string;
  props: Record<string, unknown>;
  children: (HostNode | string)[] | null;
}

type Rgba = [number, number, number, number];

export interface ContrastFinding {
  text: string;
  fg: string;
  bg: string;
  ratio: number;
  needs: number;
}

export interface ContrastAudit {
  /** Every distinct (text colour, ground) pair the screen renders. */
  pairs: ContrastFinding[];
  /** The pairs below their threshold. */
  failures: ContrastFinding[];
  /** Colours from the other theme's token set that are not in this one's. */
  leaks: string[];
  /** How many text runs were measured. */
  measured: number;
}

const COLOR_PROPS = [
  'color',
  'backgroundColor',
  'borderColor',
  'borderTopColor',
  'borderBottomColor',
  'borderLeftColor',
  'borderRightColor',
  'tintColor',
  'shadowColor',
  'textDecorationColor',
] as const;

const SHAPE_PROPS = ['fill', 'stroke', 'color', 'stopColor'] as const;

/** Parses `#rgb`, `#rrggbb`, `#rrggbbaa`, `rgb()`, `rgba()` and an SVG's processed colour. Null for anything else. */
export function parseColor(value: unknown): Rgba | null {
  // react-native-svg hands its native view a processed colour: `processColor`'s
  // 0xAARRGGBB integer, wrapped as `{ type: 0, payload }`.
  if (value && typeof value === 'object' && 'payload' in value) {
    const n = (value as { payload: unknown }).payload;
    if (typeof n !== 'number') return null;
    return [(n >>> 16) & 255, (n >>> 8) & 255, n & 255, ((n >>> 24) & 255) / 255];
  }
  if (typeof value !== 'string') return null;
  const v = value.trim().toLowerCase();
  if (v === 'transparent') return [0, 0, 0, 0];

  const hex = v.match(/^#([0-9a-f]{3}|[0-9a-f]{6}|[0-9a-f]{8})$/);
  if (hex) {
    let h = hex[1] ?? '';
    if (h.length === 3) h = h.replace(/./g, (c) => c + c);
    const alpha = h.length === 8 ? parseInt(h.slice(6, 8), 16) / 255 : 1;
    return [
      parseInt(h.slice(0, 2), 16),
      parseInt(h.slice(2, 4), 16),
      parseInt(h.slice(4, 6), 16),
      alpha,
    ];
  }

  const fn = v.match(
    /^rgba?\(\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)\s*(?:,\s*([\d.]+)\s*)?\)$/,
  );
  if (fn) {
    return [
      Number(fn[1]),
      Number(fn[2]),
      Number(fn[3]),
      fn[4] === undefined ? 1 : Number(fn[4]),
    ];
  }
  return null;
}

/** Paints `top` over an opaque `under`, at `top`'s alpha times `opacity`. */
function over(top: Rgba, under: Rgba, opacity = 1): Rgba {
  const a = top[3] * opacity;
  return [
    top[0] * a + under[0] * (1 - a),
    top[1] * a + under[1] * (1 - a),
    top[2] * a + under[2] * (1 - a),
    1,
  ];
}

function toHex([r, g, b]: Rgba): string {
  return `#${[r, g, b].map((c) => Math.round(c).toString(16).padStart(2, '0')).join('')}`;
}

function flatten(style: unknown): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  const visit = (s: unknown) => {
    if (Array.isArray(s)) s.forEach(visit);
    else if (s && typeof s === 'object') Object.assign(out, s);
  };
  visit(style);
  return out;
}

/**
 * WCAG "large text": 18pt (24px) regular, or 14pt (18.66px) bold. Only DM Sans
 * Bold counts as bold; SemiBold is held to the text threshold, which is the
 * conservative reading.
 */
function thresholdFor(style: Record<string, unknown>): number {
  const size = typeof style.fontSize === 'number' ? style.fontSize : 14;
  const family = typeof style.fontFamily === 'string' ? style.fontFamily : '';
  const bold =
    /_700Bold$/.test(family) || style.fontWeight === '700' || style.fontWeight === 'bold';
  return size >= 24 || (bold && size >= 18.66)
    ? CONTRAST_LARGE_TEXT_AND_GRAPHICS
    : CONTRAST_TEXT;
}

function textOf(node: HostNode | string): string {
  if (typeof node === 'string') return node;
  return (node.children ?? []).map(textOf).join('');
}

function isDisabled(props: Record<string, unknown>): boolean {
  const state = props.accessibilityState as { disabled?: boolean } | undefined;
  return state?.disabled === true || props['aria-disabled'] === true;
}

function isHidden(props: Record<string, unknown>): boolean {
  return (
    props.importantForAccessibility === 'no-hide-descendants' ||
    props.accessibilityElementsHidden === true ||
    props['aria-hidden'] === true
  );
}

function tokenColors(colors: ColorTokens, extra: readonly string[] = []): Set<string> {
  const set = new Set<string>();
  for (const value of [...Object.values(colors), ...extra]) {
    const parsed = parseColor(value);
    if (parsed) set.add(`${toHex(parsed)}/${parsed[3].toFixed(2)}`);
  }
  return set;
}

/**
 * Audits a rendered tree.
 *
 * @param root    `screen.toJSON()`
 * @param colors  the live theme's tokens; `bg` is the starting ground
 * @param other   the other theme's token values, for the leak check
 * @param own     extra values that belong to this theme (category, service palettes)
 */
export function auditContrast(
  root: unknown,
  colors: ColorTokens,
  other: readonly string[],
  own: readonly string[] = [],
): ContrastAudit {
  const page = parseColor(colors.bg) as Rgba;
  const mine = tokenColors(colors, own);
  const theirs = tokenColors({} as ColorTokens, other);
  const pairs = new Map<string, ContrastFinding>();
  const leaks = new Set<string>();
  let measured = 0;

  const walk = (
    node: HostNode | string,
    ground: Rgba,
    opacity: number,
    inherited: Record<string, unknown>,
    exempt: boolean,
  ) => {
    if (typeof node === 'string') return;
    const own = flatten(node.props.style);

    // Style colours, plus the colour props an SVG shape or an icon takes
    // directly (a chart's fill and stroke, a Lucide icon's color).
    const painted: [string, unknown][] = [
      ...COLOR_PROPS.map((key) => [key, own[key]] as [string, unknown]),
      ...SHAPE_PROPS.map(
        (key) => [`${node.type}.${key}`, node.props[key]] as [string, unknown],
      ),
    ];
    for (const [key, value] of painted) {
      const parsed = parseColor(value);
      if (!parsed || parsed[3] === 0) continue;
      const id = `${toHex(parsed)}/${parsed[3].toFixed(2)}`;
      if (theirs.has(id) && !mine.has(id)) {
        leaks.add(
          `${key} ${toHex(parsed)}${parsed[3] < 1 ? ` at ${parsed[3].toFixed(2)}` : ''}`,
        );
      }
    }

    // Exactly 0 is an entrance fade at its first frame (the auth card, a
    // sheet): native-driver animations never update the JS tree in Jest, so
    // the value would stay 0 for ever. Measure what the fade ends on instead.
    // Any other opacity is static and real: a cancelled row's 0.6 is measured.
    const nodeOpacity =
      typeof own.opacity === 'number' && own.opacity > 0 ? own.opacity : 1;
    const nextOpacity = opacity * nodeOpacity;
    const fill = parseColor(own.backgroundColor);
    const nextGround = fill && fill[3] > 0 ? over(fill, ground, nextOpacity) : ground;
    const nextExempt = exempt || isDisabled(node.props) || isHidden(node.props);

    if (node.type === 'Text') {
      const style = { ...inherited, ...own };
      const ownText = (node.children ?? [])
        .filter((c): c is string => typeof c === 'string')
        .join('')
        .trim();
      const fg = parseColor(style.color);
      if (ownText && fg && !nextExempt) {
        measured += 1;
        const painted = over(fg, nextGround, nextOpacity);
        const fgHex = toHex(painted);
        const bgHex = toHex(nextGround);
        const ratio = contrastRatio(fgHex, bgHex);
        const needs = thresholdFor(style);
        const key = `${fgHex}|${bgHex}|${needs}`;
        const seen = pairs.get(key);
        if (!seen || ratio < seen.ratio) {
          pairs.set(key, {
            text: textOf(node).trim().slice(0, 40),
            fg: fgHex,
            bg: bgHex,
            ratio,
            needs,
          });
        }
      }
      for (const child of node.children ?? [])
        walk(child, nextGround, nextOpacity, style, nextExempt);
      return;
    }

    if (node.type === 'TextInput') {
      const fg = parseColor(own.color ?? colors.text);
      const placeholder = parseColor(node.props.placeholderTextColor);
      const value = typeof node.props.value === 'string' ? node.props.value : '';
      const shown = value ? fg : placeholder;
      const text =
        value ||
        (typeof node.props.placeholder === 'string' ? node.props.placeholder : '');
      if (shown && text && !nextExempt) {
        measured += 1;
        const fgHex = toHex(over(shown, nextGround, nextOpacity));
        const bgHex = toHex(nextGround);
        const needs = thresholdFor(own);
        const ratio = contrastRatio(fgHex, bgHex);
        const key = `${fgHex}|${bgHex}|${needs}`;
        const seen = pairs.get(key);
        if (!seen || ratio < seen.ratio)
          pairs.set(key, { text: text.slice(0, 40), fg: fgHex, bg: bgHex, ratio, needs });
      }
    }

    for (const child of node.children ?? [])
      walk(child, nextGround, nextOpacity, {}, nextExempt);
  };

  const roots = Array.isArray(root) ? root : root ? [root] : [];
  for (const r of roots as HostNode[]) walk(r, page, 1, {}, false);

  const all = [...pairs.values()].sort((a, b) => a.ratio - b.ratio);
  return {
    pairs: all,
    failures: all.filter((p) => p.ratio < p.needs),
    leaks: [...leaks].sort(),
    measured,
  };
}
