/**
 * The offline banner (11 §3.4): "You're offline. Some of what you see is from
 * as early as 3:05 PM."
 *
 * Shown while the phone has no connection, under each tab's content and
 * above the tab bar (not below the header: see the handoff errata). Dismissing
 * it hides it in every tab until the connection comes back; the next outage
 * shows it again. On reconnect it goes away and the screens refetch (see
 * connectivity.ts).
 *
 * The time is the oldest answer any mounted screen is showing, so it's a
 * claim the app can stand behind: everything on screen is from then or later.
 * (Tabs stay mounted, so this can't be narrowed to the tab you're on.) Home
 * keeps its own, exact stale line. With nothing showing cached data the banner
 * says only that the phone is offline; the screen shows the offline error.
 */
import { useQueryClient } from '@tanstack/react-query';
import { WifiOff, X } from 'lucide-react-native';
import { Pressable, Text, View } from 'react-native';

import { formatTimeOfDay } from '@/api/format';
import { makeStyles, opacity, radius, sizes, spacing, useTheme } from '@/theme';

import {
  dismissOfflineBanner,
  useIsOnline,
  useOfflineBannerDismissed,
} from './connectivity';

export const OFFLINE_COPY = {
  offline: "You're offline.",
  showing: (time: string) =>
    `You're offline. Some of what you see is from as early as ${time}.`,
};

export function OfflineBanner() {
  const styles = useStyles();
  const { colors } = useTheme();
  const online = useIsOnline();
  const client = useQueryClient();
  const dismissed = useOfflineBannerDismissed();

  if (online || dismissed) return null;

  // Only queries a mounted screen is reading, and only ones holding data.
  const shown = client
    .getQueryCache()
    .getAll()
    .filter((q) => q.getObserversCount() > 0 && q.state.dataUpdatedAt > 0)
    .map((q) => q.state.dataUpdatedAt);
  const oldest = shown.length > 0 ? Math.min(...shown) : 0;
  const text =
    oldest > 0 ? OFFLINE_COPY.showing(formatTimeOfDay(oldest)) : OFFLINE_COPY.offline;

  return (
    <View style={styles.banner} testID="offline-banner">
      <View
        style={styles.textRow}
        accessible
        accessibilityRole="alert"
        accessibilityLabel={text}
      >
        <WifiOff size={sizes.iconSmall} color={colors.text} />
        <Text style={styles.text}>{text}</Text>
      </View>
      <Pressable
        onPress={dismissOfflineBanner}
        accessibilityRole="button"
        accessibilityLabel="Dismiss offline notice"
        hitSlop={(sizes.minTouch - sizes.iconSmall) / 2}
        style={({ pressed }) => pressed && styles.pressed}
        testID="offline-banner-dismiss"
      >
        <X size={sizes.iconSmall} color={colors.text} />
      </Pressable>
    </View>
  );
}

const useStyles = makeStyles(({ colors, typography }) => ({
  banner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginHorizontal: spacing.lg,
    marginBottom: spacing.sm,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    backgroundColor: colors.warningSurface,
    borderRadius: radius.card,
  },
  textRow: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  text: {
    ...typography.caption,
    color: colors.text,
    flexShrink: 1,
  },
  pressed: {
    opacity: opacity.pressed,
  },
}));
