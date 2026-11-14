/**
 * Family (handoff 10 §3.1 dashboard + §3.3 members list; Figma `3:2463`).
 *
 * Pushed inside the Settings tab, like Shared plans. One screen rather than
 * two: the dashboard's member breakdown and the members list are the same
 * rows, so the family total sits on top of the list.
 *
 * One request: GET /family. The server works out the family total and every
 * member's total in the family's currency, and member rows add up to the
 * total exactly. The client never sums.
 *
 * States
 *   loading      skeleton rows
 *   no family    "Start a family" with a name field (404 `no_family`)
 *   failed       full-screen error + Try again
 *   loaded       total card (when you may see it), member rows, invited rows,
 *                Invite member
 *
 * Roles: admins see Invited rows with Resend and Revoke, and Invite member;
 * Invite stays visible but disabled with the upgrade prompt when every seat is
 * taken (10 §6). Without `can_view_family_total` the total card is replaced by
 * a line saying so, and other members show no figure. A row opens Member
 * detail when you're an admin, or when it's you.
 *
 * Fixes from the frame: role badges use `Badge` at 12px (02 §19) rather than
 * the 9px uppercase chips, and avatar tints come from the name, never `danger`.
 */
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ChevronRight } from 'lucide-react-native';
import { useState } from 'react';
import { Pressable, Text, View } from 'react-native';

import { formatMoney } from '@/api/format';
import { messageFor } from '@/api/errors';
import {
  Badge,
  Button,
  Card,
  ErrorState,
  Header,
  Screen,
  ServiceMark,
  Skeleton,
  SkeletonGroup,
  TextField,
  useToast,
} from '@/components';
import type { SettingsStackParamList } from '@/navigation/types';
import { makeStyles, radius, serviceTint, sizes, spacing, useTheme } from '@/theme';

import {
  createFamily,
  familyKeys,
  getFamily,
  isNoFamily,
  resendInvitation,
  revokeInvitation,
  type Family,
  type FamilyMember,
  type FamilyRole,
  type Invitation,
} from './api';
import { InviteSheet } from './InviteSheet';

export const FAMILY_COPY = {
  title: 'Family',
  back: 'Settings',
  loading: 'Loading your family',
  total: 'Family total',
  perMonth: '/mo',
  hiddenTotal: "Your family admin hasn't shared the family total with you.",
  invite: 'Invite member',
  seatsFull: 'Every seat is taken. Upgrade the plan to invite more people.',
  invited: 'Invited',
  expired: 'Expired',
  resend: 'Resend',
  revoke: 'Revoke',
  startTitle: 'Start a family',
  startMessage:
    'See everyone’s subscriptions add up to one family total. Members can mark any subscription private.',
  startName: 'Family name',
  startSave: 'Start family',
  unconverted: (n: number) =>
    `${n} subscription${n === 1 ? '' : 's'} left out: no exchange rate for ${n === 1 ? 'its' : 'their'} currency.`,
} as const;

export const ROLE_LABELS: Record<FamilyRole, string> = {
  admin: 'Admin',
  member: 'Member',
  viewer: 'Viewer',
};

/** A role inside a sentence, with its article: "as an admin", "as a member". */
export const ROLE_PHRASES: Record<FamilyRole, string> = {
  admin: 'an admin',
  member: 'a member',
  viewer: 'a viewer',
};

/** "Family Members (3 of 5)": the seat count in the title (10 §3.3). */
export function membersTitle(family: Family): string {
  return `Family Members (${family.seats_used} of ${family.seat_limit})`;
}

/** "$45.98/mo · 4 subscriptions", or just the count when the total is hidden. */
export function memberCaption(member: FamilyMember): string {
  const count = `${member.subscription_count} subscription${member.subscription_count === 1 ? '' : 's'}`;
  if (!member.total) return count;
  const amount = formatMoney(member.total.amount, member.total.currency).display;
  return `${amount}${FAMILY_COPY.perMonth} · ${count}`;
}

/** 10 §7: "Jordan Doe, member, 4 subscriptions, $45.98 per month." */
export function memberLabel(member: FamilyMember): string {
  const count = `${member.subscription_count} subscription${member.subscription_count === 1 ? '' : 's'}`;
  const parts = [
    member.is_you ? `${member.name} (you)` : member.name,
    member.role,
    count,
  ];
  if (member.total) {
    parts.push(
      `${formatMoney(member.total.amount, member.total.currency).display} per month`,
    );
  }
  return `${parts.join(', ')}.`;
}

/** "AK" from "Alex Kim", "S" from "Sam". */
export function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  const letters = parts.length > 1 ? [parts[0]!, parts[parts.length - 1]!] : parts;
  return letters.map((part) => Array.from(part)[0]!.toUpperCase()).join('') || '?';
}

