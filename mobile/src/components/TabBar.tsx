/**
 * TabBar — the custom bottom tab bar.
 *
 * What it is for
 *   The Home / Subscriptions / Insights bar at the foot of the app, drawn to
 *   match the prototype rather than using React Navigation's default.
 *
 * How it is wired, and why that decision is made here
 *   It is passed to the navigator as `tabBar={(props) => <TabBar {...props} />}`
 *   and receives React Navigation's `BottomTabBarProps`. That is settled now,
 *   in Phase 0, because the alternative — building a standalone bar and
 *   discovering later that it needs navigation state — means rewriting it and
 *   every test around it.
 *
 * Why it renders from `state.routes` rather than a hard-coded list
 *   The Family tab is registered only when FEATURE_SHARING is true. Driving the
 *   bar from the navigator's actual state means a disabled feature simply is not
 *   there — no filtering, no placeholder, nothing to forget.
 *
 * Why the icon has `strokeWidth` 2 when active
 *   The design distinguishes the active tab by weight as well as colour, so the
 *   current tab is identifiable without relying on the petrol tint alone.
 *
 * Design tokens
 *   background  colors.tabBg with a colors.line hairline on top
 *   active      colors.accent
 *   inactive    colors.ink3
 *   label       typography.tabLabel (12)
 *
 * Used by: the authenticated tab navigator.
 */
import type { BottomTabBarProps } from '@react-navigation/bottom-tabs';
import { BarChart3, House, List, Users } from 'lucide-react-native';
import type { ComponentType } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { colors, sizes, spacing, typography } from '@/theme';

interface IconProps {
  size: number;
  color: string;
  strokeWidth: number;
}

/**
 * Route name to icon. Keyed by the names registered in TabNavigator — a route
 * with no entry here falls back to the list icon rather than crashing.
 */
const ICONS: Record<string, ComponentType<IconProps>> = {
  Home: House,
  Subscriptions: List,
  Insights: BarChart3,
  Family: Users,
};

export function TabBar({ state, descriptors, navigation }: BottomTabBarProps) {
  // The home indicator sits below the bar on modern phones; padding by the
  // inset keeps the labels clear of it without a hard-coded magic number.
  const insets = useSafeAreaInsets();

  return (
    <View
      style={[styles.bar, { paddingBottom: Math.max(insets.bottom, spacing.sm) }]}
      accessibilityRole="tablist"
    >
      {state.routes.map((route, index) => {
        const { options } = descriptors[route.key]!;
        const label = options.title ?? route.name;
        const isFocused = state.index === index;
        const Icon = ICONS[route.name] ?? List;

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
              size={22}
              color={isFocused ? colors.accent : colors.ink3}
              // Weight as a second signal, so colour is not carrying it alone.
              strokeWidth={isFocused ? 2 : 1.7}
            />
            <Text
              style={[
                styles.label,
                isFocused ? styles.labelActive : styles.labelInactive,
              ]}
              numberOfLines={1}
              maxFontSizeMultiplier={1.2}
            >
              {label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  bar: {
    flexDirection: 'row',
    backgroundColor: colors.tabBg,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.line,
    paddingTop: spacing.sm,
  },
  tab: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: sizes.minTouch,
    gap: spacing.xs,
    paddingVertical: spacing.xs,
  },
  label: {
    ...typography.tabLabel,
  },
  labelActive: { color: colors.accent },
  labelInactive: { color: colors.ink3 },
});
