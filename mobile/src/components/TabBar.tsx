/**
 * TabBar — the bottom tab bar with the centre add button (handoff 03 §2,
 * Figma node 21:52).
 *
 * What it is for
 *   Home · Calendar · [+] · Analytics · Settings at the foot of the app.
 *
 * One component, one instance
 *   The prototype copy-pasted its tab bar eight times, so the FAB appeared on
 *   some copies and not others. Here the bar is passed once to the tab
 *   navigator (`tabBar={(props) => <TabBar …/>}`) and drawn from the
 *   navigator's real routes.
 *
 * The FAB is the only add affordance in the app
 *   No screen header has an "Add Subscription" button (00, rule 4). The FAB is a
 *   button, not a tab: it is announced as "Add subscription, button" and never
 *   as a tab, and it is never "selected".
 *
 * Touch targets
 *   Each tab's icon-and-label stack is ~38pt tall, but the touchable fills the
 *   whole 72pt bar height, well above the 44pt floor.
 *
 * Safe area
 *   The bar is 72 tall plus the bottom inset, so labels clear the home indicator.
 *
 * Design tokens
 *   bar         sizes.tabBar (72) + inset, colors.surface, 1px colors.border top,
 *               spacing.lg (16) horizontal padding
 *   tab         sizes.tabWidth (72), icon sizes.icon (20), gap spacing.xs (4),
 *               typography.tab; active colors.accent, inactive colors.textMuted
 *   FAB         sizes.fabFrame (56) frame, sizes.fab (48) button, radius.fab (24),
 *               colors.accent fill, 20px plus in colors.onAccent
 */
import type { BottomTabBarProps } from '@react-navigation/bottom-tabs';
import {
  Calendar,
  ChartLine,
  Circle,
  House,
  Plus,
  Settings,
  type LucideIcon,
} from 'lucide-react-native';
import { Pressable, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { makeStyles, radius, sizes, spacing, useTheme } from '@/theme';

/** Route name → icon, keyed by the names registered in TabNavigator. */
const ICONS: Record<string, LucideIcon> = {
  Home: House,
  Calendar,
  Analytics: ChartLine,
  Settings,
};

export interface TabBarProps extends BottomTabBarProps {
  /** Opens Add Subscription. The FAB sits after `fabAfterIndex` tabs. */
  onAdd: () => void;
  /** How many tabs come before the FAB. Figma: two (Home, Calendar). */
  fabAfterIndex?: number;
}

export function TabBar({
  state,
  descriptors,
  navigation,
  onAdd,
  fabAfterIndex = 2,
}: TabBarProps) {
  const styles = useStyles();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();

  const tabs = state.routes.map((route, index) => {
    const { options } = descriptors[route.key]!;
    const label = options.title ?? route.name;
    const isFocused = state.index === index;
    const Icon = ICONS[route.name] ?? Circle;
    const color = isFocused ? colors.accent : colors.textMuted;

    const onPress = () => {
      const event = navigation.emit({
        type: 'tabPress',
        target: route.key,
        canPreventDefault: true,
      });
      // `navigate` rather than `jumpTo` so tapping the active tab pops that
      // stack back to its root — the behaviour users expect from a tab bar.
      if (!isFocused && !event.defaultPrevented) {
        navigation.navigate(route.name);
      }
    };

    return (
      <Pressable
        key={route.key}
        onPress={onPress}
        accessibilityRole="tab"
        accessibilityLabel={label}
        // `selected` is how a screen reader says which tab you are on.
        accessibilityState={{ selected: isFocused }}
        style={styles.tab}
        testID={`tab-${route.name}`}
      >
        <Icon
          size={sizes.icon}
          color={color}
          // Weight as a second signal, so colour is not carrying it alone.
          strokeWidth={isFocused ? 2.25 : 1.75}
        />
        <Text
          style={[styles.label, { color }]}
          numberOfLines={1}
          maxFontSizeMultiplier={1.2}
        >
          {label}
        </Text>
      </Pressable>
    );
  });

  const fab = (
    <View key="fab" style={styles.fabFrame}>
      <Pressable
        onPress={onAdd}
        accessibilityRole="button"
        accessibilityLabel="Add subscription"
        style={({ pressed }) => [styles.fab, pressed && styles.fabPressed]}
        testID="tab-fab"
      >
        <Plus size={sizes.icon} color={colors.onAccent} strokeWidth={2.25} />
      </Pressable>
    </View>
  );

  return (
    <View
      style={[
        styles.bar,
        { height: sizes.tabBar + insets.bottom, paddingBottom: insets.bottom },
      ]}
      testID="tab-bar"
    >
      <View style={styles.row} accessibilityRole="tablist">
        {[...tabs.slice(0, fabAfterIndex), fab, ...tabs.slice(fabAfterIndex)]}
      </View>
    </View>
  );
}

const useStyles = makeStyles(({ colors, typography }) => ({
  bar: {
    backgroundColor: colors.tabBar,
    borderTopWidth: sizes.hairline,
    borderTopColor: colors.border,
  },
  row: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.lg,
  },
  tab: {
    width: sizes.tabWidth,
    // The full bar height, not the ~38pt icon+label stack (03 §2).
    height: sizes.tabBar,
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.xs,
  },
  label: {
    ...typography.tab,
  },
  fabFrame: {
    width: sizes.fabFrame,
    height: sizes.fabFrame,
    alignItems: 'center',
    justifyContent: 'center',
  },
  fab: {
    width: sizes.fab,
    height: sizes.fab,
    borderRadius: radius.fab,
    backgroundColor: colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
  },
  fabPressed: {
    backgroundColor: colors.accentPressed,
  },
}));
