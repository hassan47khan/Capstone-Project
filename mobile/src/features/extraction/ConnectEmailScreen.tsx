/**
 * Connect email (handoff 11 §2.3, §2.8; US-9 to US-11). Figma `110:14`,
 * failed `110:496`.
 *
 * Pushed inside the Settings tab (from Settings → Connected email and Home's
 * "Find them in my email"), so it goes back rather than closing.
 *
 * The flow
 *   Connect Gmail → Google's consent screen (gmailAuth.ts) → POST
 *   /integrations/gmail/connect → POST /extractions/scan → GET
 *   /extractions/pending, polled every 2 seconds while `scanning` is true.
 *   Each result opens Review extraction. Nothing is ever added from here:
 *   only Review's "Confirm and track" creates a subscription (11 §2.7).
 *
 * States
 *   connect     benefits card, Connect Gmail, "Not now — add manually"
 *   connecting  Connect Gmail spins; the browser is open
 *   failed      danger card "Couldn't connect to Gmail" (a real error, the one
 *               place red is allowed on these screens) + Try again + Add a
 *               subscription manually. Closing the browser is not a failure:
 *               it just goes back to `connect`.
 *   scanning    "Scanning your inbox…" with a spinner and Cancel; results
 *               appear as they arrive
 *   results     the list to review ("Confirm all" is deliberately not offered)
 *   nothing     "No subscriptions found" + Add one manually
 *   unavailable the AI is off or out of quota (503 `extraction_unavailable`):
 *               say so and offer manual entry
 *
 * Outlook is hidden for the MVP (11 §2.1): a button that does nothing is a
 * dead end. There's no "is Gmail connected?" endpoint yet, so a returning user
 * with nothing pending sees Connect Gmail again; connecting twice is harmless.
 */
import { useNavigation } from '@react-navigation/native';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  CircleAlert,
  ListChecks,
  MailSearch,
  ShieldCheck,
  type LucideIcon,
} from 'lucide-react-native';
import { useState } from 'react';
import { ActivityIndicator, Pressable, Text, View } from 'react-native';

import { ApiError, messageFor } from '@/api/errors';
import type { PendingExtraction } from '@/api/contract';
import {
  Button,
  Card,
  ConfirmSheet,
  EmptyState,
  Header,
  Screen,
  ServiceMark,
} from '@/components';
import { makeStyles, opacity, radius, sizes, spacing, useTheme } from '@/theme';

import {
  connectGmail,
  disconnectGmail,
  extractionKeys,
  listPending,
  startScan,
} from './api';
import { authorizeGmail } from './gmailAuth';

export const CONNECT_COPY = {
  title: 'Connect email',
  back: 'Settings',
  headline: 'Find subscriptions in your inbox',
  subcopy:
    'Connect Gmail and SubTrak looks for receipts, renewals and free trials, so you don’t have to type them in.',
  connect: 'Connect Gmail',
  connecting: 'Connecting to Gmail',
  footnote: 'Read-only access. We only look at receipts and confirmations.',
  manual: 'Not now — add manually',
  failedTitle: "Couldn't connect to Gmail",
  failedMessage:
    'Access was denied or timed out. You can try again or add subscriptions yourself.',
  retry: 'Try again',
  addManually: 'Add a subscription manually',
  scanning: 'Scanning your inbox…',
  scanningHint: 'Anything we find shows up below as it arrives.',
  cancel: 'Cancel',
  found: 'Found in your email',
  foundHint: 'Check each one before it’s added. Nothing is saved until you confirm.',
  nothingTitle: 'No subscriptions found',
  nothingMessage:
    'We didn’t find any receipts or trial emails. You can add subscriptions yourself.',
  addOne: 'Add one manually',
  unavailableTitle: 'Email scanning is unavailable right now',
  unavailableMessage: 'Try again later, or add the subscription yourself.',
  scanAgain: 'Scan again',
  disconnect: 'Disconnect Gmail',
  disconnectTitle: 'Disconnect Gmail?',
  disconnectMessage:
    'SubTrak stops reading your email and deletes everything waiting for review. Subscriptions you already added stay.',
  checkThis: 'Check this',
} as const;

