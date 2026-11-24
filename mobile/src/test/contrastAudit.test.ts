/**
 * The audit itself: it has to fail the things it claims to catch, or the
 * screen sweep in themeContrast.test.tsx proves nothing.
 */
import { darkColors, lightColors } from '@/theme';

import { auditContrast, parseColor } from './contrastAudit';

const view = (style: object, children: unknown[] = [], props: object = {}) => ({
  type: 'View',
  props: { style, ...props },
  children,
});
const text = (value: string, style: object, props: object = {}) => ({
  type: 'Text',
  props: { style, ...props },
  children: [value],
});
const LIGHT = Object.values(lightColors);

describe('parseColor', () => {
  it('reads hex, rgba and an SVG processed colour alike', () => {
    expect(parseColor('#abc')).toEqual([170, 187, 204, 1]);
    expect(parseColor('#11223380')?.[3]).toBeCloseTo(0.5, 2);
    expect(parseColor('rgba(217, 171, 78, 0.10)')).toEqual([217, 171, 78, 0.1]);
    expect(parseColor({ type: 0, payload: 0xff112233 })).toEqual([17, 34, 51, 1]);
    expect(parseColor('red')).toBeNull();
  });
});

describe('auditContrast', () => {
  it('passes the theme text on its own grounds', () => {
    const tree = view({ backgroundColor: darkColors.surface }, [
      text('Total', { color: darkColors.text }),
      text('per month', { color: darkColors.textMuted }),
    ]);
    const audit = auditContrast(tree, darkColors, LIGHT);
    expect(audit.measured).toBe(2);
    expect(audit.failures).toEqual([]);
    expect(audit.leaks).toEqual([]);
  });

  it('fails light ink left on a dark ground, and names the leaked token', () => {
    const tree = view({ backgroundColor: darkColors.surface }, [
      text('Netflix', { color: lightColors.text }),
    ]);
    const audit = auditContrast(tree, darkColors, LIGHT);
    expect(audit.failures).toHaveLength(1);
    expect(audit.failures[0]?.text).toBe('Netflix');
    expect(audit.leaks).toEqual([`color ${lightColors.text}`]);
  });

  it('catches a light-theme fill on an SVG shape, which has no style', () => {
    const fill = parseInt(`ff${lightColors.accent.slice(1)}`, 16);
    const tree = view({}, [
      {
        type: 'RNSVGCircle',
        props: { fill: { type: 0, payload: fill } },
        children: null,
      },
    ]);
    expect(auditContrast(tree, darkColors, LIGHT).leaks).toEqual([
      `RNSVGCircle.fill ${lightColors.accent}`,
    ]);
  });

  it('flattens a translucent fill onto the ground under it', () => {
    // The warning tint over the page: 01 §1's 12.4:1 for text in light.
    const tree = view({ backgroundColor: lightColors.warningSurface }, [
      text('Price went up', { color: lightColors.text }),
    ]);
    const [pair] = auditContrast(tree, lightColors, []).pairs;
    expect(pair?.ratio).toBeCloseTo(12.4, 1);
  });

  it('measures a static opacity, and holds small text to 4.5 and large to 3', () => {
    const faded = view({ backgroundColor: lightColors.surface, opacity: 0.6 }, [
      text('Cancelled', { color: lightColors.textMuted, fontSize: 14 }),
    ]);
    const audit = auditContrast(faded, lightColors, []);
    expect(audit.failures[0]?.needs).toBe(4.5);

    const large = view({ backgroundColor: lightColors.surface }, [
      text('$129.20', { color: lightColors.textMuted, fontSize: 32 }),
    ]);
    expect(auditContrast(large, lightColors, []).pairs[0]?.needs).toBe(3);
  });

  it('exempts disabled controls and decorative subtrees, as WCAG does', () => {
    const tree = view({ backgroundColor: darkColors.surface }, [
      view({}, [text('Save', { color: darkColors.surface2 })], {
        accessibilityState: { disabled: true },
      }),
      view({}, [text('N', { color: darkColors.surface2 })], {
        importantForAccessibility: 'no-hide-descendants',
      }),
    ]);
    const audit = auditContrast(tree, darkColors, LIGHT);
    expect(audit.measured).toBe(0);
    expect(audit.failures).toEqual([]);
  });

  it('measures what an entrance fade ends on, not its first frame', () => {
    const tree = view({ opacity: 0 }, [text('Log In', { color: darkColors.text })]);
    expect(auditContrast(tree, darkColors, LIGHT).failures).toEqual([]);
  });

  it('measures an input by its value, or by its placeholder when empty', () => {
    const input = (value: string) => ({
      type: 'TextInput',
      props: {
        style: { color: darkColors.text },
        value,
        placeholder: 'you@example.com',
        placeholderTextColor: darkColors.border,
      },
      children: null,
    });
    expect(auditContrast(view({}, [input('')]), darkColors, LIGHT).failures).toHaveLength(
      1,
    );
    expect(auditContrast(view({}, [input('a@b.c')]), darkColors, LIGHT).failures).toEqual(
      [],
    );
  });
});
