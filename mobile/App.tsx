/**
 * App root.
 *
 * What this is for
 *   Mounting the providers in the one order that works, and holding the splash
 *   until the fonts are ready.
 *
 * Why the provider order is what it is — each layer needs the one above it
 *   ThemeProvider       resolves light/dark; everything below reads useTheme()
 *   SafeAreaProvider    measures insets; Screen and TabBar read them
 *   QueryClientProvider owns the server cache; the session's restore call uses it
 *   SessionProvider     installs the HTTP client's token hooks and decides
 *                       authenticated vs not
 *   ToastProvider       floats toasts above everything, inside the safe area
 *   RootNavigator       reads that status to choose which stack to mount
 *
 * Why render is blocked on fonts
 *   React Native silently substitutes the system font for one it does not have.
 *   Rendering early means every screen visibly reflows a moment later as
 *   DM Sans arrives with different metrics. One brief splash is better than a
 *   lurch on every cold start.
 *
 *   A font loading FAILURE does not block: the app renders in system fonts,
 *   which is ugly but usable. Hanging on a splash forever would not be.
 */
import { QueryClientProvider } from '@tanstack/react-query';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { queryClient } from '@/api/queryClient';
import { ToastProvider } from '@/components';
import { RootNavigator } from '@/navigation/RootNavigator';
import { SessionProvider } from '@/session/SessionContext';
import { ThemeProvider, useAppFonts, useTheme } from '@/theme';

/** Status-bar glyphs that contrast with the live theme's ground. */
function ThemedStatusBar() {
  const { scheme } = useTheme();
  return <StatusBar style={scheme === 'dark' ? 'light' : 'dark'} />;
}

export default function App() {
  const [fontsLoaded, fontError] = useAppFonts();

  // Null keeps Expo's splash screen up. Once either condition is met we render:
  // loaded means the real fonts are ready, an error means we accept the fallback.
  if (!fontsLoaded && !fontError) {
    return null;
  }

  return (
    <ThemeProvider>
      <SafeAreaProvider>
        <QueryClientProvider client={queryClient}>
          <SessionProvider>
            <ToastProvider>
              <ThemedStatusBar />
              <RootNavigator />
            </ToastProvider>
          </SessionProvider>
        </QueryClientProvider>
      </SafeAreaProvider>
    </ThemeProvider>
  );
}
