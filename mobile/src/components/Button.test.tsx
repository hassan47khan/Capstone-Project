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
import { Animated } from 'react-native';

import { lightColors, motion, sizes, ThemeProvider } from '@/theme';

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
        variant="destructive"
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

    it('announces the action in progress, not just "loading"', async () => {
      // 02 §1: the loading state says "Saving" or the action verb.
      await render(
        <Button
          label="Save"
          loadingLabel="Saving"
          onPress={jest.fn()}
          loading
          testID="save"
        />,
      );

      expect(screen.getByTestId('save-spinner').props.accessibilityLabel).toBe('Saving');
    });
  });

  describe('secondary vs disabled (02 §1, critical)', () => {
    it('never share a fill, a border or a label colour', async () => {
      // The prototype's "Cancel" read as disabled because both were flat grey.
      await render(
        <>
          <Button label="Cancel" variant="secondary" onPress={jest.fn()} testID="sec" />
          <Button label="Save" disabled onPress={jest.fn()} testID="dis" />
        </>,
      );

      const secondary = StyleSheetFlatten(screen.getByTestId('sec-surface').props.style);
      const disabled = StyleSheetFlatten(screen.getByTestId('dis-surface').props.style);
      const label = (text: string) =>
        StyleSheetFlatten(screen.getByText(text).props.style).color;

      expect(secondary.backgroundColor).not.toBe(disabled.backgroundColor);
      expect(secondary.borderWidth).toBe(1);
      expect(disabled.borderWidth).toBeUndefined();
      expect(label('Cancel')).toBe(lightColors.text);
      expect(label('Save')).toBe(lightColors.textMuted);
    });
  });

  describe('destructiveOutline vs destructive (02 §1)', () => {
    it('outlines the trigger and fills only the confirm', async () => {
      await render(
        <>
          <Button
            label="Delete Subscription"
            variant="destructiveOutline"
            onPress={jest.fn()}
            testID="trigger"
          />
          <Button
            label="Delete"
            variant="destructive"
            onPress={jest.fn()}
            testID="confirm"
          />
        </>,
      );

      const trigger = StyleSheetFlatten(
        screen.getByTestId('trigger-surface').props.style,
      );
      const confirm = StyleSheetFlatten(
        screen.getByTestId('confirm-surface').props.style,
      );

      // The trigger takes NO danger tint: the prototype's tinted Remove button
      // put its label at 4.29:1, an AA failure at 14px.
      expect(trigger.backgroundColor).toBe('transparent');
      expect(trigger.borderColor).toBe(lightColors.danger);
      expect(trigger.borderWidth).toBe(1);

      // A solid red button always means "this happens now".
      expect(confirm.backgroundColor).toBe(lightColors.danger);
      expect(confirm.borderWidth).toBeUndefined();
    });

    it('draws the outline label in danger, and Bold as 02 §1 tabulates', async () => {
      await render(
        <Button
          label="Remove from Family"
          variant="destructiveOutline"
          onPress={jest.fn()}
        />,
      );

      const label = StyleSheetFlatten(screen.getByText('Remove from Family').props.style);
      expect(label.color).toBe(lightColors.danger);
      expect(label.fontFamily).toBe('DMSans_700Bold');
    });

    it('keeps secondary and ghost SemiBold', async () => {
      await render(
        <>
          <Button label="Cancel" variant="secondary" onPress={jest.fn()} />
          <Button label="Forgot password?" variant="ghost" onPress={jest.fn()} />
        </>,
      );

      for (const text of ['Cancel', 'Forgot password?']) {
        expect(StyleSheetFlatten(screen.getByText(text).props.style).fontFamily).toBe(
          'DMSans_600SemiBold',
        );
      }
    });
  });

  describe('motion', () => {
    afterEach(() => jest.restoreAllMocks());

    it('scales on press', async () => {
      const timing = jest.spyOn(Animated, 'timing');
      await render(<Button label="Save" onPress={jest.fn()} />);

      await fireEvent(screen.getByRole('button'), 'pressIn');

      expect(timing).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({ toValue: motion.pressScale, duration: motion.press }),
      );
    });

    it('does not scale under reduced motion', async () => {
      const timing = jest.spyOn(Animated, 'timing');
      await render(
        <ThemeProvider initialPreference="light" reduceMotionOverride>
          <Button label="Save" onPress={jest.fn()} />
        </ThemeProvider>,
      );

      await fireEvent(screen.getByRole('button'), 'pressIn');

      expect(timing).not.toHaveBeenCalled();
    });
  });

  describe('accessibility floor', () => {
    it.each([
      'primary',
      'secondary',
      'destructiveOutline',
      'destructive',
      'ghost',
    ] as const)('%s meets the 44pt minimum touch target', async (variant) => {
      await render(
        <Button label="Action" onPress={jest.fn()} variant={variant} testID="btn" />,
      );

      const style = StyleSheetFlatten(screen.getByTestId('btn').props.style);
      const effectiveHeight = style.height ?? style.minHeight ?? 0;

      expect(Math.max(effectiveHeight, style.minHeight ?? 0)).toBeGreaterThanOrEqual(
        sizes.minTouch,
      );
    });

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