const BENEFITS: { icon: LucideIcon; title: string; description: string }[] = [
  {
    icon: MailSearch,
    title: 'Finds what you pay for',
    description: 'Receipts and renewal emails become subscriptions to review.',
  },
  {
    icon: ShieldCheck,
    title: 'Catches free trials',
    description: 'See when a trial turns into a charge, before it does.',
  },
  {
    icon: ListChecks,
    title: 'You stay in control',
    description: 'You check every result. Nothing is added on its own.',
  },
];

/** How often to ask for results while a scan runs. */
export const SCAN_POLL_MS = 2000;

type Phase = 'connect' | 'failed' | 'unavailable' | 'list';

export function ConnectEmailScreen() {
  const styles = useStyles();
  const navigation = useNavigation();
  const queryClient = useQueryClient();
  const [phase, setPhase] = useState<Phase>('connect');
  const [confirmDisconnect, setConfirmDisconnect] = useState(false);

  const pending = useQuery({
    queryKey: extractionKeys.pending(),
    queryFn: listPending,
    refetchInterval: (query) => (query.state.data?.scanning ? SCAN_POLL_MS : false),
  });
  const results = pending.data?.results ?? [];
  const scanning = pending.data?.scanning ?? false;
  // Reviews left over from an earlier scan: go straight to the list.
  const showList = phase === 'list' || (phase === 'connect' && results.length > 0);

  const addManually = () => navigation.navigate('App', { screen: 'AddSubscription' });

  const scan = useMutation({
    mutationFn: startScan,
    onSuccess: async () => {
      setPhase('list');
      await queryClient.invalidateQueries({ queryKey: extractionKeys.pending() });
    },
    onError: (error) => {
      if (error instanceof ApiError && error.code === 'gmail_not_connected') {
        setPhase('connect');
      } else if (error instanceof ApiError && error.code === 'extraction_unavailable') {
        setPhase('unavailable');
      } else {
        setPhase('failed');
      }
    },
  });

  const connect = useMutation({
    mutationFn: async () => {
      const auth = await authorizeGmail();
      if (auth.kind === 'cancelled') return 'cancelled' as const;
      if (auth.kind === 'failed') throw new Error('gmail_denied');
      await connectGmail(auth);
      return 'connected' as const;
    },
    onSuccess: (outcome) => {
      if (outcome === 'connected') scan.mutate();
    },
    onError: () => setPhase('failed'),
  });

  const disconnect = useMutation({
    mutationFn: disconnectGmail,
    onSuccess: async () => {
      setConfirmDisconnect(false);
      setPhase('connect');
      await queryClient.invalidateQueries({ queryKey: extractionKeys.all });
    },
  });

  const busy = connect.isPending || scan.isPending;
  const header = (
    <Header
      title={CONNECT_COPY.title}
      backLabel={CONNECT_COPY.back}
      onBack={() => navigation.goBack()}
    />
  );

  if (showList) {
    return (
      <Screen
        edges={['top']}
        testID="connect-email-screen"
        onRefresh={() => pending.refetch()}
        refreshing={pending.isRefetching && !scanning}
        contentStyle={styles.content}
      >
        {header}
        {scanning || scan.isPending ? (
          <Card style={styles.scanning} testID="connect-scanning">
            <View style={styles.scanningRow} accessibilityLiveRegion="polite">
              <ActivityIndicator accessibilityLabel={CONNECT_COPY.scanning} />
              <Text style={styles.title}>{CONNECT_COPY.scanning}</Text>
            </View>
            <Text style={styles.muted}>{CONNECT_COPY.scanningHint}</Text>
            <Button
              label={CONNECT_COPY.cancel}
              variant="secondary"
              // The scan finishes on the server either way; results wait for review.
              onPress={() => navigation.goBack()}
              testID="connect-scan-cancel"
            />
          </Card>
        ) : null}

        {results.length > 0 ? (
          <View style={styles.section}>
            <Text style={styles.sectionTitle} accessibilityRole="header">
              {CONNECT_COPY.found}
            </Text>
            <Text style={styles.muted}>{CONNECT_COPY.foundHint}</Text>
            {results.map((row) => (
              <ResultRow
                key={row.id}
                row={row}
                onPress={() =>
                  navigation.navigate('App', {
                    screen: 'ReviewExtraction',
                    params: { id: row.id },
                  })
                }
              />
            ))}
          </View>
        ) : null}

        {!scanning && !scan.isPending && pending.data && results.length === 0 ? (
          <EmptyState
            title={CONNECT_COPY.nothingTitle}
            message={CONNECT_COPY.nothingMessage}
            actionLabel={CONNECT_COPY.addOne}
            onAction={addManually}
            testID="connect-nothing"
          />
        ) : null}

        {pending.isError && !pending.data ? (
          <Text style={styles.muted} testID="connect-pending-error">
            {messageFor(pending.error)}
          </Text>
        ) : null}

        <View style={styles.actions}>
          <Button
            label={CONNECT_COPY.scanAgain}
            variant="secondary"
            onPress={() => scan.mutate()}
            disabled={scanning || busy}
            fullWidth
            testID="connect-scan-again"
          />
          <Button
            label={CONNECT_COPY.disconnect}
            variant="ghost"
            onPress={() => setConfirmDisconnect(true)}
            disabled={busy}
            fullWidth
            testID="connect-disconnect"
          />
        </View>

        <ConfirmSheet
          visible={confirmDisconnect}
          title={CONNECT_COPY.disconnectTitle}
          message={CONNECT_COPY.disconnectMessage}
          confirmLabel={CONNECT_COPY.disconnect}
          onConfirm={() => disconnect.mutate()}
          onCancel={() => setConfirmDisconnect(false)}
          testID="connect-disconnect-sheet"
        />
      </Screen>
    );
  }

  return (
    <Screen edges={['top']} testID="connect-email-screen" contentStyle={styles.content}>
      {header}
      <Text style={styles.headline} accessibilityRole="header">
        {CONNECT_COPY.headline}
      </Text>
      <Text style={styles.subcopy}>{CONNECT_COPY.subcopy}</Text>

      {phase === 'failed' ? (
        // 11 §2.3: danger is right here, this is a real error.
        <View style={styles.failed} accessibilityRole="alert" testID="connect-failed">
          <FailedIcon />
          <View style={styles.flex}>
            <Text style={styles.title}>{CONNECT_COPY.failedTitle}</Text>
            <Text style={styles.failedText}>{CONNECT_COPY.failedMessage}</Text>
          </View>
        </View>
      ) : null}

      {phase === 'unavailable' ? (
        <View
          style={styles.notice}
          accessibilityRole="alert"
          testID="connect-unavailable"
        >
          <Text style={styles.title}>{CONNECT_COPY.unavailableTitle}</Text>
          <Text style={styles.noticeText}>{CONNECT_COPY.unavailableMessage}</Text>
        </View>
      ) : null}

      <Card style={styles.benefits}>
        {BENEFITS.map(({ icon: Icon, title, description }) => (
          <BenefitRow key={title} icon={Icon} title={title} description={description} />
        ))}
      </Card>

      <Button
        label={phase === 'failed' ? CONNECT_COPY.retry : CONNECT_COPY.connect}
        onPress={() => connect.mutate()}
        loading={busy}
        loadingLabel={CONNECT_COPY.connecting}
        fullWidth
        testID="connect-gmail"
      />
      {phase === 'failed' || phase === 'unavailable' ? (
        <Button
          label={CONNECT_COPY.addManually}
          variant="secondary"
          onPress={addManually}
          fullWidth
          testID="connect-add-manually"
        />
      ) : null}

      <Text style={styles.footnote}>{CONNECT_COPY.footnote}</Text>

      {phase === 'connect' ? (
        <Pressable
          onPress={addManually}
          accessibilityRole="button"
          hitSlop={(sizes.minTouch - sizes.icon) / 2}
          style={({ pressed }) => [styles.textButton, pressed && styles.pressed]}
          testID="connect-not-now"
        >
          <Text style={styles.textButtonLabel}>{CONNECT_COPY.manual}</Text>
        </Pressable>
      ) : null}
    </Screen>
  );
}

