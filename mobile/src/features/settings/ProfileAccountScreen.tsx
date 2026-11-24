/**
 * Profile & account (handoff 09 §6; US-2, US-3). Figma `3:2734`.
 *
 * Presented as a modal (03 §1), so it closes with an X rather than going back.
 *
 * Groups (09 §6)
 *   My profile       56px initials avatar, the display name, the email. The
 *                    "Family Premium" badge is hidden for the MVP (no plans yet).
 *   App preferences  App theme: Dark / Light / System, driving the real themes
 *                    (01 §6) through ThemeProvider. Language: "English" as a
 *                    plain value, not a control (09 §6 MVP decision).
 *   Data             Clear cache, with its approximate size (see cache.ts).
 *
 * Not yet
 *   - The theme isn't saved: it lasts until the app restarts. The server keeps
 *     it in UserSettings.theme, but nothing can read or write that until
 *     /me/settings exists.
 *   - Haptic feedback: nothing in the app vibrates yet, and a toggle that does
 *     nothing is worse than no toggle (09 §6).
 *   - Export, change password and delete account: no endpoints yet.
 *   - Import and two-factor auth: cut for the MVP (09 §6).
 *
 * The profile comes from GET /me, the same query Home and Settings use, so it's
 * usually cached. If it fails, only the profile group shows the error: theme
 * and Clear cache don't need it.
 */
import { useNavigation } from '@react-navigation/native';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Pressable, Text, View } from 'react-native';

import { meApi } from '@/api/endpoints';
import { queryKeys } from '@/api/queryKeys';
import type { UserProfile } from '@/api/types';
import {
  ErrorState,
  GroupedList,
  Header,
  Screen,
  SegmentedControl,
  Skeleton,
  SkeletonGroup,
  useToast,
  type SegmentedOption,
} from '@/components';
import { initials } from '@/features/family/FamilyScreen';
import { useIsOnline } from '@/offline/connectivity';
import {
  fontFamily,
  makeStyles,
  sizes,
  spacing,
  useTheme,
  type ThemePreference,
} from '@/theme';

import { clearCache, formatBytes, useCacheBytes } from './cache';

export const PROFILE_COPY = {
  title: 'Profile & account',
  myProfile: 'My profile',
  preferences: 'App preferences',
  data: 'Data',
  theme: 'App theme',
  language: 'Language',
  english: 'English',
  clearCache: 'Clear cache',
  clearHint: "Removes saved data and reloads what's open.",
  clearOffline: 'Connect to the internet to clear the cache.',
  cleared: 'Cache cleared',
  loadingProfile: 'Loading profile',
} as const;

/** 09 §6 lists them in this order. */
export const THEME_OPTIONS: readonly SegmentedOption<ThemePreference>[] = [
  { value: 'dark', label: 'Dark' },
  { value: 'light', label: 'Light' },
  { value: 'system', label: 'System' },
];

/** 09 §6, measured: the avatar is 56 with 20pt initials. */
const AVATAR_SIZE = 56;
const AVATAR_INITIALS = 20;

export function ProfileAccountScreen() {
  const navigation = useNavigation();
  const styles = useStyles();
  const { preference, setPreference } = useTheme();

  const profile = useQuery({
    queryKey: queryKeys.session.profile(),
    queryFn: meApi.getProfile,
  });

  return (
    <Screen edges={['top', 'bottom']} testID="profile-account-screen">
      <Header title={PROFILE_COPY.title} onClose={() => navigation.goBack()} />

      <View style={styles.body}>
        {profile.data ? (
          <GroupedList title={PROFILE_COPY.myProfile}>
            <ProfileCard profile={profile.data} />
          </GroupedList>
        ) : profile.isError ? (
          <ErrorState
            error={profile.error}
            onRetry={() => profile.refetch()}
            testID="profile-error"
          />
        ) : (
          <GroupedList title={PROFILE_COPY.myProfile}>
            <ProfileSkeleton />
          </GroupedList>
        )}

        <GroupedList title={PROFILE_COPY.preferences}>
          <View style={styles.themeRow}>
            <Text style={styles.label}>{PROFILE_COPY.theme}</Text>
            <SegmentedControl
              label={PROFILE_COPY.theme}
              options={THEME_OPTIONS}
              value={preference}
              onChange={setPreference}
              testID="profile-theme"
            />
          </View>
          <View
            style={styles.row}
            accessible
            accessibilityLabel={`${PROFILE_COPY.language}, ${PROFILE_COPY.english}`}
            testID="profile-language"
          >
            <Text style={[styles.label, styles.grow]}>{PROFILE_COPY.language}</Text>
            <Text style={styles.value}>{PROFILE_COPY.english}</Text>
          </View>
        </GroupedList>

        <GroupedList title={PROFILE_COPY.data}>
          <ClearCacheRow />
        </GroupedList>
      </View>
    </Screen>
  );
}

