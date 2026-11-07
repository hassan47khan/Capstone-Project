/**
 * Invite member (handoff 10 §3.5 step 1; not designed). A sheet: email, role,
 * send. The pending invitation then shows on Family as an "Invited" row with
 * Resend and Revoke (step 2).
 *
 * Errors are the server's: `already_member` and `already_invited` mark the
 * email field; `seat_limit_reached` says to upgrade.
 */
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { Text, View } from 'react-native';

import { fieldError, messageFor } from '@/api/errors';
import { BottomSheet, Button, Select, TextField, useToast } from '@/components';
import { makeStyles, spacing } from '@/theme';

import { familyKeys, invite, type FamilyRole } from './api';

export const INVITE_COPY = {
  title: 'Invite member',
  email: 'Email',
  role: 'Role',
  send: 'Send invitation',
  note: 'The invitation works for 7 days. It says that family admins can see their subscriptions, and that they can mark any of them private.',
} as const;

export const ROLE_OPTIONS: readonly { value: FamilyRole; label: string }[] = [
  { value: 'member', label: 'Member: adds and edits their own' },
  { value: 'viewer', label: 'Viewer: read-only' },
  { value: 'admin', label: 'Admin: manages the family' },
];

export function InviteSheet({
  visible,
  onClose,
}: {
  visible: boolean;
  onClose: () => void;
}) {
  const styles = useStyles();
  const queryClient = useQueryClient();
  const toast = useToast();
  const [email, setEmail] = useState('');
  const [role, setRole] = useState<FamilyRole>('member');
  const [failure, setFailure] = useState<unknown>(null);

  const close = () => {
    setEmail('');
    setRole('member');
    setFailure(null);
    onClose();
  };

  const send = useMutation({
    mutationFn: () => invite(email.trim(), role),
    onSuccess: (invitation) => {
      void queryClient.invalidateQueries({ queryKey: familyKeys.dashboard() });
      toast.show(`Invitation sent to ${invitation.email}.`);
      close();
    },
    onError: setFailure,
  });

  const emailError = failure ? fieldError(failure, 'email') : undefined;
  const formError = failure && !emailError ? messageFor(failure) : undefined;

  return (
    <BottomSheet
      visible={visible}
      onClose={close}
      title={INVITE_COPY.title}
      dismissible={!send.isPending}
      testID="invite-sheet"
    >
      <View style={styles.body}>
        <TextField
          label={INVITE_COPY.email}
          value={email}
          onChangeText={(next) => {
            setFailure(null);
            setEmail(next);
          }}
          error={emailError}
          keyboardType="email-address"
          autoCapitalize="none"
          autoComplete="email"
          textContentType="emailAddress"
          testID="invite-email"
        />
        <Select
          label={INVITE_COPY.role}
          options={ROLE_OPTIONS}
          value={role}
          onChange={(next) => {
            setFailure(null);
            setRole(next);
          }}
          testID="invite-role"
        />
        <Text style={styles.note}>{INVITE_COPY.note}</Text>
        {formError ? (
          <Text
            style={styles.error}
            accessibilityLiveRegion="polite"
            testID="invite-error"
          >
            {formError}
          </Text>
        ) : null}
        <Button
          label={INVITE_COPY.send}
          onPress={() => send.mutate()}
          disabled={email.trim() === ''}
          loading={send.isPending}
          testID="invite-send"
        />
      </View>
    </BottomSheet>
  );
}

const useStyles = makeStyles(({ colors, typography }) => ({
  body: {
    gap: spacing.md,
  },
  note: {
    ...typography.caption,
    color: colors.textMuted,
  },
  // A form error, so `danger` is allowed (rule 3).
  error: {
    ...typography.caption,
    color: colors.danger,
  },
}));
