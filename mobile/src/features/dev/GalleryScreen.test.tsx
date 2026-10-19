/**
 * Smoke test for the dev component gallery (handoff 02 §16).
 *
 * The gallery is checked by eye on a phone; this only proves it renders every
 * section in both themes without throwing, so a component change that breaks a
 * state is caught before anyone opens it.
 */
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { screen } from '@testing-library/react-native';

import { renderWithProviders } from '@/test/render';

import { GalleryScreen } from './GalleryScreen';

const Stack = createNativeStackNavigator();

function InNavigator() {
  return (
    <NavigationContainer>
      <Stack.Navigator screenOptions={{ headerShown: false }}>
        <Stack.Screen name="Gallery" component={GalleryScreen} />
      </Stack.Navigator>
    </NavigationContainer>
  );
}

const SECTIONS = [
  'Theme',
  'Button',
  'TextField',
  'CurrencyField',
  'SegmentedControl',
  'Select',
  'DateField',
  'SettingsRow + Toggle',
  'Card',
  'ListRow',
  'CategoryBadge',
  'BottomSheet + Toast',
  'EmptyState',
  'Skeleton',
];

describe.each(['light', 'dark'] as const)('GalleryScreen in the %s theme', (scheme) => {
  it('renders a section for every component', async () => {
    await renderWithProviders(<InNavigator />, { scheme });

    for (const title of SECTIONS) {
      expect(screen.getByRole('header', { name: title })).toBeOnTheScreen();
    }
  });
});
