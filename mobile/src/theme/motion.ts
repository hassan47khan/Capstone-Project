/**
 * useMotion — animation timings with the reduced-motion rule applied once.
 *
 * What this is for
 *   Handoff 02 §15 lists eight animations and one rule: when the OS asks for
 *   reduced motion, each is skipped or reduced to a cross-fade. Rather than every
 *   component reading `reduceMotion` and deciding for itself, they ask this hook
 *   for a duration and a flag, so the rule lives in one place and one test.
 *
 * How a component uses it
 *     const m = useMotion();
 *     Animated.timing(scale, { toValue: m.pressScale, duration: m.press, ... })
 *   Under reduced motion `moves` is false: movement (scale, slide, translate,
 *   thumb travel, pulse) is not animated, and anything that must still change
 *   state uses `crossFade` or snaps.
 */
import { Easing } from 'react-native';

import { useTheme } from './ThemeProvider';
import { motion } from './tokens';

export interface Motion {
  /** False when the OS asks for reduced motion: do not animate movement. */
  moves: boolean;
  press: number;
  pressScale: number;
  sheetIn: number;
  sheetOut: number;
  toast: number;
  toastRise: number;
  toastHold: number;
  modal: number;
  pulse: number;
  toggle: number;
  crossFade: number;
  easeOut: (value: number) => number;
  easeIn: (value: number) => number;
  easeInOut: (value: number) => number;
}

const easings = {
  easeOut: Easing.out(Easing.quad),
  easeIn: Easing.in(Easing.quad),
  easeInOut: Easing.inOut(Easing.quad),
};

const full: Motion = { ...motion, ...easings, moves: true };

/**
 * Reduced: no travel, no scale, no pulse. Sheets, toasts and modals keep a
 * short cross-fade so the change is still perceptible; presses and the toggle
 * snap.
 */
const reduced: Motion = {
  ...full,
  moves: false,
  press: 0,
  pressScale: 1,
  sheetIn: motion.crossFade,
  sheetOut: motion.crossFade,
  toast: motion.crossFade,
  toastRise: 0,
  modal: motion.crossFade,
  pulse: 0,
  toggle: 0,
};

export function motionFor(reduceMotion: boolean): Motion {
  return reduceMotion ? reduced : full;
}

export function useMotion(): Motion {
  return motionFor(useTheme().reduceMotion);
}
