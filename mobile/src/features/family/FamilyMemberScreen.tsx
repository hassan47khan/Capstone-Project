/**
 * Member detail (handoff 10 §3.4; Figma `3:2537`) and the Remove confirm
 * (10 §3.6, not designed).
 *
 * Pushed from Family inside the Settings tab. Admins open anyone; everyone
 * else only themselves (the server answers 404 otherwise).
 *
 * One request: GET /family/members/{id}. The member's total and each
 * subscription's monthly amount come from the server in the family's
 * currency, and the rows add up to the total.
 *
 * Sections
 *   profile card   avatar, name, email; the role SegmentedControl inside it
 *                  (admins only; others see the role as text)
 *   permissions    three toggles and the spending limit (admins change them)
 *   subscriptions  dense rows: 28px square mark, name, "Next: Oct 03", amount.
 *                  Someone else's private subscription is "Private
 *                  subscription", amount only (10 §2 option A, §7)
 *   remove         `destructiveOutline` "Remove {Name} from family", or
 *                  "Leave family" on your own page, behind a confirm sheet that
 *                  says their subscriptions stay theirs and nothing is deleted
 *
 * Errors from the server: 409 `last_admin` (promote someone first) shows as a
 * toast and the control snaps back, since the cache only changes on success.
 *
 * Fixes from the frame: "Next: Oct 03" at 12px (02 §19), not 11; the remove
 * button is `destructiveOutline` (its tinted fill failed AA at 4.29:1).
 */
import { useNavigation, useRoute, type RouteProp } from '@react-navigation/native';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { Text, View } from 'react-native';

import { messageFor } from '@/api/errors';
import { formatMoney } from '@/api/format';
import {
  BottomSheet,
  Button,
  Card,
  ConfirmSheet,
  CurrencyField,
  ErrorState,
  GroupedList,
  Header,
  invalidPriceMessage,
  isValidPrice,
  normalizePriceInput,
  Screen,
  SegmentedControl,
  ServiceMark,
  SettingsRow,
  Skeleton,
  SkeletonGroup,
  useToast,
} from '@/components';
import type { SettingsStackParamList } from '@/navigation/types';
import { makeStyles, serviceTint, sizes, spacing, useTheme } from '@/theme';

import {
  familyKeys,
  getFamily,
  getMember,
  removeMember,
  updateMember,
  type FamilyMemberDetail,
  type FamilyRole,
  type FamilySubscription,
  type MemberChanges,
} from './api';
import { initials, ROLE_LABELS } from './FamilyScreen';

export const MEMBER_COPY = {
  back: 'Family',
  loading: 'Loading member',
  role: 'Role',
  permissions: (name: string) => `${name}'s permissions`,
  subscriptions: (name: string) => `${name}'s subscriptions`,
  canAdd: 'Can add subscriptions',
  canAddHint: 'Lets them add new subscriptions.',
  canEdit: 'Can edit own subs',
  canEditHint: 'Lets them change, cancel or delete their own subscriptions.',
  canViewTotal: 'Can view family total',
  canViewTotalHint: "Lets them see the family total and everyone else's totals.",
  limit: 'Spending limit',
  noLimit: 'None',
  limitTitle: 'Monthly spending limit',
  limitSave: 'Save limit',
  limitRemove: 'Remove limit',
  overLimit: 'Over their spending limit this month.',
  private: 'Private subscription',
  privateLabel: 'Private subscription, details hidden',
  none: 'No subscriptions counted this month.',
  total: 'Total',
  remove: (name: string) => `Remove ${name} from family`,
  leave: 'Leave family',
  removeTitle: (name: string) => `Remove ${name}?`,
  leaveTitle: 'Leave the family?',
  removeMessage: (name: string) =>
    `${name}'s subscriptions leave the family total and stay in their own account. Nothing is deleted.`,
  leaveMessage:
    'Your subscriptions leave the family total and stay in your account. Nothing is deleted.',
  removeConfirm: 'Remove',
  leaveConfirm: 'Leave',
} as const;

/** 10 §7: the role control says what each role can do. */
export const ROLE_CONSEQUENCES: Record<FamilyRole, string> = {
  admin: 'Can manage members, permissions and the family settings.',
  member: 'Can add and edit their own subscriptions.',
  viewer: 'Read-only. Can be kept from seeing the family total.',
};

