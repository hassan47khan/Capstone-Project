/**
 * The price history step chart on Subscription detail (07 §4).
 *
 * A step line, because prices change on a day rather than drifting. Each step
 * is labelled with its new price and date.
 *
 * The drawing is hidden from screen readers; the text summary under it says
 * the same thing in words (07 §11).
 *
 * Motion (07 §10): the line draws left to right on first render. Under
 * reduced motion it appears at once.
 */
import { useEffect, useState } from 'react';
import { Animated, Text, View, type LayoutChangeEvent } from 'react-native';
import Svg, { Circle, Path, Text as SvgText } from 'react-native-svg';

import { formatDateShort, formatMoney } from '@/api/format';
import type { CurrencyCode } from '@/api/types';
import { Card } from '@/components';
import { makeStyles, spacing, useMotion, useTheme } from '@/theme';

import {
  daysBetween,
  formatMonthYear,
  priceLevels,
  type PriceSeries,
  type PriceStep,
} from './priceHistory';

export const PRICE_CHART_COPY = {
  empty: 'No price changes in the last 12 months',
  today: 'Today',
} as const;

// 07 §4: 120 tall, so the step labels fit. TODO(tokens): no size token for this.
export const CHART_HEIGHT = 120;
// Room above the top line for a step label, and a little below the bottom one.
const PAD_TOP = spacing.xl;
const PAD_BOTTOM = spacing.sm;
// Radius of the dot marking each step.
const DOT_RADIUS = spacing.xs - 1;

const AnimatedPath = Animated.createAnimatedComponent(Path);

/** Where everything goes, for a chart `width` wide. Pure, so it can be tested. */
export interface ChartGeometry {
  /** SVG path for the step line. */
  path: string;
  /** Total length of the line, used to animate it drawing in. */
  length: number;
  /** One point per step: where the line rises or falls to. */
  points: { x: number; y: number; step: PriceStep }[];
}

export function chartGeometry(series: PriceSeries, width: number): ChartGeometry {
  const totalDays = Math.max(1, daysBetween(series.rangeStart, series.today));
  const levels = priceLevels(series);
  const topRank = Math.max(1, levels.size - 1);
  const plotHeight = CHART_HEIGHT - PAD_TOP - PAD_BOTTOM;

  // Left to right by date; higher price = higher up (smaller y).
  const xOf = (date: string) =>
    (daysBetween(series.rangeStart, date) / totalDays) * width;
  const yOf = (price: string) =>
    PAD_TOP + (1 - (levels.get(price) ?? 0) / topRank) * plotHeight;

  let y = yOf(series.startPrice);
  let path = `M 0 ${y}`;
  let length = 0;
  let lastX = 0;
  const points: ChartGeometry['points'] = [];

  for (const step of series.steps) {
    const x = xOf(step.date);
    const nextY = yOf(step.price);
    // Across to the day of the change, then up or down to the new price.
    path += ` H ${x} V ${nextY}`;
    length += x - lastX + Math.abs(nextY - y);
    points.push({ x, y: nextY, step });
    lastX = x;
    y = nextY;
  }

  // Then across to today.
  path += ` H ${width}`;
  length += width - lastX;
  return { path, length, points };
}

export interface PriceHistoryChartProps {
  series: PriceSeries;
  /** The currency the prices are billed in. */
  currency: CurrencyCode;
  /** The same data in words, shown under the chart for everyone. */
  summary: string;
  testID?: string;
}

export function PriceHistoryChart({
  series,
  currency,
  summary,
  testID = 'price-chart',
}: PriceHistoryChartProps) {
  const styles = useStyles();
  const { colors, typography } = useTheme();
  const m = useMotion();
  // The chart is as wide as its card, which we only know after layout.
  const [width, setWidth] = useState(0);
  const [drawn] = useState(() => new Animated.Value(m.moves ? 0 : 1));

  // Draw the line in once the chart has a width.
  useEffect(() => {
    if (!m.moves || width === 0) return;
    Animated.timing(drawn, {
      toValue: 1,
      // TODO(tokens): 07 §10 says 500ms; the nearest motion token is 350.
      duration: m.modal,
      easing: m.easeOut,
      useNativeDriver: false,
    }).start();
  }, [drawn, m, width]);

  // No changes: say so, rather than drawing a flat line on an empty axis.
  if (series.steps.length === 0) {
    return (
      <Card style={styles.card} testID={`${testID}-empty`}>
        <Text style={styles.empty}>{PRICE_CHART_COPY.empty}</Text>
      </Card>
    );
  }

  const onLayout = (event: LayoutChangeEvent) => setWidth(event.nativeEvent.layout.width);
  const geometry = width > 0 ? chartGeometry(series, width) : null;

  return (
    <Card style={styles.card} testID={testID}>
      {/* The picture: hidden from screen readers, the summary below says it in words. */}
      <View
        accessibilityElementsHidden
        importantForAccessibility="no-hide-descendants"
        onLayout={onLayout}
        style={styles.plot}
        testID={`${testID}-plot`}
      >
        {geometry ? (
          <Svg width={width} height={CHART_HEIGHT}>
            <AnimatedPath
              d={geometry.path}
              fill="none"
              stroke={colors.accent}
              strokeWidth={2}
              strokeDasharray={`${geometry.length} ${geometry.length}`}
              strokeDashoffset={drawn.interpolate({
                inputRange: [0, 1],
                outputRange: [geometry.length, 0],
              })}
              testID={`${testID}-line`}
            />
            {/* A dot where each change happened. */}
            {geometry.points.map(({ x, y, step }) => (
              <Circle
                key={`dot-${step.date}`}
                cx={x}
                cy={y}
                r={DOT_RADIUS}
                fill={colors.accent}
              />
            ))}
            {/* "$15.49 · Oct 1" beside each change. Right-aligned in the right
                half so it never runs off the edge. */}
            {geometry.points.map(({ x, y, step }) => (
              <SvgText
                key={`label-${step.date}`}
                x={x > width / 2 ? x - spacing.xs : x + spacing.xs}
                y={y - spacing.sm}
                textAnchor={x > width / 2 ? 'end' : 'start'}
                fill={colors.text}
                fontFamily={typography.captionStrong.fontFamily}
                fontSize={typography.captionStrong.fontSize}
              >
                {`${formatMoney(step.price, currency).display} · ${formatDateShort(step.date)}`}
              </SvgText>
            ))}
          </Svg>
        ) : null}
      </View>

      {/* X axis: where the window starts, and today. */}
      <View
        style={styles.axis}
        accessibilityElementsHidden
        importantForAccessibility="no-hide-descendants"
      >
        <Text style={styles.axisLabel}>{formatMonthYear(series.rangeStart)}</Text>
        <Text style={styles.axisLabel}>{PRICE_CHART_COPY.today}</Text>
      </View>

      {/* The same data in words, for everyone (07 §11). */}
      <Text style={styles.summary} testID={`${testID}-summary`}>
        {summary}
      </Text>
    </Card>
  );
}

const useStyles = makeStyles(({ colors, typography }) => ({
  // 07 §4: padding 16 (the Card default is 24).
  card: {
    padding: spacing.lg,
    gap: spacing.sm,
  },
  plot: {
    height: CHART_HEIGHT,
  },
  axis: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  axisLabel: {
    ...typography.caption,
    color: colors.textMuted,
  },
  summary: {
    ...typography.caption,
    color: colors.textMuted,
  },
  empty: {
    ...typography.bodyMd,
    color: colors.textMuted,
  },
}));
