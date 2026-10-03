/**
 * Button tests.
 *
 * What these prove
 *   The behaviour and the accessibility contract, not the styling. In
 *   particular: a disabled or submitting button cannot fire its handler, and
 *   every button is announced correctly and is big enough to hit.
 *
 * Why the touch-target test is written against the style object
 *   React Test Renderer has no layout engine — nothing here is actually laid
 *   out, so we cannot measure a rendered button. Asserting that the style
 *   declares at least 44pt is the strongest check available off-device, and it
 *   catches the realistic regression: somebody setting a smaller height.
 *
 * IMPORTANT — `render` is ASYNC in React Native Testing Library v14.
 *   It returns a Promise and must be awaited. Forgetting the `await` does not
 *   throw; it leaves `screen` unpopulated and every query then fails with the
 *   baffling message "`render` function has not been called". If you see that,
 *   the fix is almost always a missing `await`.
 */
import { fireEvent, render, screen } from '@testing-library/react-native';

import { sizes } from '@/theme';

import { Button } from './Button';

describe('Button', () => {
  it('renders its label and fires onPress', async () => {
    const onPress = jest.fn();
    await render(<Button label="Save subscription" onPress={onPress} />);

    fireEvent.press(screen.getByText('Save subscription'));

    expect(onPress).toHaveBeenCalledTimes(1);
  });

  it('is announced as a button with its label as the accessible name', async () => {
    await render(<Button label="Create account" onPress={jest.fn()} />);

    expect(screen.getByRole('button', { name: 'Create account' })).toBeOnTheScreen();
  });

  it('uses an explicit accessibilityLabel when the visible label is too terse', async () => {
    // "Remove" alone tells a screen-reader user nothing about what is removed.
    await render(
      <Button
        label="Remove"
        accessibilityLabel="Remove Streamly Plus subscription"
        variant="dangerText"
        onPress={jest.fn()}
      />,
    );

    expect(
      screen.getByRole('button', { name: 'Remove Streamly Plus subscription' }),
    ).toBeOnTheScreen();
  });

  describe('when disabled', () => {
    it('does not fire onPress', async () => {
      const onPress = jest.fn();
      await render(<Button label="Save" onPress={onPress} disabled />);

      fireEvent.press(screen.getByRole('button'));

      expect(onPress).not.toHaveBeenCalled();
    });

    it('announces itself as disabled', async () => {
      await render(<Button label="Save" onPress={jest.fn()} disabled />);

      // v14 replaced toHaveAccessibilityState with these semantic matchers.
      expect(screen.getByRole('button')).toBeDisabled();
    });
  });

  describe('when loading', () => {
    /**
     * The double-submit guard. Without it, an impatient tap on a slow network
     * creates two subscriptions — and the user only finds out later, on the
     * dashboard.
     */
    it('does not fire onPress', async () => {
      const onPress = jest.fn();
      await render(<Button label="Save" onPress={onPress} loading />);

      fireEvent.press(screen.getByRole('button'));

      expect(onPress).not.toHaveBeenCalled();
    });

    it('announces itself as busy and disabled', async () => {
      await render(<Button label="Save" onPress={jest.fn()} loading />);

      const button = screen.getByRole('button');
      expect(button).toBeBusy();
      expect(button).toBeDisabled();
    });

    it('replaces the label with a spinner so the width does not jump', async () => {
      await render(<Button label="Save" onPress={jest.fn()} loading testID="save" />);

      expect(screen.queryByText('Save')).toBeNull();
      expect(screen.getByTestId('save-spinner')).toBeOnTheScreen();
    });
  });

  describe('accessibility floor', () => {
    it.each(['primary', 'secondary', 'text', 'dangerText'] as const)(
      '%s meets the 44pt minimum touch target',
      async (variant) => {
        await render(
          <Button label="Action" onPress={jest.fn()} variant={variant} testID="btn" />,
        );

        const style = StyleSheetFlatten(screen.getByTestId('btn').props.style);
        const effectiveHeight = style.height ?? style.minHeight ?? 0;

        expect(Math.max(effectiveHeight, style.minHeight ?? 0)).toBeGreaterThanOrEqual(
          sizes.minTouch,
        );
      },
    );

    it('caps font scaling so a large system font cannot burst the button', async () => {
      await render(<Button label="Save" onPress={jest.fn()} />);

      expect(screen.getByText('Save').props.maxFontSizeMultiplier).toBeDefined();
    });
  });
});

/**
 * Pressable's `style` prop is a function, and RNTL hands back whatever it
 * returned — an array with holes for the falsy branches. Flattening it gives one
 * object to assert against.
 */
function StyleSheetFlatten(style: unknown): Record<string, number | undefined> {
  const flat: Record<string, number | undefined> = {};

  const visit = (value: unknown) => {
    if (Array.isArray(value)) {
      value.forEach(visit);
    } else if (value && typeof value === 'object') {
      Object.assign(flat, value);
    }
  };

  visit(
    typeof style === 'function'
      ? (style as (s: object) => unknown)({ pressed: false })
      : style,
  );
  return flat;
}
