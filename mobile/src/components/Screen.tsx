/**
 * Screen — the outermost wrapper every screen uses.
 *
 * What it is for
 *   Paints the background, applies the side gutter, and keeps content clear of
 *   the notch, the home indicator and the keyboard. Every screen in the app
 *   starts with one of these.
 *
 * Why it exists rather than each screen doing it itself
 *   Three things are easy to get subtly wrong and tedious to repeat: safe-area
 *   insets, the keyboard pushing inputs off-screen, and the 24pt gutter the
 *   Figma frames use on the 402-wide baseline (01 §5). Centralising them means a new screen
 *   is correct by default, and changing the gutter is one edit.
 *
 * Design tokens
 *   background  colors.bg      the warm ground the whole app sits on
 *   gutter      spacing.xxl (24)  standard; spacing.lg (16) compact
 *
 * Used by: every screen.
 */
import type { ReactNode } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  RefreshControl,
  ScrollView,
  StyleSheet,
  View,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import { SafeAreaView, type Edge } from 'react-native-safe-area-context';

import { makeStyles, spacing, useTheme } from '@/theme';

export interface ScreenProps {
  children: ReactNode;

  /**
   * Whether the content scrolls. Use `false` for a screen that must not move —
   * a form with a sticky footer, for instance, where the footer pins to the
   * bottom and only the fields above it scroll.
   */
  scroll?: boolean;

  /**
   * Horizontal padding. `'standard'` is the 24pt screen gutter (01 §5);
   * `'compact'` is 16pt, for dense lists such as Analytics; `'none'` lets a child run edge to edge
   * (a grouped list that bleeds to the screen edge, for example).
   */
  gutter?: 'standard' | 'compact' | 'none';

  /**
   * Which edges get safe-area padding. Screens inside the bottom tabs pass
   * `['top']` because the tab bar already handles the bottom inset; pushed
   * screens with no tab bar want both.
   */
  edges?: readonly Edge[];

  /** Pull-to-refresh. Omit the handler and no refresh control is attached. */
  onRefresh?: () => void;
  refreshing?: boolean;

  /** A sticky element pinned below the scroll area, such as a Save button. */
  footer?: ReactNode;

  /** Applied to the content container, for a screen that needs extra spacing. */
  contentStyle?: StyleProp<ViewStyle>;

  testID?: string;
}

export function Screen({
  children,
  scroll = true,
  gutter = 'standard',
  edges = ['top'],
  onRefresh,
  refreshing = false,
  footer,
  contentStyle,
  testID,
}: ScreenProps) {
  const styles = useStyles();
  const { colors } = useTheme();
  const gutterStyle =
    gutter === 'none'
      ? undefined
      : gutter === 'compact'
        ? styles.gutterCompact
        : styles.gutterStandard;

  const content = scroll ? (
    <ScrollView
      style={styles.flex}
      contentContainerStyle={[styles.scrollContent, gutterStyle, contentStyle]}
      // Lets a user dismiss the keyboard by dragging the list, which is the
      // platform-native gesture and avoids trapping them in a focused field.
      keyboardDismissMode="on-drag"
      keyboardShouldPersistTaps="handled"
      showsVerticalScrollIndicator={false}
      refreshControl={
        onRefresh ? (
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor={colors.textMuted}
            colors={[colors.accent]}
          />
        ) : undefined
      }
      testID={testID}
    >
      {children}
    </ScrollView>
  ) : (
    <View style={[styles.flex, gutterStyle, contentStyle]} testID={testID}>
      {children}
    </View>
  );

  return (
    <SafeAreaView style={styles.safe} edges={edges}>
      {/*
        iOS needs 'padding' to lift content above the keyboard. Android resizes
        the window itself (windowSoftInputMode), so adding behaviour there
        double-counts and leaves a gap above the keyboard.
      */}
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        {content}
        {footer ? <View style={[styles.footer, gutterStyle]}>{footer}</View> : null}
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const useStyles = makeStyles(({ colors }) => ({
  safe: {
    flex: 1,
    backgroundColor: colors.bg,
  },
  flex: {
    flex: 1,
  },
  scrollContent: {
    // Breathing room at the bottom so the last row is never flush against the
    // tab bar or the home indicator.
    paddingBottom: spacing.xxl,
    flexGrow: 1,
  },
  gutterStandard: {
    paddingHorizontal: spacing.xxl,
  },
  gutterCompact: {
    paddingHorizontal: spacing.lg,
  },
  footer: {
    // A hairline rather than a shadow: the design system has no shadows (02 §8).
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
    backgroundColor: colors.tabBar,
    paddingTop: spacing.md,
    paddingBottom: spacing.md,
  },
}));
