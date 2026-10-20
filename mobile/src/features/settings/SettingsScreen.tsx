/**
 * Settings screen.
 *
 * Placeholder. The real screen is built in Phase 3 — Epic B and satisfies US-4, US-5.
 * See src/features/Placeholder.tsx for why these exist.
 *
 * In development builds it also links to the component gallery
 * (src/features/dev/GalleryScreen.tsx). `__DEV__` is false in a release bundle,
 * so the row and the route both disappear from production.
 */
import { useNavigation } from '@react-navigation/native';

import { GroupedList, SettingsRow } from '@/components';
import { Placeholder } from '@/features/Placeholder';

export function SettingsScreen() {
  const navigation = useNavigation();

  return (
    <Placeholder
      title="Settings"
      phase="Phase 3 — Epic B"
      stories="US-4, US-5"
      backLabel="Home"
      onBack={() => navigation.goBack()}
    >
      {__DEV__ ? (
        <GroupedList title="Developer">
          <SettingsRow
            label="Component gallery"
            onPress={() => navigation.navigate('App', { screen: 'DevGallery' })}
            testID="dev-gallery-link"
          />
        </GroupedList>
      ) : null}
    </Placeholder>
  );
}
