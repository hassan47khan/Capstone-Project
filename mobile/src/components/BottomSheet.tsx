/**
 * BottomSheet — a panel that slides up over the screen (handoff 02 §12).
 *
 * What it is for
 *   Confirms, pickers (Select opens one) and destructive confirmations. A sheet
 *   keeps the user's place: what they were doing stays visible, dimmed, behind it.
 *
 * Dismissal
 *   Tapping the backdrop or the Android back button closes it — EXCEPT when
 *   `dismissible` is false, which destructive confirms use. Deleting something
 *   must be an explicit choice, never the side effect of a stray tap.
 *
 * Built on React Native's own Modal + Animated
 *   No gesture library, so there is no drag-to-dismiss; the backdrop and the
 *   sheet's own buttons close it. Opening slides up 300ms ease-out, closing
 *   slides down 250ms ease-in, and the backdrop fades with it (02 §15). Under
 *   reduced motion the sheet does not travel — it cross-fades in place.
 *
 * Accessibility
 *   The sheet is `accessibilityViewIsModal`, so VoiceOver does not wander into
 *   the dimmed screen behind it. The backdrop is a labelled button only when it
 *   actually dismisses.
 *
 * Design tokens
 *   grabber   sizes.grabberWidth × grabberHeight (40 × 4), radius.pill, colors.border
 *   padding   spacing.xxl (24)
 *   backdrop  colors.scrim (black 40%)
 *   radius    radius.sheet (16), top corners only
 */
import { useEffect, useState, type ReactNode } from 'react';
import { Animated, Dimensions, Modal, Pressable, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { makeStyles, radius, sizes, spacing, useMotion } from '@/theme';

import { Button } from './Button';

export interface BottomSheetProps {
  visible: boolean;
  /** Called when the user asks to close: backdrop tap, back button, or a button inside. */
  onClose: () => void;
  /** Optional heading, also announced as the sheet's label. */
  title?: string;
  children: ReactNode;
  /** False for destructive confirms: only an explicit choice closes the sheet. */
  dismissible?: boolean;
  testID?: string;
}

export function BottomSheet({
  visible,
  onClose,
  title,
  children,
  dismissible = true,
  testID,
}: BottomSheetProps) {
  const styles = useStyles();
  const m = useMotion();
  const insets = useSafeAreaInsets();
  const progress = useState(() => new Animated.Value(0))[0];
  // Stays mounted through the closing animation, then unmounts. Opening sets it
  // during render (React's "adjust state while rendering" pattern) so the Modal
  // is in the tree on the same pass that starts the animation.
  const [mounted, setMounted] = useState(visible);
  if (visible && !mounted) setMounted(true);

  useEffect(() => {
    if (visible) {
      Animated.timing(progress, {
        toValue: 1,
        duration: m.sheetIn,
        easing: m.easeOut,
        useNativeDriver: true,
      }).start();
    } else {
      Animated.timing(progress, {
        toValue: 0,
        duration: m.sheetOut,
        easing: m.easeIn,
        useNativeDriver: true,
      }).start(() => setMounted(false));
    }
  }, [visible, progress, m]);

  if (!mounted) return null;

  const offscreen = Dimensions.get('window').height;
  const sheetMotion = m.moves
    ? {
        transform: [
          {
            translateY: progress.interpolate({
              inputRange: [0, 1],
              outputRange: [offscreen, 0],
            }),
          },
        ],
      }
    : { opacity: progress };

  const requestClose = () => {
    if (dismissible) onClose();
  };

  return (
    <Modal transparent visible animationType="none" onRequestClose={requestClose}>
      <View style={styles.root}>
        <Animated.View style={[styles.backdrop, { opacity: progress }]}>
          <Pressable
            style={styles.fill}
            onPress={requestClose}
            disabled={!dismissible}
            accessibilityRole={dismissible ? 'button' : undefined}
            accessibilityLabel={dismissible ? 'Close' : undefined}
            importantForAccessibility={dismissible ? 'auto' : 'no-hide-descendants'}
            testID={testID ? `${testID}-backdrop` : undefined}
          />
        </Animated.View>

        <Animated.View
          style={[
            styles.sheet,
            { paddingBottom: spacing.xxl + insets.bottom },
            sheetMotion,
          ]}
          accessibilityViewIsModal
          accessibilityLabel={title}
          testID={testID}
        >
          <View style={styles.grabber} />
          {title ? (
            <Text style={styles.title} accessibilityRole="header">
              {title}
            </Text>
          ) : null}
          {children}
        </Animated.View>
      </View>
    </Modal>
  );
}

export interface ConfirmSheetProps {
  visible: boolean;
  title: string;
  message: string;
  confirmLabel: string;
  cancelLabel?: string;
  onConfirm: () => void;
  onCancel: () => void;
  /**
   * A destructive confirm uses the danger button and cannot be dismissed by a
   * backdrop tap (02 §12).
   */
  destructive?: boolean;
  testID?: string;
}

/** The standard two-button confirmation, in a sheet. */
export function ConfirmSheet({
  visible,
  title,
  message,
  confirmLabel,
  cancelLabel = 'Cancel',
  onConfirm,
  onCancel,
  destructive = false,
  testID,
}: ConfirmSheetProps) {
  const styles = useStyles();
  return (
    <BottomSheet
      visible={visible}
      onClose={onCancel}
      title={title}
      dismissible={!destructive}
      testID={testID}
    >
      <Text style={styles.message}>{message}</Text>
      <View style={styles.actions}>
        <Button
          label={confirmLabel}
          variant={destructive ? 'destructive' : 'primary'}
          onPress={onConfirm}
          fullWidth
          testID={testID ? `${testID}-confirm` : undefined}
        />
        <Button
          label={cancelLabel}
          variant="secondary"
          onPress={onCancel}
          fullWidth
          testID={testID ? `${testID}-cancel` : undefined}
        />
      </View>
    </BottomSheet>
  );
}

const useStyles = makeStyles(({ colors, typography }) => ({
  root: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  backdrop: {
    position: 'absolute',
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    backgroundColor: colors.scrim,
  },
  fill: {
    flex: 1,
  },
  sheet: {
    backgroundColor: colors.surface,
    borderTopLeftRadius: radius.sheet,
    borderTopRightRadius: radius.sheet,
    paddingHorizontal: spacing.xxl,
    // Content starts 24 below the top edge (02 §12); the grabber sits in that band.
    paddingTop: spacing.xxl,
    gap: spacing.lg,
  },
  grabber: {
    position: 'absolute',
    top: spacing.sm,
    alignSelf: 'center',
    width: sizes.grabberWidth,
    height: sizes.grabberHeight,
    borderRadius: radius.pill,
    backgroundColor: colors.border,
  },
  title: {
    ...typography.displayMd,
  },
  message: {
    ...typography.bodyMd,
    color: colors.textMuted,
  },
  actions: {
    gap: spacing.sm,
  },
}));
