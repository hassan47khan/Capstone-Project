/**
 * CategoryBadge — a category's colour dot and name (handoff 02 §10).
 *
 * What it is for
 *   Anywhere a category is named: the Category picker options, list group
 *   headers, the analytics legend.
 *
 * The dot never speaks alone
 *   Colour is reinforcement; the label is the information (01 §7). The dot is
 *   hidden from screen readers, and the badge is announced as its label.
 *
 * Design tokens
 *   dot    sizes.dot (8), the category's token from useTheme().categoryColors
 *   label  typography.labelMd
 */
import { Text, View } from 'react-native';

import {
  CATEGORY_LABELS,
  categorySlugToKey,
  makeStyles,
  radius,
  sizes,
  spacing,
  UNCATEGORIZED_LABEL,
  useTheme,
  type Category,
} from '@/theme';

export interface CategoryBadgeProps {
  /** Null renders as "Uncategorized" with the `other` colour. */
  category: Category | null;
  testID?: string;
}

export function CategoryBadge({ category, testID }: CategoryBadgeProps) {
  const styles = useStyles();
  const { categoryColors } = useTheme();
  const label = category ? CATEGORY_LABELS[category] : UNCATEGORIZED_LABEL;
  const color = categoryColors[categorySlugToKey[category ?? 'other']];

  return (
    <View style={styles.badge} accessible accessibilityLabel={label} testID={testID}>
      <View
        style={[styles.dot, { backgroundColor: color }]}
        testID={testID ? `${testID}-dot` : undefined}
      />
      <Text style={styles.label} numberOfLines={1}>
        {label}
      </Text>
    </View>
  );
}

const useStyles = makeStyles(({ typography }) => ({
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  dot: {
    width: sizes.dot,
    height: sizes.dot,
    borderRadius: radius.pill,
  },
  label: {
    ...typography.labelMd,
  },
}));
