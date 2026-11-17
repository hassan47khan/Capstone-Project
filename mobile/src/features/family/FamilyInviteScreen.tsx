/**
 * Accept a family invitation (handoff 10 §3.5 steps 3-4; not designed).
 *
 * The landing for subtrak://family-invite?token=…, presented over the tabs.
 * Signed out, the link waits until sign-in (navigation/pendingLink.ts), so
 * someone without an account registers first and then lands here (10 §5).
 *
 * The token only ever goes to the server, in a request body. POST
 * /invitations/preview says who invited you and, in `problem`, why you can't
 * accept, so each error state shows before anyone taps Accept:
 *
 *   expired            ask for a new one
 *   accepted           already used
 *   revoked            cancelled by the admin
 *   wrong_account      it's for another address: sign in with that one
 *   already_member     you're already in this family: Open family
 *   in_another_family  leave your family first
 *   not found          the link isn't valid (also a missing token)
 *
 * Before accepting it says plainly what the admin will see, and that any
 * subscription can be marked private (10 §2, option A).
 */
import { useNavigation, useRoute, type RouteProp } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Text, View } from 'react-native';

import { ApiError, messageFor } from '@/api/errors';
import {
  Button,
  Card,
  EmptyState,
  ErrorState,
  Header,
  Screen,
  SkeletonGroup,
  Skeleton,
} from '@/components';
import type { AppStackParamList } from '@/navigation/types';
import { makeStyles, sizes, spacing } from '@/theme';

import {
  acceptInvitation,
  familyKeys,
  previewInvitation,
  type FamilyRole,
  type InvitationPreview,
} from './api';
import { ROLE_PHRASES } from './FamilyScreen';

export const ACCEPT_COPY = {
  title: 'Family invitation',
  close: 'Close',
  loading: 'Checking the invitation',
  heading: (family: string) => `Join ${family}`,
  invitedBy: (name: string | null | undefined, role: FamilyRole) =>
    name
      ? `${name} invited you as ${ROLE_PHRASES[role]}.`
      : `You're invited as ${ROLE_PHRASES[role]}.`,
  disclosure:
    'Family admins can see your subscriptions and what they cost. You can mark any subscription private: it still counts in the family total, but its name is hidden.',
  accept: 'Join family',
  decline: 'Not now',
  openFamily: 'Open family',
  invalidTitle: "This invitation link isn't valid",
  invalidMessage: 'Ask the family admin to send you a new invitation.',
} as const;

type Problem = NonNullable<InvitationPreview['problem']>;

/** Who to ask, even if the server sends no name: never "Ask null". */
function inviterOf(preview: InvitationPreview): string {
  return preview.invited_by || 'the person who invited you';
}

export function problemCopy(preview: InvitationPreview): {
  title: string;
  message: string;
} {
  const problem = preview.problem as Problem;
  switch (problem) {
    case 'expired':
      return {
        title: 'This invitation has expired',
        message: `Invitations last 7 days. Ask ${inviterOf(preview)} to send a new one.`,
      };
    case 'accepted':
      return {
        title: 'This invitation has already been used',
        message: `Ask ${inviterOf(preview)} for a new one if you still need to join.`,
      };
    case 'revoked':
      return {
        title: 'This invitation was cancelled',
        message: `Ask ${inviterOf(preview)} if you should still join ${preview.family_name}.`,
      };
    case 'wrong_account':
      return {
        title: `This invitation is for ${preview.email}`,
        message: 'Sign out, then sign in with that account to accept it.',
      };
    case 'already_member':
      return {
        title: `You're already in ${preview.family_name}`,
        message: 'There is nothing else to do.',
      };
    case 'in_another_family':
      return {
        title: "You're already in a family",
        message: `Leave it in Settings, Family first, then open this link again to join ${preview.family_name}.`,
      };
  }
}