function ProfileCard({ profile }: { profile: UserProfile }) {
  const styles = useStyles();
  // An account that never set a name goes by its email, as on Settings.
  const name = profile.name?.trim() || null;
  const title = name ?? profile.email;

  return (
    <View style={styles.card} testID="profile-card">
      <View
        style={styles.avatar}
        // Decorative: the name is right next to it.
        accessibilityElementsHidden
        importantForAccessibility="no-hide-descendants"
        testID="profile-avatar"
      >
        <Text style={styles.initials} allowFontScaling={false}>
          {initials(title)}
        </Text>
      </View>
      <View style={styles.grow}>
        {/* The full name here, never cut off (09 §7); Settings truncates it. */}
        <Text style={styles.name} testID="profile-name">
          {title}
        </Text>
        {name ? (
          <Text style={styles.email} testID="profile-email">
            {profile.email}
          </Text>
        ) : null}
      </View>
    </View>
  );
}

function ProfileSkeleton() {
  const styles = useStyles();
  return (
    <SkeletonGroup label={PROFILE_COPY.loadingProfile} testID="profile-loading">
      <View style={styles.card}>
        <Skeleton shape="mark" width={AVATAR_SIZE} height={AVATAR_SIZE} />
        <View style={[styles.grow, styles.skeletonLines]}>
          <Skeleton width="60%" height={18} />
          <Skeleton width="80%" height={14} />
        </View>
      </View>
    </SkeletonGroup>
  );
}

function ClearCacheRow() {
  const styles = useStyles();
  const queryClient = useQueryClient();
  const toast = useToast();
  const online = useIsOnline();
  const size = formatBytes(useCacheBytes());

  // Offline, clearing would throw away data that can't be loaded again.
  return (
    <Pressable
      onPress={() => {
        clearCache(queryClient);
        toast.show(PROFILE_COPY.cleared, 'success');
      }}
      disabled={!online}
      accessibilityRole="button"
      accessibilityLabel={`${PROFILE_COPY.clearCache}, ${size}`}
      accessibilityHint={online ? PROFILE_COPY.clearHint : PROFILE_COPY.clearOffline}
      accessibilityState={{ disabled: !online }}
      style={({ pressed }) => [styles.row, pressed && styles.pressed]}
      testID="profile-clear-cache"
    >
      <View style={[styles.grow, styles.rowText]}>
        <Text style={[styles.label, !online && styles.disabled]}>
          {PROFILE_COPY.clearCache}
        </Text>
        {online ? null : (
          <Text style={styles.reason} testID="profile-clear-cache-reason">
            {PROFILE_COPY.clearOffline}
          </Text>
        )}
      </View>
      <Text style={styles.value} testID="profile-cache-size">
        {size}
      </Text>
    </Pressable>
  );
}

// Rows match SettingsRow (02 §11): 16 sides, 46 tall, labelMd, muted value.
const useStyles = makeStyles(({ colors, typography }) => ({
  body: {
    gap: spacing.xl,
  },
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.lg,
    padding: spacing.lg,
  },
  avatar: {
    width: AVATAR_SIZE,
    height: AVATAR_SIZE,
    borderRadius: AVATAR_SIZE / 2,
    // 09 §6: accent at 10% with a 1px accent ring. accentSurface is the
    // token for avatar backgrounds, in both themes.
    backgroundColor: colors.accentSurface,
    borderWidth: sizes.hairline,
    borderColor: colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
  },
  initials: {
    fontFamily: fontFamily.bodyBold,
    fontSize: AVATAR_INITIALS,
    color: colors.accent,
    includeFontPadding: false,
  },
  name: {
    ...typography.displaySm,
  },
  email: {
    ...typography.bodyMd,
    color: colors.textMuted,
  },
  skeletonLines: {
    gap: spacing.sm,
  },
  themeRow: {
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    gap: spacing.sm,
    backgroundColor: colors.surface,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: Math.max(sizes.rowSettings, sizes.minTouch),
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
    gap: spacing.sm,
    backgroundColor: colors.surface,
  },
  pressed: {
    backgroundColor: colors.surface2,
  },
  grow: {
    flex: 1,
  },
  rowText: {
    gap: spacing.xs,
  },
  label: {
    ...typography.labelMd,
  },
  disabled: {
    color: colors.textMuted,
  },
  reason: {
    ...typography.caption,
  },
  value: {
    ...typography.labelMd,
    color: colors.textMuted,
  },
}));