const ROLE_SEGMENTS = (['admin', 'member', 'viewer'] as const).map((value) => ({
  value,
  label: ROLE_LABELS[value],
}));

const NEXT_FORMAT = new Intl.DateTimeFormat('en-US', {
  month: 'short',
  day: '2-digit',
  timeZone: 'UTC',
});

/** "Next: Oct 03" from "2026-10-03". */
export function nextLabel(date: string | null): string | null {
  if (!date) return null;
  return `Next: ${NEXT_FORMAT.format(new Date(`${date}T00:00:00Z`))}`;
}

export function FamilyMemberScreen() {
  const navigation = useNavigation();
  const { params } = useRoute<RouteProp<SettingsStackParamList, 'FamilyMember'>>();
  const member = useQuery({
    queryKey: familyKeys.member(params.id),
    queryFn: () => getMember(params.id),
  });

  const header = (
    <Header
      title={member.data?.name ?? ''}
      backLabel={MEMBER_COPY.back}
      onBack={() => navigation.goBack()}
    />
  );

  if (member.isError && !member.data) {
    return (
      <Screen edges={['top']} testID="member-screen">
        {header}
        <ErrorState
          error={member.error}
          onRetry={() => member.refetch()}
          testID="member-error"
        />
      </Screen>
    );
  }

  return (
    <Screen
      edges={['top']}
      onRefresh={() => member.refetch()}
      refreshing={member.isRefetching}
      testID="member-screen"
    >
      {header}
      {member.data ? <Loaded member={member.data} /> : <Loading />}
    </Screen>
  );
}

function Loading() {
  const styles = useStyles();
  return (
    <SkeletonGroup label={MEMBER_COPY.loading} testID="member-loading">
      <View style={styles.content}>
        <Skeleton height={sizes.rowSubscription * 2} />
        {[0, 1, 2].map((i) => (
          <Skeleton key={i} height={sizes.rowSettings} />
        ))}
      </View>
    </SkeletonGroup>
  );
}

/** Whether the signed-in user is the family's admin. Family loaded it already. */
function useViewerIsAdmin(): boolean {
  const family = useQuery({ queryKey: familyKeys.dashboard(), queryFn: getFamily });
  return family.data?.you.role === 'admin';
}

