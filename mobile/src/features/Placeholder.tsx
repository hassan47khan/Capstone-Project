/**
 * Placeholder — a stand-in for a screen that Phase 1, 2 or 3 will build.
 *
 * What this is for
 *   Letting the navigation shell run, be tested and be demonstrated in Phase 0,
 *   before any real screen exists.
 *
 * Why a shared component rather than fifteen stub files with inline markup
 *   One place to change when they all get replaced, and — more importantly — it
 *   is unmistakably a placeholder. A stub that looks like a half-finished screen
 *   invites someone to "just add a bit more" to it; this one names the phase
 *   that owns it and the stories it covers, so the honest state of the app is
 *   visible while you navigate.
 *
 * Every one of these is deleted as its real screen lands. If any survive past
 * Phase 3, that is a bug.
 */
import { StyleSheet, Text, View } from 'react-native';

import { Header, Screen } from '@/components';
import { colors, radius, spacing, typography } from '@/theme';

export interface PlaceholderProps {
  /** The screen's eventual title, so navigation reads correctly while testing. */
  title: string;

  /** Which phase builds this, e.g. "Phase 2 — Epic C". */
  phase: string;

  /** The acceptance criteria it will satisfy, e.g. "US-6, US-8". */
  stories: string;

  /** Shown when the screen is pushed rather than a tab. */
  backLabel?: string;
  onBack?: () => void;
}

export function Placeholder({
  title,
  phase,
  stories,
  backLabel,
  onBack,
}: PlaceholderProps) {
  return (
    <Screen edges={backLabel ? ['top', 'bottom'] : ['top']}>
      <Header title={title} backLabel={backLabel} onBack={onBack} />

      <View
        style={styles.card}
        accessible
        accessibilityLabel={`${title}. Not built yet. ${phase}.`}
      >
        <Text style={styles.label}>Not built yet</Text>
        <Text style={styles.detail}>{phase}</Text>
        <Text style={styles.detail}>{stories}</Text>
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: radius.card,
    padding: spacing.xl,
    gap: spacing.sm,
  },
  label: {
    ...typography.rowTitle,
  },
  detail: {
    ...typography.caption,
  },
});
