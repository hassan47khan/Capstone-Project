/**
 * Notifications inbox (US-13; spec §10 "Notifications inbox": missed-alert
 * banner, permission-denied explanation).
 *
 * Every alert the server raised is here, whether or not the push arrived.
 * That is the point of the inbox: with push off, or Expo down, or the workers
 * behind, this list is still complete, because GET /notifications folds in
 * anything already due first (spec §8, graded fallback).
 *
 * States
 *   loading   skeleton rows
 *   error     ErrorState with retry (offline gets its own variant)
 *   empty     "No alerts yet"
 *   missed    an amber banner when pushes failed for good (`missed_count`)
 *   blocked   a note when the OS has push off, with a link to Settings
 *
 * Opening a row marks it read and, if it is about a subscription, opens it.
 */
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { BellOff, Inbox } from 'lucide-react-native';
import { useCallback, useState } from 'react';
import { Linking, Pressable, Text, View } from 'react-native';

import {
  AlertCard,
  Button,
  Card,
  EmptyState,
  ErrorState,
  Header,
  Screen,
  Skeleton,
  SkeletonGroup,
} from '@/components';
import type { AppStackParamList } from '@/navigation/types';
import { makeStyles, opacity, radius, sizes, spacing, useTheme } from '@/theme';

import {
  listNotifications,
  markNotificationRead,
  notificationsKey,
  type InboxNotification,
  type NotificationList,
} from './api';
import {
  INBOX_COPY,
  MISSED_BODY,
  missedTitle,
  receivedOn,
  rowLabel,
} from './notificationCopy';
import { pushIsBlocked } from './push';

type Navigation = NativeStackNavigationProp<AppStackParamList, 'Notifications'>;

export function NotificationsScreen() {
  const styles = useStyles();
  const navigation = useNavigation<Navigation>();
  const queryClient = useQueryClient();
  const inbox = useQuery({ queryKey: notificationsKey, queryFn: listNotifications });
  const [blocked, setBlocked] = useState(false);

  // Checked on focus, so coming back from the OS Settings app updates it.
  useFocusEffect(
    useCallback(() => {
      let live = true;
      void pushIsBlocked().then((value) => {
        if (live) setBlocked(value);
      });
      return () => {
        live = false;
      };
    }, []),
  );

  const read = useMutation({
    mutationFn: markNotificationRead,
    // Shown read at once; the server agrees, or the refetch puts it back.
    onMutate: (id: string) => {
      queryClient.setQueryData<NotificationList>(notificationsKey, (list) =>
        list ? markRead(list, id) : list,
      );
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey: notificationsKey }),
  });

  const open = (row: InboxNotification) => {
    if (!row.read) read.mutate(row.id);
    if (row.subscription_id) {
      navigation.navigate('SubscriptionDetail', { id: row.subscription_id });
    }
  };

  const data = inbox.data;

  return (
    <Screen
      edges={['top', 'bottom']}
      onRefresh={data ? () => inbox.refetch() : undefined}
      refreshing={inbox.isRefetching}
      contentStyle={styles.content}
      testID="notifications-screen"
    >
      <Header title={INBOX_COPY.title} onClose={() => navigation.goBack()} />

      {blocked ? <BlockedNote /> : null}

      {data ? (
        <>
          {data.missed_count > 0 ? (
            <AlertCard
              title={missedTitle(data.missed_count)}
              message={MISSED_BODY}
              testID="notifications-missed"
            />
          ) : null}
          {data.results.length === 0 ? (
            <EmptyState
              icon={Inbox}
              title={INBOX_COPY.emptyTitle}
              message={INBOX_COPY.emptyBody}
              testID="notifications-empty"
            />
          ) : (
            <View style={styles.list} testID="notifications-list">
              {data.results.map((row) => (
                <InboxRow key={row.id} row={row} onPress={() => open(row)} />
              ))}
            </View>
          )}
        </>
      ) : inbox.isError ? (
        <ErrorState
          error={inbox.error}
          onRetry={() => inbox.refetch()}
          testID="notifications-error"
        />
      ) : (
        <SkeletonGroup label={INBOX_COPY.loading} testID="notifications-loading">
          <View style={styles.list}>
            {[0, 1, 2].map((key) => (
              <Skeleton key={key} height={sizes.rowSubscription} />
            ))}
          </View>
        </SkeletonGroup>
      )}
    </Screen>
  );
}

