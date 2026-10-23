/**
 * AuthShell — the layout all eight auth screens share (handoff 05 §2).
 *
 * What it is for
 *   One nav bar, one centred card, one heading style, so the eight screens
 *   cannot drift apart the way the prototype's did (it used three nav-bar
 *   heights, 64, 72 and 88, across them).
 *
 * Layout (05 §2)
 *   nav bar      05 asks for 64 (standardized from the prototype's 64/72/88): a
 *                white strip with a hairline under it, the 30 × 30 teal
 *                brand tile with its chart glyph and "SubTrak" in
 *                displayMd, plus a back button on pushed screens
 *   card         Card, centred vertically, 24 padding, inside the 24pt gutter
 *   heading      displayMd, centred, announced as the screen's header
 *   supporting   bodyMd, textMuted, centred
 *   fields       spacing.lg (16) apart; the primary sits spacing.xxl below
 *
 * Why the heading carries testID "header-title"
 *   Every other screen's title comes from `Header`, and the navigation tests
 *   read that id to know which screen is showing. The auth screens have no
 *   `Header` (the nav bar shows the brand instead), so their heading takes the
 *   same id and those tests keep working unchanged.
 *
 * Motion (05 §10): the card fades in and rises 12px over 250ms. Under reduced
 * motion it only cross-fades.
 *
 * TODO(tokens): src/theme has no token for the Figma values, so each is
 * snapped to the nearest existing one until they are added there:
 *   nav bar 64pt   → sizes.header (56)
 *   brand mark 30  → sizes.markSquare (28)
 *   entrance 250ms → useMotion().sheetOut (250; the cross-fade under
 *                    reduced motion); rise 12px → spacing.md (12)
 */
import { ChartLine, ChevronLeft } from 'lucide-react-native';
import { useEffect, useState, type ReactNode } from 'react';
import { Animated, Pressable, Text, View } from 'react-native';

import { Card, Screen } from '@/components';
import {
  makeStyles,
  opacity,
  radius,
  sizes,
  spacing,
  useMotion,
  useTheme,
} from '@/theme';

// See TODO(tokens) above for the Figma values these stand in for.
export const AUTH_NAV_BAR_HEIGHT = sizes.header;
export const BRAND_MARK_SIZE = sizes.markSquare;
const CARD_ENTER_RISE = spacing.md;

const HIT_SLOP = (sizes.minTouch - sizes.headerButton) / 2;

export interface AuthShellProps {
  /** The card heading, e.g. "Log in". Announced as the screen's header. */
  title: string;

  /** One or two sentences under the heading. */
  subtitle?: ReactNode;

  /** Shown on a pushed screen; names where back goes, e.g. "Log in". */
  backLabel?: string;
  onBack?: () => void;

  /** The form: fields, form error, primary and secondary actions. */
  children: ReactNode;

  /** Links below the card, such as "Back to Log In". */
  footer?: ReactNode;

  testID?: string;
}

export function AuthShell({
  title,
  subtitle,
  backLabel,
  onBack,
  children,
  footer,
  testID,
}: AuthShellProps) {
  const styles = useStyles();
  const { colors } = useTheme();
  const m = useMotion();
  const [enter] = useState(() => new Animated.Value(0));

  useEffect(() => {
    Animated.timing(enter, {
      toValue: 1,
      duration: m.sheetOut,
      easing: m.easeOut,
      useNativeDriver: true,
    }).start();
  }, [enter, m]);

  const rise = m.moves
    ? enter.interpolate({ inputRange: [0, 1], outputRange: [CARD_ENTER_RISE, 0] })
    : 0;

  return (
    <Screen
      edges={['top', 'bottom']}
      gutter="none"
      contentStyle={styles.content}
      testID={testID}
    >
      <View style={styles.navBar}>
        {backLabel && onBack ? (
          <Pressable
            onPress={onBack}
            accessibilityRole="button"
            accessibilityLabel={`Back to ${backLabel}`}
            hitSlop={HIT_SLOP}
            style={({ pressed }) => [styles.back, pressed && styles.pressed]}
            testID="auth-back"
          >
            <ChevronLeft size={sizes.iconSmall} color={colors.text} strokeWidth={2} />
          </Pressable>
        ) : null}
        {/* Decorative: "SubTrak" beside it already names the app. */}
        <View
          style={styles.mark}
          accessibilityElementsHidden
          importantForAccessibility="no"
        >
          <ChartLine size={sizes.iconSmall} color={colors.onAccent} strokeWidth={2} />
        </View>
        <Text style={styles.brand} maxFontSizeMultiplier={1.4}>
          SubTrak
        </Text>
      </View>

      <View style={styles.center}>
        <Animated.View style={{ opacity: enter, transform: [{ translateY: rise }] }}>
          <Card style={styles.card}>
            <View style={styles.headingGroup}>
              <Text
                style={styles.heading}
                accessibilityRole="header"
                testID="header-title"
              >
                {title}
              </Text>
              {subtitle ? <Text style={styles.subtitle}>{subtitle}</Text> : null}
            </View>
            <View style={styles.body}>{children}</View>
          </Card>
        </Animated.View>
        {footer ? <View style={styles.footer}>{footer}</View> : null}
      </View>
    </Screen>
  );
}

export interface FormErrorProps {
  message?: string;
  testID?: string;
}

/**
 * The form-level error (05 §9): above the fields on Login, above the primary
 * elsewhere. Danger is right here: it is an error. Announced politely.
 */
export function FormError({ message, testID = 'form-error' }: FormErrorProps) {
  const styles = useStyles();
  if (!message) return null;
  return (
    <View
      style={styles.formError}
      accessibilityRole="alert"
      accessibilityLiveRegion="polite"
    >
      <Text style={styles.formErrorText} testID={testID}>
        {message}
      </Text>
    </View>
  );
}

const useStyles = makeStyles(({ colors, typography }) => ({
  content: {
    flexGrow: 1,
  },
  // A white strip across the full width, a hairline under it (Figma frame).
  navBar: {
    height: AUTH_NAV_BAR_HEIGHT,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingHorizontal: spacing.xxl,
    backgroundColor: colors.surface,
    borderBottomWidth: sizes.hairline,
    borderBottomColor: colors.border,
  },
  back: {
    width: sizes.headerButton,
    height: sizes.headerButton,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pressed: {
    opacity: opacity.pressed,
  },
  // The teal brand tile with the chart glyph.
  mark: {
    width: BRAND_MARK_SIZE,
    height: BRAND_MARK_SIZE,
    borderRadius: radius.card,
    backgroundColor: colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
  },
  brand: {
    ...typography.displayMd,
    color: colors.text,
  },
  center: {
    flex: 1,
    justifyContent: 'center',
    paddingHorizontal: spacing.xxl,
    paddingVertical: spacing.xxl,
    gap: spacing.lg,
  },
  card: {
    padding: spacing.xxl,
    gap: spacing.xxl,
  },
  headingGroup: {
    gap: spacing.sm,
  },
  heading: {
    ...typography.displayMd,
    color: colors.text,
    textAlign: 'center',
  },
  subtitle: {
    ...typography.bodyMd,
    color: colors.textMuted,
    textAlign: 'center',
  },
  body: {
    gap: spacing.lg,
  },
  footer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    justifyContent: 'center',
    columnGap: spacing.xs,
  },
  formError: {
    backgroundColor: colors.dangerSurface,
    borderRadius: radius.card,
    padding: spacing.md,
  },
  formErrorText: {
    ...typography.bodyMd,
    color: colors.danger,
  },
}));
