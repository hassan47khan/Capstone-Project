/**
 * Push for the signed-in app (US-13; spec §10).
 *
 * Mounted around the App stack, so it lives exactly as long as a session:
 *
 * - On mount, it refreshes this phone's registration if the user already
 *   allowed push. Quietly: it never shows the system prompt. That re-sends
 *   the token after a sign-in, which also moves a handed-down phone to the
 *   new account (the server's /devices is idempotent and does that).
 * - It shows a push that arrives while the app is open, and refreshes the
 *   inbox so the bell's count is current.
 * - It gives screens `useAskForPush()`, the one place the app may ask for
 *   permission: after the first save of a trial or a reminder. If the user
 *   says no, it explains once that alerts will stay in the in-app inbox.
 *
 * Tapping a push is handled by navigation/linking.ts, so it goes through the
 * same parking as any other deep link when nobody is signed in.
 */
import { useQueryClient } from '@tanstack/react-query';
import * as Notifications from 'expo-notifications';
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { Text, View } from 'react-native';

import { BottomSheet, Button } from '@/components';
import { FEATURE_PUSH } from '@/config/features';
import { makeStyles, spacing } from '@/theme';

import { notificationsKey } from './api';
import { PUSH_COPY } from './notificationCopy';
import { enablePush, takeDeniedExplanation } from './push';

type AskForPush = () => Promise<void>;

/** Outside the provider (a screen test), asking is a no-op. */
const PushContext = createContext<AskForPush>(async () => {});

/**
 * Call after a successful save of a trial or a subscription with reminders.
 * Safe to call every time: it asks only once, ever, and never throws.
 */
export function useAskForPush(): AskForPush {
  return useContext(PushContext);
}

// Show a push that arrives in the foreground as a banner, like one that
// arrives in the background. Set once, at import, as Expo recommends.
if (FEATURE_PUSH) {
  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldShowBanner: true,
      shouldShowList: true,
      shouldPlaySound: false,
      shouldSetBadge: false,
    }),
  });
}

export function PushProvider({ children }: { children: ReactNode }) {
  const styles = useStyles();
  const queryClient = useQueryClient();
  const [explaining, setExplaining] = useState(false);

  useEffect(() => {
    if (!FEATURE_PUSH) return;
    void enablePush({ ask: false });
    const received = Notifications.addNotificationReceivedListener(() => {
      void queryClient.invalidateQueries({ queryKey: notificationsKey });
    });
    return () => received.remove();
  }, [queryClient]);

  const ask = useCallback<AskForPush>(async () => {
    const outcome = await enablePush({ ask: true });
    if (outcome === 'denied' && (await takeDeniedExplanation())) setExplaining(true);
  }, []);

  const value = useMemo(() => ask, [ask]);

  return (
    <PushContext.Provider value={value}>
      {children}
      <BottomSheet
        visible={explaining}
        onClose={() => setExplaining(false)}
        title={PUSH_COPY.deniedTitle}
        testID="push-denied-sheet"
      >
        <View style={styles.body}>
          <Text style={styles.message}>{PUSH_COPY.deniedBody}</Text>
          <Button
            label={PUSH_COPY.deniedOk}
            onPress={() => setExplaining(false)}
            fullWidth
            testID="push-denied-ok"
          />
        </View>
      </BottomSheet>
    </PushContext.Provider>
  );
}

const useStyles = makeStyles(({ colors, typography }) => ({
  body: {
    gap: spacing.lg,
  },
  message: {
    ...typography.bodyMd,
    color: colors.textMuted,
  },
}));