function markRead(list: NotificationList, id: string): NotificationList {
  const target = list.results.find((row) => row.id === id);
  if (!target || target.read) return list;
  return {
    ...list,
    unread_count: Math.max(0, list.unread_count - 1),
    missed_count: target.missed ? Math.max(0, list.missed_count - 1) : list.missed_count,
    results: list.results.map((row) => (row.id === id ? { ...row, read: true } : row)),
  };
}

function InboxRow({ row, onPress }: { row: InboxNotification; onPress: () => void }) {
  const styles = useStyles();
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={rowLabel(row)}
      accessibilityHint={row.subscription_id ? 'Opens the subscription' : undefined}
      style={({ pressed }) => [styles.row, pressed && styles.pressed]}
      testID={`notification-${row.id}`}
    >
      <View style={styles.dotSlot}>
        {row.read ? null : (
          <View style={styles.dot} testID={`notification-${row.id}-unread`} />
        )}
      </View>
      <View style={styles.rowText}>
        <View style={styles.titleLine}>
          <Text style={[styles.title, !row.read && styles.titleUnread]} numberOfLines={2}>
            {row.title}
          </Text>
          <Text style={styles.date}>{receivedOn(row)}</Text>
        </View>
        <Text style={styles.body}>{row.body}</Text>
      </View>
    </Pressable>
  );
}

function BlockedNote() {
  const styles = useStyles();
  const { colors } = useTheme();
  return (
    <Card testID="notifications-blocked">
      <View style={styles.blocked}>
        <View style={styles.blockedText}>
          <View style={styles.blockedTitleLine}>
            <BellOff size={sizes.iconSmall} color={colors.textMuted} />
            <Text style={styles.blockedTitle}>{INBOX_COPY.blockedTitle}</Text>
          </View>
          <Text style={styles.body}>{INBOX_COPY.blockedBody}</Text>
        </View>
        <Button
          label={INBOX_COPY.blockedAction}
          variant="secondary"
          onPress={() => void Linking.openSettings()}
          accessibilityHint="Opens SubTrak in your phone's settings"
          testID="notifications-open-settings"
        />
      </View>
    </Card>
  );
}

const useStyles = makeStyles(({ colors, typography }) => ({
  content: {
    gap: spacing.lg,
    paddingBottom: spacing.lg,
  },
  list: {
    gap: spacing.sm,
  },
  row: {
    flexDirection: 'row',
    gap: spacing.md,
    minHeight: sizes.minTouch,
    padding: spacing.lg,
    borderRadius: radius.card,
    borderWidth: sizes.hairline,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  pressed: {
    opacity: opacity.pressed,
  },
  dotSlot: {
    width: sizes.dot,
    paddingTop: spacing.sm,
  },
  dot: {
    width: sizes.dot,
    height: sizes.dot,
    borderRadius: radius.pill,
    backgroundColor: colors.accent,
  },
  rowText: {
    flex: 1,
    gap: spacing.xs,
  },
  titleLine: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: spacing.sm,
  },
  title: {
    ...typography.labelMd,
    color: colors.text,
    flex: 1,
  },
  titleUnread: {
    ...typography.labelSemibold,
  },
  date: {
    ...typography.caption,
    color: colors.textMuted,
  },
  body: {
    ...typography.bodyMd,
    color: colors.textMuted,
  },
  blocked: {
    gap: spacing.md,
  },
  blockedText: {
    gap: spacing.xs,
  },
  blockedTitleLine: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  blockedTitle: {
    ...typography.labelSemibold,
    color: colors.text,
  },
}));