export function FamilyScreen() {
  const navigation = useNavigation();
  const family = useQuery({ queryKey: familyKeys.dashboard(), queryFn: getFamily });

  const header = (
    <Header
      title={family.data ? membersTitle(family.data) : FAMILY_COPY.title}
      backLabel={FAMILY_COPY.back}
      onBack={() => navigation.goBack()}
    />
  );

  if (family.isError && !family.data) {
    return (
      <Screen edges={['top']} testID="family-screen">
        {header}
        {isNoFamily(family.error) ? (
          <StartFamily />
        ) : (
          <ErrorState
            error={family.error}
            onRetry={() => family.refetch()}
            testID="family-error"
          />
        )}
      </Screen>
    );
  }

  return (
    <Screen
      edges={['top']}
      onRefresh={() => family.refetch()}
      refreshing={family.isRefetching}
      testID="family-screen"
    >
      {header}
      {family.data ? <Loaded family={family.data} /> : <Loading />}
    </Screen>
  );
}

function Loading() {
  const styles = useStyles();
  return (
    <SkeletonGroup label={FAMILY_COPY.loading} testID="family-loading">
      <View style={styles.content}>
        <Skeleton height={sizes.button * 2} />
        {[0, 1, 2].map((i) => (
          <Skeleton key={i} height={sizes.rowSubscription} />
        ))}
      </View>
    </SkeletonGroup>
  );
}

function StartFamily() {
  const styles = useStyles();
  const queryClient = useQueryClient();
  const [name, setName] = useState('');
  const [error, setError] = useState<string>();
  const start = useMutation({
    mutationFn: () => createFamily(name.trim()),
    onSuccess: (family) => queryClient.setQueryData(familyKeys.dashboard(), family),
    onError: (failure) => setError(messageFor(failure)),
  });

  return (
    <View style={styles.content} testID="family-start">
      <Text style={styles.startTitle} accessibilityRole="header">
        {FAMILY_COPY.startTitle}
      </Text>
      <Text style={styles.caption}>{FAMILY_COPY.startMessage}</Text>
      <TextField
        label={FAMILY_COPY.startName}
        value={name}
        onChangeText={(next) => {
          setError(undefined);
          setName(next);
        }}
        error={error}
        autoCapitalize="words"
        returnKeyType="done"
        testID="family-start-name"
      />
      <Button
        label={FAMILY_COPY.startSave}
        onPress={() => start.mutate()}
        disabled={name.trim() === ''}
        loading={start.isPending}
        testID="family-start-save"
      />
    </View>
  );
}

function Loaded({ family }: { family: Family }) {
  const styles = useStyles();
  const stack = useNavigation<NativeStackNavigationProp<SettingsStackParamList>>();
  const [inviting, setInviting] = useState(false);
  const isAdmin = family.you.role === 'admin';

  return (
    <View style={styles.content}>
      {family.total ? (
        <Card
          style={styles.totalCard}
          accessibilityLabel={`${FAMILY_COPY.total}: ${formatMoney(family.total.amount, family.total.currency).display} per month.`}
          testID="family-total"
        >
          <Text style={styles.totalLabel}>{FAMILY_COPY.total}</Text>
          <Text style={styles.totalFigure}>
            {formatMoney(family.total.amount, family.total.currency).display}
            <Text style={styles.caption}>{FAMILY_COPY.perMonth}</Text>
          </Text>
          {family.unconverted_count ? (
            <Text style={styles.caption}>
              {FAMILY_COPY.unconverted(family.unconverted_count)}
            </Text>
          ) : null}
        </Card>
      ) : (
        <Text style={styles.caption} testID="family-total-hidden">
          {FAMILY_COPY.hiddenTotal}
        </Text>
      )}

      {family.members.map((member) => (
        <MemberRow
          key={member.id}
          member={member}
          onPress={
            isAdmin || member.is_you
              ? () => stack.navigate('FamilyMember', { id: member.id })
              : undefined
          }
        />
      ))}

      {family.invitations.map((invitation) => (
        <InvitedRow key={invitation.id} invitation={invitation} />
      ))}

      {isAdmin ? (
        <View style={styles.inviteBlock}>
          <Button
            label={FAMILY_COPY.invite}
            onPress={() => setInviting(true)}
            disabled={!family.can_invite}
            testID="family-invite"
          />
          {!family.can_invite ? (
            <Text style={styles.caption} testID="family-seats-full">
              {FAMILY_COPY.seatsFull}
            </Text>
          ) : null}
        </View>
      ) : null}

      <InviteSheet visible={inviting} onClose={() => setInviting(false)} />
    </View>
  );
}

function Avatar({ name }: { name: string }) {
  const { colors, servicePalette } = useTheme();
  return (
    <ServiceMark
      name={name}
      mark={initials(name)}
      // Tint from the name; initials in `text`, never `danger` (10 §3.3).
      brand={{ tint: serviceTint(name, servicePalette).tint, ink: colors.text }}
      size="row"
    />
  );
}

