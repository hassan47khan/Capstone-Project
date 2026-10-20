/**
 * Amount — a money figure with the cents set smaller.
 *
 * What it is for
 *   The editorial treatment the design uses for every price: the figure in DM
 *   Serif Display, as in the Figma summary card's "$129.20". Dollars and cents
 *   are separate nodes so a future design can size them independently.
 *
 * Why it formats rather than calculates
 *   It receives a decimal STRING and a currency code, and hands both straight to
 *   `formatMoney`. It performs no arithmetic — not even dividing by 100 — because
 *   the client does no money math (specification section 9). Everything summed,
 *   converted or normalised was computed by the server.
 *
 * Why the whole figure is one accessible label
 *   Split across two `<Text>` nodes, a screen reader reads "one hundred and
 *   forty four" then pauses then "forty five", which sounds like two numbers.
 *   Marking the group as one element with the complete string fixes that.
 *
 * Zero-decimal currencies
 *   For JPY and friends `formatMoney` returns an empty fraction, and this
 *   renders no decimal point at all rather than a bare trailing dot.
 *
 * Design tokens
 *   hero       typography.displayLg (28)
 *   large      typography.displayMd (24)
 *   row        typography.price (DM Sans Bold 16, accent) — no split
 *   compact    typography.labelMd (DM Sans Medium 14, text) — the trailing
 *              amount on a ListRow `compact`, which 02 §9 draws in `text` and
 *              not `accent`: a dozen accent figures down Home's renewals list
 *              would out-shout the one hero total above them
 *
 * Used by: Home hero, Insights totals, Subscription detail price, list rows.
 */
import { Text, View, type StyleProp, type TextStyle } from 'react-native';

import { formatMoney } from '@/api/format';
import type { CurrencyCode, MoneyString } from '@/api/types';
import { makeStyles, maxFontSizeMultiplier, numericVariant } from '@/theme';

export interface AmountProps {
  /** Decimal string from the API, e.g. "144.45". Never a number. */
  value: MoneyString;

  /** ISO 4217 code. Decides both the symbol and the number of decimal places. */
  currency: CurrencyCode;

  /**
   * hero  — the single biggest figure on a screen (Home monthly spend)
   * large — a secondary headline figure (Insights, detail price)
   * row   — inline in a list row, at interface size with no size split
   * compact — inline in a ListRow `compact`, quieter than `row`
   */
  size?: 'hero' | 'large' | 'row' | 'compact';

  /**
   * Marks the figure as not converted to the display currency, because no
   * exchange rate is stored for it (US-4). Adds a visible marker and says so in
   * the accessible label, so it is never mistaken for a converted total.
   */
  unconverted?: boolean;

  style?: StyleProp<TextStyle>;
  testID?: string;
}

export function Amount({
  value,
  currency,
  size = 'row',
  unconverted = false,
  style,
  testID,
}: AmountProps) {
  const styles = useStyles();
  const { symbol, whole, fraction, display } = formatMoney(value, currency);

  // The inline sizes are ordinary interface text — no split, no serif face.
  if (size === 'row' || size === 'compact') {
    return (
      <View
        style={styles.inlineGroup}
        accessible
        accessibilityLabel={labelFor(display, unconverted)}
      >
        <Text
          style={[size === 'compact' ? styles.compactAmount : styles.rowAmount, style]}
          testID={testID}
        >
          {display}
        </Text>
        {unconverted ? <Text style={styles.marker}>*</Text> : null}
      </View>
    );
  }

  const isHero = size === 'hero';
  const wholeStyle = isHero ? styles.hero : styles.large;
  const centsStyle = isHero ? styles.hero : styles.large;

  return (
    <View
      style={styles.group}
      // One accessible element, so the figure is announced as a single number.
      accessible
      accessibilityLabel={labelFor(display, unconverted)}
      testID={testID}
    >
      <Text
        style={[wholeStyle, style]}
        maxFontSizeMultiplier={maxFontSizeMultiplier.display}
      >
        {symbol}
        {whole}
      </Text>

      {/* Omitted entirely for zero-decimal currencies such as JPY. */}
      {fraction ? (
        <Text style={[centsStyle]} maxFontSizeMultiplier={maxFontSizeMultiplier.display}>
          .{fraction}
        </Text>
      ) : null}

      {unconverted ? <Text style={styles.marker}>*</Text> : null}
    </View>
  );
}

/**
 * The spoken form.
 *
 * The marker is an asterisk on screen, which a screen reader would read as
 * "star" or skip entirely. Spelling out the meaning is the only way the warning
 * actually reaches a non-sighted user.
 */
function labelFor(display: string, unconverted: boolean): string {
  return unconverted ? `${display}, not converted — no exchange rate available` : display;
}

const useStyles = makeStyles(({ colors, typography }) => ({
  group: {
    flexDirection: 'row',
    // Cents sit on the baseline of the dollars, not centred against them.
    alignItems: 'baseline',
  },
  inlineGroup: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  hero: {
    ...typography.displayLg,
  },
  large: {
    ...typography.displayMd,
    ...numericVariant,
  },
  rowAmount: {
    ...typography.price,
  },
  compactAmount: {
    ...typography.labelMd,
    ...numericVariant,
  },
  marker: {
    ...typography.caption,
    color: colors.textMuted,
  },
}));
