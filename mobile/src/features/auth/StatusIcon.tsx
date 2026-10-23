/**
 * The round icon at the top of the confirmation screens (05 §4, Figma): a
 * mail glyph on "Check your email", a check on "Email confirmed" and the
 * reset success. Decorative: the heading below it says the same thing.
 *
 * `animate` is the success icon's entrance (05 §10): scale 0.8 → 1. It is the
 * only decorative animation in the auth flow, and under reduced motion it is
 * skipped entirely and the final state is drawn.
 *
 * TODO(tokens): 05 §4 draws a 34px glyph in the 72px circle. With no 34 token
 * it uses sizes.iconLarge (48); the 400ms entrance uses motion sheetIn (300).
 */
import { Check, Mail } from 'lucide-react-native';
import { useEffect, useState } from 'react';
import { Animated } from 'react-native';

import { makeStyles, radius, sizes, useMotion, useTheme } from '@/theme';

const START_SCALE = 0.8;

export interface StatusIconProps {
  kind: 'mail' | 'check';
  animate?: boolean;
}

export function StatusIcon({ kind, animate = false }: StatusIconProps) {
  const styles = useStyles();
  const { colors } = useTheme();
  const m = useMotion();
  const play = animate && m.moves;
  const [scale] = useState(() => new Animated.Value(play ? START_SCALE : 1));

  useEffect(() => {
    if (!play) return;
    Animated.timing(scale, {
      toValue: 1,
      duration: m.sheetIn,
      easing: m.easeOut,
      useNativeDriver: true,
    }).start();
  }, [play, scale, m]);

  const Icon = kind === 'mail' ? Mail : Check;
  return (
    <Animated.View
      style={[styles.circle, { transform: [{ scale }] }]}
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      testID={`status-icon-${kind}`}
    >
      <Icon size={sizes.iconLarge} color={colors.accent} strokeWidth={1.75} />
    </Animated.View>
  );
}

const useStyles = makeStyles(({ colors }) => ({
  circle: {
    width: sizes.markLarge,
    height: sizes.markLarge,
    borderRadius: radius.pill,
    backgroundColor: colors.accentSurface,
    alignItems: 'center',
    justifyContent: 'center',
    alignSelf: 'center',
  },
}));
