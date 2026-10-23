/**
 * The Register terms checkbox (05 §3): "I agree to the Terms and Privacy
 * Policy", with both documents as links.
 *
 * Local to auth for now: src/components has no Checkbox (02 lists none). It
 * uses tokens only, so it can move into the library unchanged if one is added.
 *
 * The box and the sentence are separate targets on purpose: tapping a link
 * opens the document, it does not tick the box. The two links are their own
 * pressables (a nested <Text> cannot take hitSlop), each padded out to the
 * 44pt minimum the same way the box is.
 */
import { Check } from 'lucide-react-native';
import { Pressable, Text, View } from 'react-native';

import { makeStyles, opacity, radius, sizes, spacing, useTheme } from '@/theme';

const HIT_SLOP = (sizes.minTouch - sizes.icon) / 2;

export interface TermsCheckboxProps {
  checked: boolean;
  onChange: (next: boolean) => void;
  onOpenTerms: () => void;
  onOpenPrivacy: () => void;
  disabled?: boolean;
}

export function TermsCheckbox({
  checked,
  onChange,
  onOpenTerms,
  onOpenPrivacy,
  disabled = false,
}: TermsCheckboxProps) {
  const styles = useStyles();
  const { colors } = useTheme();

  return (
    <View style={styles.row}>
      <Pressable
        onPress={() => onChange(!checked)}
        disabled={disabled}
        hitSlop={HIT_SLOP}
        accessibilityRole="checkbox"
        accessibilityState={{ checked, disabled }}
        accessibilityLabel="I agree to the Terms and Privacy Policy"
        style={[styles.box, checked && styles.boxChecked]}
        testID="register-terms"
      >
        {checked ? (
          <Check size={sizes.iconSmall} color={colors.onAccent} strokeWidth={3} />
        ) : null}
      </Pressable>
      <View style={styles.sentence}>
        <Text style={styles.label}>I agree to the</Text>
        <Pressable
          onPress={onOpenTerms}
          hitSlop={HIT_SLOP}
          accessibilityRole="link"
          accessibilityLabel="Terms"
          accessibilityHint="Opens the Terms of Service"
          style={({ pressed }) => pressed && styles.pressed}
          testID="register-terms-link"
        >
          <Text style={styles.link}>Terms</Text>
        </Pressable>
        <Text style={styles.label}>and</Text>
        <Pressable
          onPress={onOpenPrivacy}
          hitSlop={HIT_SLOP}
          accessibilityRole="link"
          accessibilityLabel="Privacy Policy"
          accessibilityHint="Opens the Privacy Policy"
          style={({ pressed }) => pressed && styles.pressed}
          testID="register-privacy-link"
        >
          <Text style={styles.link}>Privacy Policy</Text>
        </Pressable>
      </View>
    </View>
  );
}

const useStyles = makeStyles(({ colors, typography }) => ({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  box: {
    width: sizes.icon,
    height: sizes.icon,
    borderRadius: radius.card,
    borderWidth: sizes.borderFocus,
    borderColor: colors.borderControl,
    alignItems: 'center',
    justifyContent: 'center',
  },
  boxChecked: {
    backgroundColor: colors.accent,
    borderColor: colors.accent,
  },
  sentence: {
    flex: 1,
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    columnGap: spacing.xs,
  },
  label: {
    ...typography.bodyMd,
    color: colors.text,
  },
  link: {
    ...typography.labelSemibold,
    color: colors.accent,
  },
  pressed: {
    opacity: opacity.pressed,
  },
}));
