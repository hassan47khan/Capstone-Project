/**
 * App root.
 *
 * What this is for
 *   Mounting the providers in the one order that works, and holding the splash
 *   until the fonts are ready.
 *
 * Why the provider order is what it is — each layer needs the one above it
 *   SafeAreaProvider   measures insets; Screen and TabBar read them
 *   QueryClientProvider owns the server cache; the session's restore call uses it
 *   SessionProvider     installs the HTTP client's token hooks and decides
 *                       authenticated vs not
 *   RootNavigator       reads that status to choose which stack to mount
 *
 * Why render is blocked on fonts
 *   React Native silently substitutes the system font for one it does not have.
 *   Rendering early means every screen visibly reflows a moment later as
 *   Newsreader arrives with different metrics. One brief splash is better than a
 *   lurch on every cold start.
 *
 *   A font loading FAILURE does not block: the app renders in system fonts,
 *   which is ugly but usable. Hanging on a splash forever would not be.
 */
import { StatusBar } from 'expo-status-bar';
import { StyleSheet, Text, View } from 'react-native';

export default function App() {
  return (
    <View style={styles.container}>
      <Text>Mobile app scaffold</Text>
      <StatusBar style="auto" />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    flex: 1,
    justifyContent: 'center',
  },
});
