/**
 * The category donut on Home (06 §2.3), drawn with react-native-svg.
 *
 * Decorative: hidden from screen readers, because the legend beside it carries
 * the same data as text (06 §8). The slices are the server's whole-number
 * percentages, which sum to 100; the geometry turns each into an arc and does
 * no money arithmetic.
 *
 * Motion (06 §7): the arcs sweep from 0 on first render. Under reduced motion
 * the final ring is drawn at once.
 *
 * TODO(tokens): 06 §2.3 draws a 90px ring with a 14px stroke in a 100px box.
 * With no tokens for those, the ring is sizes.markLarge + spacing.lg (88), the
 * stroke spacing.md (12), and the sweep uses motion modal (350; 06 §7 says 600).
 */
import { useEffect, useState } from 'react';
import { Animated, View } from 'react-native';
import Svg, { Circle, G } from 'react-native-svg';

import type { CategorySpend } from '@/api/analyticsTypes';
import { sizes, spacing, useMotion, useTheme, type CategoryKey } from '@/theme';

const DIAMETER = sizes.markLarge + spacing.lg;
const STROKE = spacing.md;
const RADIUS = (DIAMETER - STROKE) / 2;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;

const AnimatedCircle = Animated.createAnimatedComponent(Circle);

export function colorKeyFor(row: CategorySpend): CategoryKey {
  return (row.category?.color_token_key ?? 'other') as CategoryKey;
}

export function CategoryDonut({ rows }: { rows: CategorySpend[] }) {
  const { categoryColors } = useTheme();
  const m = useMotion();
  const [sweep] = useState(() => new Animated.Value(m.moves ? 0 : 1));

  useEffect(() => {
    if (!m.moves) return;
    Animated.timing(sweep, {
      toValue: 1,
      duration: m.modal,
      easing: m.easeOut,
      useNativeDriver: false,
    }).start();
  }, [sweep, m]);

  // Each slice starts where the previous ended, as a fraction of the ring.
  const slices = rows.reduce<{ row: CategorySpend; start: number; fraction: number }[]>(
    (acc, row) => {
      const previous = acc[acc.length - 1];
      const start = previous ? previous.start + previous.fraction : 0;
      return [...acc, { row, start, fraction: row.percent / 100 }];
    },
    [],
  );

  return (
    <View
      style={{ width: DIAMETER, height: DIAMETER }}
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      testID="category-donut"
    >
      <Svg width={DIAMETER} height={DIAMETER}>
        {/* Rotate so the first slice starts at 12 o'clock. */}
        <G rotation={-90} origin={`${DIAMETER / 2}, ${DIAMETER / 2}`}>
          {slices.map(({ row, start: offset, fraction }) => (
            <AnimatedCircle
              key={row.category?.slug ?? 'uncategorized'}
              cx={DIAMETER / 2}
              cy={DIAMETER / 2}
              r={RADIUS}
              fill="none"
              stroke={categoryColors[colorKeyFor(row)]}
              strokeWidth={STROKE}
              strokeDasharray={`${CIRCUMFERENCE * fraction} ${CIRCUMFERENCE}`}
              strokeDashoffset={sweep.interpolate({
                inputRange: [0, 1],
                // From fully hidden to its place in the ring.
                outputRange: [CIRCUMFERENCE * fraction, -CIRCUMFERENCE * offset],
              })}
            />
          ))}
        </G>
      </Svg>
    </View>
  );
}
