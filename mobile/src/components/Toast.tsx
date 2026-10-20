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
import { AccessibilityInfo, Animated, Text } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { makeStyles, radius, sizes, spacing, useMotion, useTheme } from '@/theme';

export type ToastTone = 'success' | 'neutral';

interface ToastMessage {
  id: number;
  message: string;
  tone: ToastTone;
}

interface ToastApi {
  show: (message: string, tone?: ToastTone) => void;
}

const ToastContext = createContext<ToastApi>({ show: () => {} });

/** Shows a toast. A no-op outside a ToastProvider, so a bare component test never throws. */
export function useToast(): ToastApi {
  return useContext(ToastContext);
}

export function ToastProvider({ children }: { children: ReactNode }) {
  const [current, setCurrent] = useState<ToastMessage | null>(null);
  const counter = useRef(0);

  const show = useCallback((message: string, tone: ToastTone = 'success') => {
    counter.current += 1;
    setCurrent({ id: counter.current, message, tone });
  }, []);

  const api = useMemo(() => ({ show }), [show]);

  return (
    <ToastContext.Provider value={api}>
      {children}
      {current ? (
        <Toast
          key={current.id}
          message={current.message}
          tone={current.tone}
          onHidden={() => setCurrent(null)}
        />
      ) : null}
    </ToastContext.Provider>
  );
}

export interface ToastProps {
  message: string;
  tone?: ToastTone;
  /** Called once the toast has finished hiding. */
  onHidden?: () => void;
  testID?: string;
}

export function Toast({
  message,
  tone = 'success',
  onHidden,
  testID = 'toast',
}: ToastProps) {
  const styles = useStyles();
  const { colors } = useTheme();
  const m = useMotion();
  const insets = useSafeAreaInsets();
  const progress = useState(() => new Animated.Value(0))[0];

  useEffect(() => {
    AccessibilityInfo.announceForAccessibility(message);
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
      }).start(() => onHidden?.());
    }, m.toastHold);
    return () => {
      clearTimeout(timer);
      enter.stop();
    };
  }, [message, progress, m, onHidden]);

  const Icon = tone === 'success' ? CheckCircle2 : Info;
  const iconColor = tone === 'success' ? colors.success : colors.text;

  return (
    <Animated.View
      pointerEvents="none"
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
}));