function FailedIcon() {
  const { colors } = useTheme();
  return <CircleAlert size={sizes.icon} color={colors.danger} strokeWidth={2} />;
}

function BenefitRow({
  icon: Icon,
  title,
  description,
}: {
  icon: LucideIcon;
  title: string;
  description: string;
}) {
  const styles = useStyles();
  const { colors } = useTheme();
  return (
    <View
      style={styles.benefit}
      accessible
      accessibilityLabel={`${title}. ${description}`}
    >
      <View style={styles.benefitTile}>
        <Icon size={sizes.icon} color={colors.accent} strokeWidth={2} />
      </View>
      <View style={styles.flex}>
        <Text style={styles.title}>{title}</Text>
        <Text style={styles.muted}>{description}</Text>
      </View>
    </View>
  );
}

/** One result: the service, the email it came from, and a "Check this" flag. */
function ResultRow({ row, onPress }: { row: PendingExtraction; onPress: () => void }) {
  const styles = useStyles();
  const name = row.fields.service_name ?? row.source.subject;
  const needsCheck = row.flagged.length > 0;
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`${name}, from ${row.source.sender}${
        needsCheck ? `, ${CONNECT_COPY.checkThis}` : ''
      }`}
      accessibilityHint="Opens the review"
      style={({ pressed }) => [styles.result, pressed && styles.pressed]}
      testID={`connect-result-${row.id}`}
    >
      <ServiceMark name={name} />
      <View style={styles.flex}>
        <Text style={styles.title}>{name}</Text>
        <Text style={styles.muted} numberOfLines={1}>
          {row.source.subject}
        </Text>
      </View>
      {needsCheck ? (
        <View style={styles.checkChip}>
          <Text style={styles.checkText}>{CONNECT_COPY.checkThis}</Text>
        </View>
      ) : null}
    </Pressable>
  );
}