export function FamilyInviteScreen() {
  const styles = useStyles();
  const navigation = useNavigation<NativeStackNavigationProp<AppStackParamList>>();
  const { params } = useRoute<RouteProp<AppStackParamList, 'FamilyInvite'>>();
  const token = params?.token ?? '';
  const queryClient = useQueryClient();

  const preview = useQuery({
    queryKey: familyKeys.invitation(token),
    queryFn: () => previewInvitation(token),
    enabled: token !== '',
    retry: false,
  });

  const openFamily = () =>
    navigation.navigate('MainTabs', { screen: 'Settings', params: { screen: 'Family' } });

  const accept = useMutation({
    mutationFn: () => acceptInvitation(token),
    onSuccess: (family) => {
      queryClient.setQueryData(familyKeys.dashboard(), family);
      void queryClient.invalidateQueries({ queryKey: ['analytics'] });
      openFamily();
    },
  });

  const close = () => (navigation.canGoBack() ? navigation.goBack() : openFamily());
  const header = (
    <Header title={ACCEPT_COPY.title} onClose={close} closeLabel={ACCEPT_COPY.close} />
  );

  const notFound =
    token === '' ||
    (preview.error instanceof ApiError && preview.error.code === 'invitation_not_found');

  let body;
  if (notFound) {
    body = (
      <EmptyState
        title={ACCEPT_COPY.invalidTitle}
        message={ACCEPT_COPY.invalidMessage}
        testID="invite-invalid"
      />
    );
  } else if (preview.isError) {
    body = (
      <ErrorState
        error={preview.error}
        onRetry={() => preview.refetch()}
        testID="invite-load-error"
      />
    );
  } else if (!preview.data) {
    body = (
      <SkeletonGroup label={ACCEPT_COPY.loading} testID="invite-loading">
        <Skeleton height={sizes.rowSubscription * 2} />
      </SkeletonGroup>
    );
  } else if (preview.data.problem) {
    const copy = problemCopy(preview.data);
    body = (
      <EmptyState
        title={copy.title}
        message={copy.message}
        actionLabel={
          preview.data.problem === 'already_member' ? ACCEPT_COPY.openFamily : undefined
        }
        onAction={preview.data.problem === 'already_member' ? openFamily : undefined}
        testID={`invite-problem-${preview.data.problem}`}
      />
    );
  } else {
    const data = preview.data;
    body = (
      <View style={styles.content} testID="invite-ready">
        <Card style={styles.card}>
          <Text style={styles.heading} accessibilityRole="header">
            {ACCEPT_COPY.heading(data.family_name)}
          </Text>
          <Text style={styles.body}>
            {ACCEPT_COPY.invitedBy(data.invited_by, data.role)}
          </Text>
          <Text style={styles.caption}>{ACCEPT_COPY.disclosure}</Text>
        </Card>
        {accept.isError ? (
          <Text
            style={styles.error}
            accessibilityLiveRegion="polite"
            testID="invite-accept-error"
          >
            {messageFor(accept.error)}
          </Text>
        ) : null}
        <Button
          label={ACCEPT_COPY.accept}
          onPress={() => accept.mutate()}
          loading={accept.isPending}
          testID="invite-accept"
        />
        <Button
          label={ACCEPT_COPY.decline}
          variant="secondary"
          onPress={close}
          disabled={accept.isPending}
          testID="invite-decline"
        />
      </View>
    );
  }

  return (
    <Screen edges={['top']} testID="invite-screen">
      {header}
      {body}
    </Screen>
  );
}

const useStyles = makeStyles(({ colors, typography }) => ({
  content: {
    gap: spacing.md,
    paddingBottom: spacing.xxl,
  },
  card: {
    padding: spacing.lg,
    gap: spacing.sm,
  },
  heading: {
    ...typography.displaySm,
    color: colors.text,
  },
  body: {
    ...typography.bodyMd,
    color: colors.text,
  },
  caption: {
    ...typography.caption,
    color: colors.textMuted,
  },
  // An error from the server, so `danger` is allowed (rule 3).
  error: {
    ...typography.caption,
    color: colors.danger,
  },
}));
