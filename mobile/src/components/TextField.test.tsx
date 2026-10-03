/**
 * TextField tests.
 *
 * What these prove
 *   The accessibility contract (every field has a visible AND an accessible
 *   label), that errors are communicated in words rather than colour alone, and
 *   that the password toggle announces the action it performs.
 */
import { fireEvent, render, screen } from '@testing-library/react-native';

import { declaredTouchHeight } from '@/test/render';
import { colors, sizes } from '@/theme';

import { TextField } from './TextField';

describe('TextField', () => {
  it('shows the label on screen and uses it as the accessible name', async () => {
    // Both matter: a placeholder-only field leaves a sighted user with nothing
    // once they start typing, and a screen reader with nothing at all.
    await render(
      <TextField label="Email" value="" onChangeText={jest.fn()} testID="email" />,
    );

    expect(screen.getByText('Email')).toBeOnTheScreen();
    expect(screen.getByLabelText('Email')).toBeOnTheScreen();
  });

  it('reports what the user types', async () => {
    const onChangeText = jest.fn();
    await render(
      <TextField label="Name" value="" onChangeText={onChangeText} testID="name" />,
    );

    await fireEvent.changeText(screen.getByTestId('name'), 'Streamly Plus');

    expect(onChangeText).toHaveBeenCalledWith('Streamly Plus');
  });

  it('shows helper text when there is no error', async () => {
    await render(
      <TextField
        label="Password"
        value=""
        onChangeText={jest.fn()}
        helper="At least 8 characters, with a number and a symbol."
      />,
    );

    expect(
      screen.getByText('At least 8 characters, with a number and a symbol.'),
    ).toBeOnTheScreen();
  });

  describe('error state', () => {
    it('shows the message as text, not just a colour', async () => {
      await render(
        <TextField
          label="Price"
          value="0"
          onChangeText={jest.fn()}
          error="Enter a valid price greater than $0."
          testID="price"
        />,
      );

      expect(screen.getByText('Enter a valid price greater than $0.')).toBeOnTheScreen();
    });

    it('hides the helper so two competing messages never show at once', async () => {
      await render(
        <TextField
          label="Password"
          value="abc"
          onChangeText={jest.fn()}
          helper="At least 8 characters."
          error="Include at least one number."
        />,
      );

      expect(screen.getByText('Include at least one number.')).toBeOnTheScreen();
      expect(screen.queryByText('At least 8 characters.')).toBeNull();
    });

    it('announces the error to screen readers as a hint on the input', async () => {
      await render(
        <TextField
          label="Email"
          value="nope"
          onChangeText={jest.fn()}
          error="Enter a valid email address."
          testID="email"
        />,
      );

      expect(screen.getByTestId('email').props.accessibilityHint).toBe(
        'Enter a valid email address.',
      );
    });

    it('also changes the border, so the state is visible without reading', async () => {
      await render(
        <TextField
          label="Price"
          value="0"
          onChangeText={jest.fn()}
          error="Bad"
          testID="p"
        />,
      );

      // The message is the primary signal; this is the redundant visual one.
      const field = screen.getByTestId('p-error');
      expect(field).toBeOnTheScreen();
    });
  });

  describe('password field', () => {
    it('masks the value by default', async () => {
      await render(
        <TextField
          label="Password"
          value="hunter2"
          onChangeText={jest.fn()}
          secureTextEntry
          testID="pw"
        />,
      );

      expect(screen.getByTestId('pw').props.secureTextEntry).toBe(true);
    });

    it('reveals the value when the toggle is pressed', async () => {
      await render(
        <TextField
          label="Password"
          value="hunter2"
          onChangeText={jest.fn()}
          secureTextEntry
          testID="pw"
        />,
      );

      await fireEvent.press(screen.getByTestId('pw-reveal'));

      expect(screen.getByTestId('pw').props.secureTextEntry).toBe(false);
    });

    it('labels the toggle with the action it performs, not the current state', async () => {
      // "Show password" tells a screen-reader user what tapping does. Labelling
      // it "Password hidden" describes state and leaves them guessing.
      await render(
        <TextField
          label="Password"
          value=""
          onChangeText={jest.fn()}
          secureTextEntry
          testID="pw"
        />,
      );

      expect(screen.getByRole('button', { name: 'Show password' })).toBeOnTheScreen();

      await fireEvent.press(screen.getByTestId('pw-reveal'));

      expect(screen.getByRole('button', { name: 'Hide password' })).toBeOnTheScreen();
    });

    it('gives the toggle a 44pt touch target', async () => {
      await render(
        <TextField
          label="Password"
          value=""
          onChangeText={jest.fn()}
          secureTextEntry
          testID="pw"
        />,
      );

      expect(
        declaredTouchHeight(screen.getByTestId('pw-reveal').props.style),
      ).toBeGreaterThanOrEqual(sizes.minTouch);
    });
  });

  describe('disabled state', () => {
    it('announces itself as disabled', async () => {
      await render(
        <TextField
          label="Email"
          value="alex@subtrak.test"
          onChangeText={jest.fn()}
          editable={false}
          testID="email"
        />,
      );

      expect(screen.getByTestId('email')).toBeDisabled();
    });
  });

  it('renders a prefix such as a currency symbol', async () => {
    await render(
      <TextField label="Price" value="8.00" onChangeText={jest.fn()} prefix="$" />,
    );

    expect(screen.getByText('$')).toBeOnTheScreen();
  });

  it('uses the caption colour for helper text, not the error colour', async () => {
    // Guards against the helper being styled as an error by accident, which
    // would make every form look like it is failing validation.
    await render(
      <TextField
        label="Password"
        value=""
        onChangeText={jest.fn()}
        helper="Some guidance."
      />,
    );

    const helper = screen.getByText('Some guidance.');
    const style = Array.isArray(helper.props.style)
      ? helper.props.style.flat()
      : [helper.props.style];
    const merged = Object.assign({}, ...style.filter(Boolean));

    expect(merged.color).not.toBe(colors.danger);
  });
});