function MemberRow({ member, onPress }: { member: FamilyMember; onPress?: () => void }) {
  const styles = useStyles();
  const { colors } = useTheme();
  const body = (
    <>
      <Avatar name={member.name} />
      <View style={styles.titles}>
        <View style={styles.nameLine}>
          <Text style={styles.name} numberOfLines={1}>
            {member.is_you ? `${member.name} (you)` : member.name}
          </Text>
          <Badge
            label={ROLE_LABELS[member.role]}
            tone={member.role === 'admin' ? 'accent' : 'neutral'}
            testID={`family-role-${member.id}`}
          />
        </View>
        <Text style={styles.caption}>{memberCaption(member)}</Text>
      </View>
      {onPress ? (
        <ChevronRight size={sizes.iconSmall} color={colors.textMuted} strokeWidth={2} />
      ) : null}
    </>
  );
  if (!onPress) {
    return (
      <View
        style={styles.row}
        accessible
        accessibilityLabel={memberLabel(member)}
        testID={`family-member-${member.id}`}
      >
        {body}
      </View>
    );
  }
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [styles.row, pressed && styles.rowPressed]}
      accessibilityRole="button"
      accessibilityLabel={memberLabel(member)}
      testID={`family-member-${member.id}`}
    >
      {body}
    </Pressable>
  );
}

function InvitedRow({ invitation }: { invitation: Invitation }) {
  const styles = useStyles();
  const toast = useToast();
  const queryClient = useQueryClient();
  const refresh = () =>
    queryClient.invalidateQueries({ queryKey: familyKeys.dashboard() });
  const expired = invitation.status === 'expired';

  const resend = useMutation({
    mutationFn: () => resendInvitation(invitation.id),
    onSuccess: () => {
      toast.show(`Invitation sent again to ${invitation.email}.`);
      void refresh();
    },
    onError: (error) => toast.show(messageFor(error), 'neutral'),
  });
  const revoke = useMutation({
    mutationFn: () => revokeInvitation(invitation.id),
    onSuccess: () => {
      toast.show(`Invitation to ${invitation.email} revoked.`, 'neutral');
      void refresh();
    },
    onError: (error) => toast.show(messageFor(error), 'neutral'),
  });
  const status = expired ? FAMILY_COPY.expired : FAMILY_COPY.invited;

  return (
    <View style={styles.invited} testID={`family-invitation-${invitation.id}`}>
      <View
        style={styles.invitedInfo}
        accessible
        accessibilityLabel={`${invitation.email}, ${ROLE_LABELS[invitation.role]}, ${status}`}
      >
        <Avatar name={invitation.email} />
        <View style={styles.titles}>
          <Text style={styles.name} numberOfLines={1}>
            {invitation.email}
          </Text>
          <Text style={styles.caption}>{ROLE_LABELS[invitation.role]}</Text>
        </View>
        <Badge label={status} tone={expired ? 'neutral' : 'warning'} />
      </View>
      <View style={styles.invitedActions}>
        <Button
          label={FAMILY_COPY.revoke}
          variant="ghost"
          onPress={() => revoke.mutate()}
          loading={revoke.isPending}
          disabled={resend.isPending}
          accessibilityLabel={`Revoke the invitation to ${invitation.email}`}
          testID={`family-revoke-${invitation.id}`}
        />
        <Button
          label={FAMILY_COPY.resend}
          variant="secondary"
          onPress={() => resend.mutate()}
          loading={resend.isPending}
          disabled={revoke.isPending}
          accessibilityLabel={`Resend the invitation to ${invitation.email}`}
          testID={`family-resend-${invitation.id}`}
        />
      </View>
    </View>
  );
}

const useStyles = makeStyles(({ colors, typography }) => ({
  // 10 §3.3: rows 10 apart; nearest token is 8.
  content: {
    gap: spacing.sm,
    paddingBottom: spacing.xxl,
  },
  totalCard: {
    padding: spacing.lg,
    gap: spacing.xs,
    marginBottom: spacing.sm,
  },
  totalLabel: {
    ...typography.sectionLabel,
    color: colors.textMuted,
  },
  totalFigure: {
    ...typography.displayLg,
  },
  // 10 §3.3: surface, 1px border, radius 6, height 72, padding 16, gap 12.
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    minHeight: sizes.rowSubscription,
    padding: spacing.lg,
    backgroundColor: colors.surface,
    borderWidth: sizes.hairline,
    borderColor: colors.border,
    borderRadius: radius.card,
  },
  rowPressed: {
    backgroundColor: colors.surface2,
  },
  titles: {
    flex: 1,
    gap: spacing.xs / 2,
  },
  nameLine: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  name: {
    ...typography.labelSemibold,
    color: colors.text,
    flexShrink: 1,
  },
  caption: {
    ...typography.caption,
    color: colors.textMuted,
  },
  invited: {
    gap: spacing.sm,
    padding: spacing.lg,
    backgroundColor: colors.surface,
    borderWidth: sizes.hairline,
    borderColor: colors.border,
    borderRadius: radius.card,
  },
  invitedInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  invitedActions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: spacing.sm,
  },
  inviteBlock: {
    gap: spacing.sm,
    marginTop: spacing.sm,
  },
  startTitle: {
    ...typography.displaySm,
    color: colors.text,
  },
}));
