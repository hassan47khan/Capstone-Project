/**
 * Toggle — the on/off switch (handoff 02 §7).
 *
 * What it is for
 *   Notification rules and every other binary setting. It is drawn by hand,
 *   not with React Native's Switch, so it matches Figma on both platforms.
 *
 * The touch-target rule
 *   The toggle is 24pt tall — below the 44pt minimum. So this component is
 *   VISUAL ONLY: it is not pressable and is hidden from screen readers. The
 *   control is the whole row it sits in — `SettingsRow variant="toggle"` —
 *   which carries `accessibilityRole="switch"`, the checked state and the label.
 *   That applies to every toggle in the app.
 *
 * Motion (02 §15)
 *   The thumb slides 150ms ease-out and the fill changes with it. Under reduced
 *   motion the thumb snaps.
 *
 * Design tokens
 *   size    sizes.toggleWidth × toggleHeight (40 × 24), radius.pill
 *   on      colors.accent
 *   off     colors.toggleOff (3.58:1 on surface — "off" is visible, not pale)
 *   thumb   sizes.toggleThumb (20), colors.onAccent, sizes.toggleInset (2) in
 */
import { useEffect, useState } from 'react';
import { Animated } from 'react-native';

import { makeStyles, radius, sizes, useMotion } from '@/theme';

export interface ToggleProps {
  value: boolean;
  disabled?: boolean;
  testID?: string;
}

const TRAVEL = sizes.toggleWidth - sizes.toggleThumb - sizes.toggleInset * 2;

export function Toggle({ value, disabled = false, testID }: ToggleProps) {
  const styles = useStyles();
  const m = useMotion();
  const position = useState(() => new Animated.Value(value ? 1 : 0))[0];

  useEffect(() => {
    if (!m.moves) {
      position.setValue(value ? 1 : 0);
      return;
    }
    Animated.timing(position, {
      toValue: value ? 1 : 0,
      duration: m.toggle,
      easing: m.easeOut,
      useNativeDriver: true,
    }).start();
  }, [value, position, m]);

  return (
    <Animated.View
      style={[styles.track, value ? styles.on : styles.off, disabled && styles.disabled]}
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      testID={testID}
    >
      <Animated.View
        style={[
          styles.thumb,
          {
            transform: [
              {
                translateX: position.interpolate({
                  inputRange: [0, 1],
                  outputRange: [0, TRAVEL],
                }),
              },
            ],
          },
        ]}
      />
    </Animated.View>
  );
}

const useStyles = makeStyles(({ colors }) => ({
  track: {
    width: sizes.toggleWidth,
    height: sizes.toggleHeight,
    borderRadius: radius.pill,
    padding: sizes.toggleInset,
    justifyContent: 'center',
  },
  on: { backgroundColor: colors.accent },
  off: { backgroundColor: colors.toggleOff },
  disabled: { backgroundColor: colors.surface2 },
  thumb: {
    width: sizes.toggleThumb,
    height: sizes.toggleThumb,
    borderRadius: radius.pill,
    backgroundColor: colors.onAccent,
  },
}));
