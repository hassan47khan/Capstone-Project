/**
 * ThemeProvider: which theme is live, and the Reduce Motion flag.
 *
 * The Profile screen's Dark / Light / System control (handoff 09 §5) is only as
 * good as this: an explicit choice must win over the OS, `system` must follow
 * the OS, and reduced motion must reach components.
 */
import { act, render, screen } from '@testing-library/react-native';
import { AccessibilityInfo, Text } from 'react-native';
import * as ReactNative from 'react-native';

import { darkColors, lightColors } from './tokens';
import { ThemeProvider, useTheme, type ThemePreference } from './ThemeProvider';

/** Prints what the theme resolved to, so a test can read it back. */
function Probe() {
  const { scheme, colors, reduceMotion } = useTheme();
  return (
    <Text testID="probe">
      {scheme}|{colors.bg}|{String(reduceMotion)}
    </Text>
  );
}

const probe = () => String(screen.getByTestId('probe').props.children.join(''));

function mockOsScheme(scheme: 'light' | 'dark') {
  jest.spyOn(ReactNative, 'useColorScheme').mockReturnValue(scheme);
}

afterEach(() => {
  jest.restoreAllMocks();
});

describe('ThemeProvider', () => {
  it.each<[ThemePreference, 'light' | 'dark', 'light' | 'dark']>([
    ['system', 'dark', 'dark'],
    ['system', 'light', 'light'],
    ['light', 'dark', 'light'],
    ['dark', 'light', 'dark'],
  ])('preference %s with OS %s resolves to %s', async (preference, os, expected) => {
    mockOsScheme(os);

    await render(
      <ThemeProvider initialPreference={preference}>
        <Probe />
      </ThemeProvider>,
    );

    const bg = expected === 'dark' ? darkColors.bg : lightColors.bg;
    expect(probe()).toBe(`${expected}|${bg}|false`);
  });

  it('falls back to the light theme outside a provider', async () => {
    // A bare component test renders without the app's providers.
    await render(<Probe />);

    expect(probe()).toBe(`light|${lightColors.bg}|false`);
  });

  it('exposes the OS Reduce Motion setting and follows changes to it', async () => {
    let notify: (enabled: boolean) => void = () => {};
    jest.spyOn(AccessibilityInfo, 'isReduceMotionEnabled').mockResolvedValue(true);
    jest
      .spyOn(AccessibilityInfo, 'addEventListener')
      .mockImplementation((_event, handler) => {
        notify = handler as unknown as (enabled: boolean) => void;
        return { remove: jest.fn() } as unknown as ReturnType<
          typeof AccessibilityInfo.addEventListener
        >;
      });

    await render(
      <ThemeProvider initialPreference="light">
        <Probe />
      </ThemeProvider>,
    );
    expect(probe()).toBe(`light|${lightColors.bg}|true`);

    await act(async () => notify(false));
    expect(probe()).toBe(`light|${lightColors.bg}|false`);
  });
});
