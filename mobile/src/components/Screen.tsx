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
 *   insets, the keyboard pushing inputs off-screen, and the 20pt gutter the
 *   design uses everywhere except Welcome. Centralising them means a new screen
 *   is correct by default, and changing the gutter is one edit.
 *
 * Design tokens
 *   background  colors.paper      the warm ground the whole app sits on
 *   gutter      spacing.xl (20)   standard; spacing.xxl (24) on Welcome
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

import { colors, spacing } from '@/theme';

export interface ScreenProps {
  children: ReactNode;

  /**
   * Whether the content scrolls. Use `false` for a screen that must not move —
   * a form with a sticky footer, for instance, where the footer pins to the
   * bottom and only the fields above it scroll.
   */
  scroll?: boolean;

  /**
   * Horizontal padding. `'standard'` is the 20pt tab-screen gutter;
   * `'wide'` is the 24pt Welcome gutter; `'none'` lets a child run edge to edge
   * (a grouped list that bleeds to the screen edge, for example).
   */
  gutter?: 'standard' | 'wide' | 'none';

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
  const gutterStyle =
    gutter === 'none'
      ? undefined
      : gutter === 'wide'
        ? styles.gutterWide
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
            tintColor={colors.ink3}
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

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: colors.paper,
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
    paddingHorizontal: spacing.xl,
  },
  gutterWide: {
    paddingHorizontal: spacing.xxl,
  },
  footer: {
    // A hairline rather than a shadow: the design system has no shadows except
    // the segmented-control thumb.
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.line,
    backgroundColor: colors.tabBg,
    paddingTop: spacing.md,
    paddingBottom: spacing.md,
  },
});
