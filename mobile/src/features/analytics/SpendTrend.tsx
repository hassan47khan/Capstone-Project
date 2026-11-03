/**
 * Spend over time: the Analytics headline (handoff 08 §2.1), plus the projected
 * yearly spend (US-16, #57).
 *
 * Callout: this month's spend large, and the change from last month in Home's
 * own words (deltaFor): a fall in green, a rise in plain text, never danger red.
 *
 * Chart: 12 months, an accent line with an 8% fill to the baseline, the current
 * month emphasized. The Y axis runs from 0 to a round figure above the largest
 * month. Under two months of tracking there is no chart, only 08's placeholder
 * (a one-point chart says nothing). Drawn with react-native-svg, like every
 * chart in the app.
 *
 * The chart is hidden from screen readers; one sentence beside it carries the
 * same data (08 §7).
 *
 * Projected yearly spend is the server's annual_total: this month's total over
 * a year at today's prices, trials not counted (US-16's acceptance criteria).
 *
 * TODO(tokens): 08 §6 draws the line over 600ms; the nearest motion token is
 * modal (350). The chart height has no token; it matches the price chart's.
 */
import { TrendingDown, TrendingUp } from 'lucide-react-native';
import { useEffect, useState } from 'react';
import { Animated, Text, View, type LayoutChangeEvent } from 'react-native';
import Svg, { Circle, Path, Text as SvgText } from 'react-native-svg';

import type { SpendOverTime } from '@/api/analyticsTypes';
import { formatMoney } from '@/api/format';
import type { Money } from '@/api/types';
import { Card } from '@/components';
import { deltaFor } from '@/features/home/homeCopy';
import { CHART_HEIGHT } from '@/features/subscriptions/PriceHistoryChart';
import { makeStyles, sizes, spacing, useMotion, useTheme } from '@/theme';

import {
  areaPath,
  chartPoints,
  deltaPhrase,
  describeSpend,
  labelEvery,
  linePath,
  monthInitial,
  pathLength,
} from './spendSeries';

export const SPEND_COPY = {
  title: 'Spending this month',
  placeholder:
    "Your spending trend appears once you've been tracking for a couple of months.",
  projected: 'Projected for the year',
  projectedNote: "At today's prices. Trials aren't counted.",
} as const;

const PAD = { top: spacing.lg, bottom: spacing.sm, side: spacing.sm };
const AREA_OPACITY = 0.08; // 08 §2.1: the fill is the accent at 8%
const CURRENT_DOT = spacing.xs;
// Room one month initial needs. Below it the axis shows every 2nd label
// (08 §2.1): a typical phone fits all 12, a narrow one gets every other.
const MIN_LABEL_WIDTH = spacing.xl;

const AnimatedPath = Animated.createAnimatedComponent(Path);

interface Props {
  spend: SpendOverTime;
  /** The summary's annual_total, once it has loaded. */
  annual?: Money;
}

