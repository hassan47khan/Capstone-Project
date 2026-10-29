/**
 * Toast — a brief confirmation that floats above the tab bar (handoff 02 §13).
 *
 * What it is for
 *   "Confirmation email resent", "Subscription saved". Feedback that needs no
 *   action and goes away by itself after 3 seconds.
 *
 * Why it follows Figma, not the prose in 02
 *   02 describes a pill with a 16px icon in `label.md`, but also says the toast
 *   is the one component that already exists in Figma. The Figma symbols
 *   (node 3:955, "Feedback / Confirmation email resent") are the source: radius
 *   6, an 18px check-circle, DM Sans SemiBold 15 in `success` on
 *   `successSurface` with a 1px `successBorder`.
 *
 * How to show one
 *   `ToastProvider` is mounted once in App.tsx. Anything below it calls
 *   `useToast().show('Subscription saved')`. One toast at a time: a new one
 *   replaces the current one rather than stacking.
 *
 * With an action
 *   `show('Subscription deleted', 'neutral', { action: { label: 'Undo', onPress },
 *   holdMs: 6000 })` adds a button and keeps the toast up longer (07 §7). Only a
 *   toast with an action takes touches; pressing it hides the toast.
 *
 * Accessibility
 *   The message is announced as it appears (`announceForAccessibility` plus a
 *   polite live region), because a screen-reader user cannot see it float in.
 *
 * Motion (02 §15)
 *   Enter: fade in and rise 8pt, 200ms ease-out. Reduced motion: fade only.
 *
 * Position
 *   Above the tab bar (sizes.tabBar) and the bottom safe-area inset, so it never
 *   sits under the home indicator or covers the tabs.
 */
import { CheckCircle2, Info } from 'lucide-react-native';
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { AccessibilityInfo, Animated, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { makeStyles, radius, sizes, spacing, useMotion, useTheme } from '@/theme';

import { Button } from './Button';

export type ToastTone = 'success' | 'neutral';

/** A button in the toast, e.g. Undo. */
export interface ToastAction {
  label: string;
  onPress: () => void;
  /** Spoken name when the label alone is unclear ("Undo delete"). */
  accessibilityLabel?: string;
}

export interface ToastOptions {
  action?: ToastAction;
  /** How long it stays up, in ms. Default: the motion token (3s). */
  holdMs?: number;
}

interface ToastMessage extends ToastOptions {
  id: number;
  message: string;
  tone: ToastTone;
}

interface ToastApi {
  show: (message: string, tone?: ToastTone, options?: ToastOptions) => void;
}

const ToastContext = createContext<ToastApi>({ show: () => {} });

/** Shows a toast. A no-op outside a ToastProvider, so a bare component test never throws. */
export function useToast(): ToastApi {
  return useContext(ToastContext);
}

export function ToastProvider({ children }: { children: ReactNode }) {
  const [current, setCurrent] = useState<ToastMessage | null>(null);
  const counter = useRef(0);

  const show = useCallback(
    (message: string, tone: ToastTone = 'success', options: ToastOptions = {}) => {
      counter.current += 1;
      setCurrent({ id: counter.current, message, tone, ...options });
    },
    [],
  );

  const api = useMemo(() => ({ show }), [show]);

  return (
    <ToastContext.Provider value={api}>
      {children}
      {current ? (
        <Toast
          key={current.id}
          message={current.message}
          tone={current.tone}
          action={current.action}
          holdMs={current.holdMs}
          // Only clears its own toast, so a late hide can't remove a newer one.
          onHidden={() =>
            setCurrent((shown) => (shown?.id === current.id ? null : shown))
          }
        />
      ) : null}
    </ToastContext.Provider>
  );
}

export interface ToastProps extends ToastOptions {
  message: string;
  tone?: ToastTone;
  /** Called once the toast has finished hiding. */
  onHidden?: () => void;
  testID?: string;
}

export function Toast({
  message,
  tone = 'success',
  action,
  holdMs,
  onHidden,
  testID = 'toast',
}: ToastProps) {
  const styles = useStyles();
  const { colors } = useTheme();
  const m = useMotion();
  const insets = useSafeAreaInsets();
  const progress = useState(() => new Animated.Value(0))[0];
  // The latest onHidden, so a parent re-render doesn't restart the timer.
  const hidden = useRef(onHidden);
  useEffect(() => {
    hidden.current = onHidden;
  });

  useEffect(() => {
    // Say there's a button, since it can't be seen floating in.
    AccessibilityInfo.announceForAccessibility(
      action ? `${message}. ${action.label} available.` : message,
    );
    const enter = Animated.timing(progress, {
      toValue: 1,
      duration: m.toast,
      easing: m.easeOut,
      useNativeDriver: true,
    });
    enter.start();
    const timer = setTimeout(() => {
      Animated.timing(progress, {
        toValue: 0,
        duration: m.toast,
        easing: m.easeIn,
        useNativeDriver: true,
      }).start(() => hidden.current?.());
    }, holdMs ?? m.toastHold);
    return () => {
      clearTimeout(timer);
      enter.stop();
    };
  }, [message, progress, m, holdMs, action]);

  // The action hides the toast at once; its job is done.
  const press = () => {
    hidden.current?.();
    action?.onPress();
  };

  const Icon = tone === 'success' ? CheckCircle2 : Info;
  const iconColor = tone === 'success' ? colors.success : colors.text;

  return (
    <Animated.View
      // Touches pass through, unless there's a button to press.
      pointerEvents={action ? 'box-none' : 'none'}
      style={[
        styles.toast,
        tone === 'success' ? styles.success : styles.neutral,
        { bottom: insets.bottom + sizes.tabBar + spacing.md },
        {
          opacity: progress,
          transform: [
            {
              translateY: progress.interpolate({
                inputRange: [0, 1],
                outputRange: [m.toastRise, 0],
              }),
            },
          ],
        },
      ]}
      accessibilityRole="alert"
      accessibilityLiveRegion="polite"
      testID={testID}
    >
      <Icon
        size={sizes.iconCheck}
        color={iconColor}
        strokeWidth={2}
        accessibilityElementsHidden
        importantForAccessibility="no-hide-descendants"
      />
      <Text
        style={[styles.message, tone === 'neutral' && styles.neutralText]}
        numberOfLines={2}
      >
        {message}
      </Text>
      {action ? (
        <View style={styles.action}>
          <Button
            label={action.label}
            variant="ghost"
            onPress={press}
            accessibilityLabel={action.accessibilityLabel}
            testID={`${testID}-action`}
          />
        </View>
      ) : null}
    </Animated.View>
  );
}

const useStyles = makeStyles(({ colors, typography }) => ({
  toast: {
    position: 'absolute',
    alignSelf: 'center',
    maxWidth: sizes.proseWidth + spacing.xxl * 2,
    minHeight: sizes.toast,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    borderRadius: radius.card,
    borderWidth: sizes.hairline,
  },
  success: {
    backgroundColor: colors.successSurface,
    borderColor: colors.successBorder,
  },
  neutral: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
  },
  message: {
    ...typography.toast,
    flexShrink: 1,
  },
  neutralText: {
    color: colors.text,
  },
  action: {
    marginLeft: spacing.xs,
  },
}));
