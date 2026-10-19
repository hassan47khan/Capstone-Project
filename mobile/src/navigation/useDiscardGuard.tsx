/**
 * useDiscardGuard — confirm before a dirty form is thrown away (handoff 03 §3, rule 3).
 *
 * What it is for
 *   Add Subscription and Edit Subscription. Closing either with unsaved changes
 *   — the X, the back gesture, Android's back button — asks first. A pristine
 *   form closes immediately with no prompt, because asking "discard nothing?"
 *   trains people to tap through warnings.
 *
 * How it works
 *   React Navigation emits `beforeRemove` for every way a screen can leave the
 *   stack. While `isDirty`, the hook prevents that, opens a destructive
 *   ConfirmSheet (which a backdrop tap cannot dismiss — 02 §12), and replays the
 *   original action only if the user chooses Discard.
 *
 * Usage
 *     const { sheet, allowLeave } = useDiscardGuard(isDirty);
 *     // call allowLeave() just before navigating away after a successful save
 *     return (<>{form}{sheet}</>);
 */
import { useNavigation, type NavigationAction } from '@react-navigation/native';
import { useCallback, useEffect, useRef, useState, type ReactElement } from 'react';

import { ConfirmSheet } from '@/components';

export interface DiscardGuard {
  /** Render this somewhere in the screen. */
  sheet: ReactElement;
  /** Lets the next navigation through unguarded — for leaving after a save. */
  allowLeave: () => void;
}

export function useDiscardGuard(isDirty: boolean): DiscardGuard {
  const navigation = useNavigation();
  const [pending, setPending] = useState<NavigationAction | null>(null);
  const bypass = useRef(false);

  useEffect(
    () =>
      navigation.addListener('beforeRemove', (event) => {
        if (!isDirty || bypass.current) return;
        event.preventDefault();
        setPending(event.data.action);
      }),
    [navigation, isDirty],
  );

  const allowLeave = useCallback(() => {
    bypass.current = true;
  }, []);

  const sheet = (
    <ConfirmSheet
      visible={pending !== null}
      destructive
      title="Discard changes?"
      message="You have unsaved changes. If you leave now they will be lost."
      confirmLabel="Discard"
      cancelLabel="Keep editing"
      onCancel={() => setPending(null)}
      onConfirm={() => {
        const action = pending;
        setPending(null);
        if (action) {
          bypass.current = true;
          navigation.dispatch(action);
        }
      }}
      testID="discard-guard"
    />
  );

  return { sheet, allowLeave };
}