export function SpendTrend({ spend, annual }: Props) {
  const styles = useStyles();
  const { colors, typography } = useTheme();
  const m = useMotion();
  const [width, setWidth] = useState(0);
  const [drawn] = useState(() => new Animated.Value(m.moves ? 0 : 1));

  // Draw the line in left to right, once the chart has a width (08 §6).
  useEffect(() => {
    if (!m.moves || width === 0) return;
    Animated.timing(drawn, {
      toValue: 1,
      duration: m.modal,
      easing: m.easeOut,
      useNativeDriver: false,
    }).start();
  }, [drawn, m, width]);

  const current = formatMoney(spend.current.amount, spend.current.currency).display;
  const delta = deltaFor(spend);
  const showChart = spend.enough_history && spend.months.length > 1;

  const onLayout = (event: LayoutChangeEvent) => setWidth(event.nativeEvent.layout.width);
  const geometry =
    showChart && width > 0 ? chartPoints(spend, width, CHART_HEIGHT, PAD) : null;
  const baseline = CHART_HEIGHT - PAD.bottom;
  const length = geometry ? pathLength(geometry.points) : 0;
  const every = labelEvery(width, spend.months.length, MIN_LABEL_WIDTH);
  const last = geometry?.points[geometry.points.length - 1];

  return (
    <Card style={styles.card} testID="analytics-spend">
      {/* The callout: this month, and the change from last month. */}
      <View style={styles.callout}>
        <Text style={styles.eyebrow}>{SPEND_COPY.title}</Text>
        <Text style={styles.figure} testID="analytics-spend-current">
          {current}
        </Text>
        {showChart && delta ? (
          <View style={styles.deltaRow} testID="analytics-spend-delta">
            {delta.direction === 'down' ? (
              <TrendingDown size={sizes.iconSmall} color={colors.success} />
            ) : delta.direction === 'up' ? (
              <TrendingUp size={sizes.iconSmall} color={colors.text} />
            ) : null}
            <Text style={delta.direction === 'down' ? styles.deltaDown : styles.delta}>
              {deltaPhrase(spend)}
            </Text>
          </View>
        ) : null}
      </View>

      {showChart ? (
        <>
          {/* The picture: hidden from screen readers; the sentence below says it. */}
          <View
            accessibilityElementsHidden
            importantForAccessibility="no-hide-descendants"
            onLayout={onLayout}
            testID="analytics-spend-plot"
          >
            {geometry ? (
              <Svg width={width} height={CHART_HEIGHT}>
                <Path
                  d={areaPath(geometry.points, baseline)}
                  fill={colors.accent}
                  fillOpacity={AREA_OPACITY}
                  testID="analytics-spend-area"
                />
                <AnimatedPath
                  d={linePath(geometry.points)}
                  fill="none"
                  stroke={colors.accent}
                  strokeWidth={2}
                  strokeDasharray={`${length} ${length}`}
                  strokeDashoffset={drawn.interpolate({
                    inputRange: [0, 1],
                    outputRange: [length, 0],
                  })}
                  testID="analytics-spend-line"
                />
                {last ? (
                  <Circle
                    cx={last.x}
                    cy={last.y}
                    r={CURRENT_DOT}
                    fill={colors.accent}
                    testID="analytics-spend-current-dot"
                  />
                ) : null}
                {/* The Y axis's top: the round figure the chart is scaled to. */}
                <SvgText
                  x={PAD.side}
                  y={PAD.top - spacing.xs}
                  fill={colors.textMuted}
                  fontFamily={typography.caption.fontFamily}
                  fontSize={typography.caption.fontSize}
                  testID="analytics-spend-top"
                >
                  {formatMoney(String(geometry.top), spend.current.currency).display}
                </SvgText>
              </Svg>
            ) : null}
          </View>

          {/* X axis: month initials, the current month in bold. */}
          <View
            style={styles.axis}
            accessibilityElementsHidden
            importantForAccessibility="no-hide-descendants"
          >
            {spend.months.map((point, index) => {
              const isLast = index === spend.months.length - 1;
              const shown = isLast || (spend.months.length - 1 - index) % every === 0;
              return (
                <Text
                  key={point.month}
                  style={[styles.axisLabel, isLast && styles.axisCurrent]}
                  testID={`analytics-spend-axis-${point.month}`}
                >
                  {shown ? monthInitial(point.month) : ' '}
                </Text>
              );
            })}
          </View>

          <Text style={styles.note} testID="analytics-spend-summary">
            {describeSpend(spend)}
          </Text>
        </>
      ) : (
        <Text style={styles.note} testID="analytics-spend-placeholder">
          {SPEND_COPY.placeholder}
        </Text>
      )}

      {/* US-16: what the year costs at today's prices. */}
      {annual ? (
        <View
          style={styles.projected}
          accessible
          accessibilityLabel={`${SPEND_COPY.projected}, ${formatMoney(annual.amount, annual.currency).display}. ${SPEND_COPY.projectedNote}`}
          testID="analytics-projected"
        >
          <View style={styles.projectedRow}>
            <Text style={styles.projectedLabel}>{SPEND_COPY.projected}</Text>
            <Text style={styles.projectedFigure}>
              {formatMoney(annual.amount, annual.currency).display}
            </Text>
          </View>
          <Text style={styles.note}>{SPEND_COPY.projectedNote}</Text>
        </View>
      ) : null}
    </Card>
  );
}

const useStyles = makeStyles(({ colors, typography }) => ({
  card: {
    padding: spacing.xxl,
    gap: spacing.lg,
  },
  callout: {
    gap: spacing.xs,
  },
  eyebrow: {
    ...typography.labelSemibold,
    color: colors.textMuted,
  },
  figure: {
    ...typography.displayLg,
  },
  deltaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  delta: {
    ...typography.labelMd,
  },
  // A fall is good news, in green; a rise is information, never danger (06 §2.2).
  deltaDown: {
    ...typography.labelMd,
    color: colors.success,
  },
  axis: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: PAD.side - spacing.xs,
  },
  axisLabel: {
    ...typography.caption,
    color: colors.textMuted,
    textAlign: 'center',
    minWidth: spacing.sm,
  },
  axisCurrent: {
    ...typography.captionStrong,
    color: colors.text,
  },
  note: {
    ...typography.caption,
    color: colors.textMuted,
  },
  projected: {
    borderTopWidth: sizes.hairline,
    borderTopColor: colors.border,
    paddingTop: spacing.md,
    gap: spacing.xs,
  },
  projectedRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'baseline',
    gap: spacing.md,
  },
  projectedLabel: {
    ...typography.labelSemibold,
  },
  projectedFigure: {
    ...typography.labelBold,
  },
}));
