/**
 * The offline banner (11 §3.4): "You're offline. Showing data from 3:05 PM."
 *
 * Shown while the phone has no connection, under each tab's content and
 * above the tab bar. It can be dismissed, and comes back the next time the
 * connection drops. On reconnect it goes away and the screens refetch (see
 * connectivity.ts).
 *
 * The time is when the newest cached answer arrived. With nothing cached the
 * banner says only that the phone is offline; the screen itself shows the
 * offline error.
 */
import { useQueryClient } from '@tanstack/react-query';
import { WifiOff, X } from 'lucide-react-native';
import { useState } from 'react';
import { Pressable, Text, View } from 'react-native';

import { formatTimeOfDay } from '@/api/format';
import { makeStyles, opacity, radius, sizes, spacing, useTheme } from '@/theme';

import { useIsOnline } from './connectivity';

export const OFFLINE_COPY = {
  offline: "You're offline.",
  showing: (time: string) => `You're offline. Showing data from ${time}.`,
};

export function OfflineBanner() {
  const styles = useStyles();
  const { colors } = useTheme();
  const online = useIsOnline();
  const client = useQueryClient();
  const [dismissed, setDismissed] = useState(false);
  const [wasOnline, setWasOnline] = useState(online);

  // Each new outage shows the banner again: reset on the way back online,
  // during render rather than in an effect.
  if (online !== wasOnline) {
    setWasOnline(online);
    if (online) setDismissed(false);
  }

  if (online || dismissed) return null;

  const newest = Math.max(
    0,
    ...client
      .getQueryCache()
      .getAll()
      .map((q) => q.state.dataUpdatedAt),
  );
  const text =
    newest > 0 ? OFFLINE_COPY.showing(formatTimeOfDay(newest)) : OFFLINE_COPY.offline;

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
        onPress={() => setDismissed(true)}
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