function Loaded({ member }: { member: FamilyMemberDetail }) {
  const styles = useStyles();
  const { colors, servicePalette } = useTheme();
  const queryClient = useQueryClient();
  const navigation = useNavigation();
  const toast = useToast();
  const isAdmin = useViewerIsAdmin();
  const [confirming, setConfirming] = useState(false);
  const [editingLimit, setEditingLimit] = useState(false);
  const first = member.name.split(' ')[0] ?? member.name;
  const currency = member.total.currency;

  const change = useMutation({
    mutationFn: (changes: MemberChanges) => updateMember(member.id, changes),
    onSuccess: (updated) => {
      queryClient.setQueryData(familyKeys.member(member.id), updated);
      void queryClient.invalidateQueries({ queryKey: familyKeys.dashboard() });
    },
    onError: (error) => toast.show(messageFor(error), 'neutral'),
  });

  const remove = useMutation({
    mutationFn: () => removeMember(member.id),
    onSuccess: () => {
      setConfirming(false);
      toast.show(
        member.is_you ? 'You left the family.' : `${first} was removed from the family.`,
      );
      void queryClient.invalidateQueries({ queryKey: familyKeys.all });
      navigation.goBack();
    },
    onError: (error) => {
      setConfirming(false);
      toast.show(messageFor(error), 'neutral');
    },
  });

  const limit = member.spending_limit
    ? formatMoney(member.spending_limit.amount, member.spending_limit.currency).display
    : MEMBER_COPY.noLimit;
  const total = formatMoney(member.total.amount, member.total.currency).display;

  return (
    <View style={styles.content}>
      <Card style={styles.profile} testID="member-profile">
        <View style={styles.profileTop}>
          <ServiceMark
            name={member.name}
            mark={initials(member.name)}
            brand={{
              tint: serviceTint(member.name, servicePalette).tint,
              ink: colors.text,
            }}
            size="medium"
          />
          <View style={styles.titles}>
            <Text style={styles.profileName} accessibilityRole="header">
              {member.is_you ? `${member.name} (you)` : member.name}
            </Text>
            <Text style={styles.caption}>{member.email}</Text>
          </View>
        </View>
        {isAdmin ? (
          <SegmentedControl
            label={MEMBER_COPY.role}
            options={ROLE_SEGMENTS}
            value={member.role}
            onChange={(role) => change.mutate({ role })}
            testID="member-role"
          />
        ) : (
          <Text style={styles.roleText} testID="member-role-text">
            {ROLE_LABELS[member.role]}
          </Text>
        )}
        <Text style={styles.caption} testID="member-role-consequence">
          {ROLE_CONSEQUENCES[member.role]}
        </Text>
      </Card>

      <GroupedList title={MEMBER_COPY.permissions(first)} testID="member-permissions">
        <SettingsRow
          variant="toggle"
          label={MEMBER_COPY.canAdd}
          description={MEMBER_COPY.canAddHint}
          value={member.can_add_subscriptions}
          onValueChange={(next) => change.mutate({ can_add_subscriptions: next })}
          disabled={!isAdmin || change.isPending}
          testID="member-can-add"
        />
        <SettingsRow
          variant="toggle"
          label={MEMBER_COPY.canEdit}
          description={MEMBER_COPY.canEditHint}
          value={member.can_edit_own_subs}
          onValueChange={(next) => change.mutate({ can_edit_own_subs: next })}
          disabled={!isAdmin || change.isPending}
          testID="member-can-edit"
        />
        <SettingsRow
          variant="toggle"
          label={MEMBER_COPY.canViewTotal}
          description={MEMBER_COPY.canViewTotalHint}
          value={member.can_view_family_total}
          onValueChange={(next) => change.mutate({ can_view_family_total: next })}
          disabled={!isAdmin || change.isPending}
          testID="member-can-view-total"
        />
        {isAdmin ? (
          <SettingsRow
            label={MEMBER_COPY.limit}
            value={limit}
            onPress={() => setEditingLimit(true)}
            testID="member-limit"
          />
        ) : (
          <View style={styles.limitRow} accessible testID="member-limit">
            <Text style={styles.rowLabel}>{MEMBER_COPY.limit}</Text>
            <Text style={styles.limitValue}>{limit}</Text>
          </View>
        )}
      </GroupedList>
      {member.over_limit ? (
        <Text style={styles.caption} testID="member-over-limit">
          {MEMBER_COPY.overLimit}
        </Text>
      ) : null}

      <GroupedList title={MEMBER_COPY.subscriptions(first)} testID="member-subscriptions">
        {member.subscriptions.length === 0 ? (
          <Text
            style={[styles.caption, styles.emptyRow]}
            testID="member-subscriptions-empty"
          >
            {MEMBER_COPY.none}
          </Text>
        ) : (
          member.subscriptions.map((sub, index) => (
            <SubscriptionRow key={sub.id ?? `private-${index}`} sub={sub} index={index} />
          ))
        )}
      </GroupedList>
      <View
        style={styles.totalLine}
        accessible
        accessibilityLabel={`${MEMBER_COPY.total}: ${total} per month`}
        testID="member-total"
      >
        <Text style={styles.rowLabel}>{MEMBER_COPY.total}</Text>
        <Text style={styles.amount}>{total}/mo</Text>
      </View>

      {isAdmin || member.is_you ? (
        <Button
          label={member.is_you ? MEMBER_COPY.leave : MEMBER_COPY.remove(first)}
          variant="destructiveOutline"
          onPress={() => setConfirming(true)}
          testID="member-remove"
        />
      ) : null}

      <ConfirmSheet
        visible={confirming}
        title={member.is_you ? MEMBER_COPY.leaveTitle : MEMBER_COPY.removeTitle(first)}
        message={
          member.is_you ? MEMBER_COPY.leaveMessage : MEMBER_COPY.removeMessage(first)
        }
        confirmLabel={
          member.is_you ? MEMBER_COPY.leaveConfirm : MEMBER_COPY.removeConfirm
        }
        onConfirm={() => remove.mutate()}
        onCancel={() => setConfirming(false)}
        destructive
        testID="member-remove-confirm"
      />

      <LimitSheet
        visible={editingLimit}
        currency={currency}
        initial={member.spending_limit?.amount ?? ''}
        onClose={() => setEditingLimit(false)}
        onSave={(value) => {
          change.mutate({ spending_limit: value });
          setEditingLimit(false);
        }}
      />
    </View>
  );
}

