/**
 * SearchField — the input that filters a list (handoff 02 §18).
 *
 * What it is for
 *   Filtering the Subscriptions list, the currency picker and the time-zone
 *   picker. It is not a form field: nothing is submitted and nothing is
 *   validated, so it has no label and no helper/error slot.
 *
 * Why it is 44 and a TextField is 52
 *   Measured: `surface` fill, 1px border, radius 6, padding 14h / 10v, a leading
 *   16px search glyph with an 8px gap, 14px placeholder. It sits above a list
 *   rather than in a column of form rows, so the shorter box keeps more of the
 *   list on screen. 44 is still the touch floor exactly.
 *
 * The clear button
 *   Appears only when there is something to clear, and carries a 44pt hit area
 *   around a 16px glyph. Clearing returns focus-free empty state immediately —
 *   it is not debounced, because a user who taps × expects the full list back
 *   at once.
 *
 * Instant vs debounced (02 §18)
 *   `onChangeText` fires on every keystroke, so a local list filters as the user
 *   types. `onSearch` is the debounced channel for a server-backed list, at
 *   `debounceMs` (200 by default). A caller uses one or the other; passing both
 *   is what the currency picker does, filtering its local catalog instantly
 *   while it refreshes rates behind it.
 *
 * Accessibility
 *   `accessibilityRole="search"`, and the clear button is a separate labelled
 *   button because it does something the field itself does not.
 *
 * Design tokens
 *   height       sizes.search (44)
 *   radius       radius.card (6)
 *   fill         colors.surface, 1px colors.borderControl
 *   padding      spacing.md + 2 (14) horizontal
 *   icons        sizes.iconSmall (16), colors.textMuted
 *   gap          spacing.sm (8)
 *   text         typography.bodyMd (14); placeholder colors.textMuted
 *
 * Used by: Subscriptions, Currency picker, Time-zone picker.
 */
import { Search, X } from 'lucide-react-native';
import { useEffect, useRef } from 'react';
import { Pressable, TextInput, View } from 'react-native';

import { makeStyles, radius, sizes, spacing, useTheme } from '@/theme';

/** 02 §18: what a server-backed list waits before asking. */
export const SEARCH_DEBOUNCE_MS = 200;

export interface SearchFieldProps {
  value: string;

  /** Every keystroke. A local list filters on this. */
  onChangeText: (value: string) => void;

  /**
   * The debounced channel, for a list that costs a request. Omit for a purely
   * local filter.
   */
  onSearch?: (value: string) => void;

  debounceMs?: number;

  /** Shown when empty. Says what is being searched, e.g. "Search currencies". */
  placeholder: string;

  /**
   * The accessible name. Defaults to the placeholder, which already names the
   * thing being searched.
   */
  accessibilityLabel?: string;

  testID?: string;
}

export function SearchField({
  value,
  onChangeText,
  onSearch,
  debounceMs = SEARCH_DEBOUNCE_MS,
  placeholder,
  accessibilityLabel,
  testID,
}: SearchFieldProps) {
  const styles = useStyles();
  const { colors } = useTheme();

  // `onSearch` lives in a ref so a caller passing an inline arrow does not
  // restart the debounce on every render and never fire. Synced in its own
  // effect, which runs before the debounce effect below.
  const search = useRef(onSearch);
  useEffect(() => {
    search.current = onSearch;
  }, [onSearch]);

  // Skipped on mount: a fresh field is already empty, and firing the debounced
  // channel for "" would cost a server-backed caller a redundant request before
  // the user has typed anything.
  const mounted = useRef(false);
  useEffect(() => {
    if (!mounted.current) {
      mounted.current = true;
      return;
    }
    if (!search.current) return;
    const handle = setTimeout(() => search.current?.(value), debounceMs);
    return () => clearTimeout(handle);
  }, [value, debounceMs]);

  const clear = () => {
    onChangeText('');
    // Not debounced: tapping × means "show me everything, now".
    search.current?.('');
  };

  return (
    <View style={styles.field}>
      <Search
        size={sizes.iconSmall}
        color={colors.textMuted}
        strokeWidth={1.8}
        // Decorative: the placeholder and the role already say "search".
        accessibilityElementsHidden
        importantForAccessibility="no-hide-descendants"
      />

      <TextInput
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor={colors.textMuted}
        accessibilityRole="search"
        accessibilityLabel={accessibilityLabel ?? placeholder}
        returnKeyType="search"
        autoCorrect={false}
        autoCapitalize="none"
        // The field is 44 tall and cannot grow, so the text in it may not either.
        maxFontSizeMultiplier={1.2}
        style={styles.input}
        testID={testID ? `${testID}-input` : undefined}
      />

      {value.length > 0 ? (
        <Pressable
          onPress={clear}
          accessibilityRole="button"
          accessibilityLabel="Clear search"
          // 16px glyph, 44pt target (02 §18).
          hitSlop={(sizes.minTouch - sizes.iconSmall) / 2}
          testID={testID ? `${testID}-clear` : undefined}
        >
          <X size={sizes.iconSmall} color={colors.textMuted} strokeWidth={1.8} />
        </Pressable>
      ) : null}
    </View>
  );
}

const useStyles = makeStyles(({ colors, typography }) => ({
  field: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    height: sizes.search,
    minHeight: sizes.minTouch,
    borderRadius: radius.card,
    backgroundColor: colors.surface,
    borderWidth: sizes.hairline,
    borderColor: colors.borderControl,
    // Measured 14: between spacing.md (12) and spacing.lg (16), and the only
    // place the design uses it.
    paddingHorizontal: spacing.md + 2,
  },
  input: {
    ...typography.bodyMd,
    flex: 1,
    // Android adds its own vertical padding to a TextInput, which would push
    // the text off-centre in a fixed 44pt box.
    paddingVertical: 0,
  },
}));