const useStyles = makeStyles(({ colors, typography }) => ({
  // 11 §2.3: gap 18 between blocks; nearest tokens are 16 and 20.
  content: {
    gap: spacing.lg,
    paddingBottom: spacing.xxl,
  },
  // Measured DM Serif 30; nearest token is 32 (01 §3, no new size).
  headline: {
    ...typography.displayLg,
  },
  subcopy: {
    ...typography.bodyLg,
    color: colors.textMuted,
  },
  benefits: {
    padding: spacing.lg,
    gap: spacing.md,
  },
  benefit: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  // 44px tile, surface2, radius 12 (no 12 radius token: the card radius).
  benefitTile: {
    width: sizes.minTouch,
    height: sizes.minTouch,
    borderRadius: radius.card,
    backgroundColor: colors.surface2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  flex: {
    flex: 1,
    gap: spacing.xs / 2,
  },
  title: {
    ...typography.labelSemibold,
    color: colors.text,
  },
  muted: {
    ...typography.caption,
    color: colors.textMuted,
  },
  footnote: {
    ...typography.caption,
    color: colors.textMuted,
    textAlign: 'center',
  },
  textButton: {
    alignSelf: 'center',
    minHeight: sizes.minTouch,
    justifyContent: 'center',
    paddingHorizontal: spacing.sm,
  },
  textButtonLabel: {
    ...typography.labelSemibold,
    color: colors.accent,
  },
  pressed: {
    opacity: opacity.pressed,
  },
  failed: {
    flexDirection: 'row',
    gap: spacing.md,
    padding: spacing.lg,
    borderRadius: radius.card,
    borderWidth: sizes.hairline,
    borderColor: colors.danger,
    backgroundColor: colors.dangerSurface,
  },
  failedText: {
    ...typography.labelMd,
    color: colors.text,
  },
  notice: {
    gap: spacing.xs,
    padding: spacing.lg,
    borderRadius: radius.card,
    borderWidth: sizes.hairline,
    borderColor: colors.warning,
    backgroundColor: colors.warningSurface,
  },
  noticeText: {
    ...typography.labelMd,
    color: colors.text,
  },
  scanning: {
    padding: spacing.lg,
    gap: spacing.md,
  },
  scanningRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  section: {
    gap: spacing.sm,
  },
  sectionTitle: {
    ...typography.displayTitle,
  },
  actions: {
    gap: spacing.sm,
  },
  result: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    minHeight: sizes.rowSubscription,
    paddingHorizontal: spacing.lg,
    borderRadius: radius.card,
    borderWidth: sizes.hairline,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  checkChip: {
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    borderRadius: radius.badge,
    backgroundColor: colors.warningSurface,
  },
  checkText: {
    ...typography.captionStrong,
    color: colors.text,
  },
}));
