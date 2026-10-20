/**
 * ListRow — one subscription in a list (handoff 02 §9, Figma `sub-card` 3:1686).
 *
 * What it is for
 *   The most-repeated component in the app: Home, Calendar and Analytics lists.
 *   In the prototype it was copy-pasted raw on ~40 frames; here it is one
 *   component. Settings rows are a different component (`SettingsRow`).
 *
 * Anatomy
 *   [logo]  Netflix                          $15.49
 *           Next bill: Oct 12, 2026             /mo
 *   - the subtitle is two-tone: "Next bill: " muted, the date in Medium `text`
 *     — two Text nodes, not one flat string;
 *   - long names truncate on one line; the price column is fixed and never
 *     truncates;
 *   - a cancelled subscription dims its title and price to 60% and gains a
 *     "Cancelled" badge (history is kept — 07).
 *
 * Accessibility
 *   The whole row is one touchable with one composed label —
 *   "Netflix, $15.49 per month, next bill October 12, 2026" — so a screen reader
 *   does not stop on three loose text nodes.
 *
 * Money
 *   Price is a decimal string formatted by `Amount`; nothing here calculates.
 *
 * Design tokens
 *   container  colors.surface, 1px colors.border, radius.card, spacing.lg padding,
 *              spacing.md gap, sizes.rowSubscription (72); pressed colors.surface2
 *   logo       Tile (40, brand tint or serviceTint)
 *   title      typography.labelSemibold at 15 (02 §9)
 *   subtitle   typography.caption + typography.captionStrong
 *   price      typography.price via Amount; suffix typography.caption
 */
import { Pressable, Text, View } from 'react-native';

import {
  formatCycle,
  formatCycleSuffix,
  formatDateLong,
  formatDateSpoken,
  formatMoney,
} from '@/api/format';
import type { BillingCycle, CurrencyCode, MoneyString } from '@/api/types';
import {
  fontFamily,
  makeStyles,
  opacity,
  radius,
  sizes,
  spacing,
  type ServiceColors,
} from '@/theme';

import { Amount } from './Amount';
import { Badge } from './Badge';
import { Tile } from './Tile';

export interface ListRowProps {
  name: string;
  /** Decimal string from the API. */
  price: MoneyString;
  currency: CurrencyCode;
  cycle: BillingCycle;
  /** "YYYY-MM-DD". */
  nextBillOn: string;
  /** Catalog brand colours for the logo. */
  brand?: ServiceColors;
  cancelled?: boolean;
  onPress?: () => void;
  testID?: string;
}

export function ListRow({
  name,
  price,
  currency,
  cycle,
  nextBillOn,
  brand,
  cancelled = false,
  onPress,
  testID,
}: ListRowProps) {
  const styles = useStyles();
  const { display } = formatMoney(price, currency);

  const label = [
    name,
    `${display} ${formatCycle(cycle.unit, cycle.count)}`,
    `next bill ${formatDateSpoken(nextBillOn)}`,
    cancelled ? 'cancelled' : null,
  ]
    .filter(Boolean)
    .join(', ');

  return (
    <Pressable
      onPress={onPress}
      disabled={!onPress}
      accessible
      accessibilityRole={onPress ? 'button' : undefined}
      accessibilityLabel={label}
      style={({ pressed }) => [styles.row, pressed && styles.pressed]}
      testID={testID}
    >
      <Tile name={name} brand={brand} />

      <View style={styles.info}>
        <View style={styles.titleLine}>
          <Text
            style={[styles.title, cancelled && styles.dimmed]}
            numberOfLines={1}
            ellipsizeMode="tail"
          >
            {name}
          </Text>
          {cancelled ? <Badge label="Cancelled" /> : null}
        </View>
        <Text style={styles.subtitle} numberOfLines={1}>
          Next bill:{' '}
          <Text style={styles.subtitleValue}>{formatDateLong(nextBillOn)}</Text>
        </Text>
      </View>

      <View style={[styles.price, cancelled && styles.dimmed]}>
        <Amount value={price} currency={currency} size="row" />
        <Text style={styles.suffix}>{formatCycleSuffix(cycle.unit, cycle.count)}</Text>
      </View>
    </Pressable>
  );
}

const useStyles = makeStyles(({ colors, typography }) => ({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: sizes.rowSubscription,
    padding: spacing.lg,
    gap: spacing.md,
    backgroundColor: colors.surface,
    borderWidth: sizes.hairline,
    borderColor: colors.border,
    borderRadius: radius.card,
  },
  pressed: {
    backgroundColor: colors.surface2,
  },
  info: {
    flex: 1,
    gap: spacing.xs,
  },
  titleLine: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  // 02 §9: the label.semibold weight at 15px, the body.lg size.
  title: {
    ...typography.bodyLg,
    fontFamily: fontFamily.bodySemiBold,
    flexShrink: 1,
  },
  subtitle: {
    ...typography.caption,
  },
  subtitleValue: {
    ...typography.captionStrong,
  },
  price: {
    // Fixed: the price never shrinks or truncates (02 §9).
    flexShrink: 0,
    alignItems: 'flex-end',
    gap: spacing.xs / 2,
  },
  suffix: {
    // 12px, not the prototype's 9–10px: the cycle is information, so it may not
    // sit below the type floor (01 §4).
    ...typography.caption,
  },
  dimmed: {
    opacity: opacity.cancelled,
  },
}));