function SubscriptionRow({ sub, index }: { sub: FamilySubscription; index: number }) {
  const styles = useStyles();
  const amount = sub.monthly
    ? formatMoney(sub.monthly.amount, sub.monthly.currency).display
    : '';
  const hidden = sub.name === null;
  const name = sub.name ?? MEMBER_COPY.private;
  const next = nextLabel(sub.next_bill_date);
  const label = hidden
    ? `${MEMBER_COPY.privateLabel}, ${amount} per month`
    : [name, next, amount && `${amount} per month`].filter(Boolean).join(', ');

  return (
    <View
      style={styles.subRow}
      accessible
      accessibilityLabel={label}
      testID={`member-sub-${sub.id ?? `private-${index}`}`}
    >
      <ServiceMark
        name={name}
        mark={hidden ? '?' : sub.service_mark?.mark}
        brand={
          sub.service_mark
            ? { tint: sub.service_mark.tint_hex, ink: sub.service_mark.brand_hex }
            : undefined
        }
        size="square"
        shape="square"
      />
      <View style={styles.titles}>
        <Text style={hidden ? styles.privateName : styles.subName} numberOfLines={1}>
          {name}
        </Text>
        {next ? <Text style={styles.caption}>{next}</Text> : null}
      </View>
      <Text style={styles.amount}>{amount}</Text>
    </View>
  );
}

function LimitSheet({
  visible,
  currency,
  initial,
  onClose,
  onSave,
}: {
  visible: boolean;
  currency: string;
  initial: string;
  onClose: () => void;
  onSave: (value: string | null) => void;
}) {
  const styles = useStyles();
  const [value, setValue] = useState(initial);
  const [touched, setTouched] = useState(false);
  const [lastInitial, setLastInitial] = useState(initial);
  // Start from the current limit each time it changes (render-time reset, not an effect).
  if (lastInitial !== initial) {
    setLastInitial(initial);
    setValue(initial);
  }
  const valid = isValidPrice(value);

  return (
    <BottomSheet
      visible={visible}
      onClose={onClose}
      title={MEMBER_COPY.limitTitle}
      testID="member-limit-sheet"
    >
      <View style={styles.sheetBody}>
        <CurrencyField
          value={value}
          onChangeValue={(next) => setValue(normalizePriceInput(next, currency))}
          currency={currency}
          error={touched && !valid ? invalidPriceMessage(currency) : undefined}
          onBlur={() => setTouched(true)}
          testID="member-limit-input"
        />
        <Button
          label={MEMBER_COPY.limitSave}
          onPress={() => onSave(value)}
          disabled={!valid}
          testID="member-limit-save"
        />
        {initial ? (
          <Button
            label={MEMBER_COPY.limitRemove}
            variant="secondary"
            onPress={() => onSave(null)}
            testID="member-limit-remove"
          />
        ) : null}
      </View>
    </BottomSheet>
  );
}

const useStyles = makeStyles(({ colors, typography }) => ({
  content: {
    gap: spacing.lg,
    paddingBottom: spacing.xxl,
  },
  profile: {
    padding: spacing.lg,
    gap: spacing.md,
  },
  profileTop: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  titles: {
    flex: 1,
    gap: spacing.xs / 2,
  },
  // Measured DM Serif 18; nearest display token.
  profileName: {
    ...typography.displaySm,
    color: colors.text,
  },
  roleText: {
    ...typography.labelSemibold,
    color: colors.text,
  },
  caption: {
    ...typography.caption,
    color: colors.textMuted,
  },
  limitRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    minHeight: sizes.rowSettings,
    paddingHorizontal: spacing.lg,
  },
  rowLabel: {
    ...typography.labelMd,
    color: colors.text,
  },
  // 10 §3.4: the limit in `accent` Bold.
  limitValue: {
    ...typography.labelBold,
    color: colors.accent,
  },
  emptyRow: {
    padding: spacing.lg,
  },
  subRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
  },
  subName: {
    ...typography.labelSemibold,
    color: colors.text,
  },
  privateName: {
    ...typography.labelSemibold,
    color: colors.textMuted,
  },
  amount: {
    ...typography.labelBold,
    color: colors.text,
  },
  totalLine: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.lg,
  },
  sheetBody: {
    gap: spacing.md,
  },
}));
