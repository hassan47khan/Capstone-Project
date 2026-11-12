import { fireEvent, screen } from '@testing-library/react-native';
import { Text } from 'react-native';

import { renderWithProviders } from '@/test/render';

import { TabErrorBoundary } from './TabErrorBoundary';

let shouldThrow = true;

function Flaky() {
  if (shouldThrow) throw new Error('boom');
  return <Text>Tab content</Text>;
}

beforeEach(() => {
  shouldThrow = true;
  jest.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => {
  jest.restoreAllMocks();
});

describe('TabErrorBoundary (11 §3.3)', () => {
  it('replaces a crashed tab with a recoverable fallback, and logs which tab', async () => {
    await renderWithProviders(
      <TabErrorBoundary tab="Calendar">
        <Flaky />
      </TabErrorBoundary>,
    );

    expect(screen.getByTestId('tab-crash-Calendar')).toBeOnTheScreen();
    expect(screen.getByText('Something went wrong')).toBeOnTheScreen();
    expect(console.error).toHaveBeenCalledWith(
      'The Calendar tab crashed',
      expect.any(Error),
      expect.anything(),
    );
  });

  it('remounts the tab on Try again', async () => {
    await renderWithProviders(
      <TabErrorBoundary tab="Home">
        <Flaky />
      </TabErrorBoundary>,
    );

    shouldThrow = false;
    await fireEvent.press(screen.getByRole('button', { name: 'Try again' }));

    expect(screen.getByText('Tab content')).toBeOnTheScreen();
    expect(screen.queryByTestId('tab-crash-Home')).toBeNull();
  });

  it('renders the tab untouched when nothing throws', async () => {
    shouldThrow = false;
    await renderWithProviders(
      <TabErrorBoundary tab="Home">
        <Flaky />
      </TabErrorBoundary>,
    );

    expect(screen.getByText('Tab content')).toBeOnTheScreen();
  });
});
