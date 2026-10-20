/**
 * Tests for the handoff-02 component library.
 *
 * Each component is checked against the same questions as the primitives:
 * does it render what it was given, is it announced correctly, is anything
 * tappable at least 44pt — plus the specific rules 02 calls out (secondary vs
 * disabled, whole-row toggles, five segments, two-tone subtitles, reduced
 * motion). Button and TextField have their own files.
 *
 * `render` and `fireEvent` are ASYNC in RNTL v14 — always await them.
 */
import { act, fireEvent, screen } from '@testing-library/react-native';
import { AccessibilityInfo, Animated, Text } from 'react-native';

import { declaredTouchHeight, flattenStyle, renderWithProviders } from '@/test/render';
import {
  darkCategoryColors,
  lightCategoryColors,
  lightColors,
  motion,
  motionFor,
  opacity,
  radius,
  sizes,
} from '@/theme';

import { BottomSheet, ConfirmSheet } from './BottomSheet';
import { Card } from './Card';
import { CategoryBadge } from './CategoryBadge';
import {
  CurrencyField,
  invalidPriceMessage,
  isValidPrice,
  normalizePriceInput,
} from './CurrencyField';
import { DateField, toDateOnly } from './DateField';
import { GroupedList } from './GroupedList';
import { ListRow } from './ListRow';
import { SectionHeader } from './SectionHeader';
import {
  BILLING_CYCLE_OPTIONS,
  BillingCycleField,
  SegmentedControl,
  segmentBudget,
  WIDEST_BILLING_LABEL_PX,
} from './SegmentedControl';
import { SearchField } from './SearchField';
import { Select } from './Select';
import { SettingsRow } from './SettingsRow';
import { Skeleton } from './Skeleton';
import { STEPPER_MAX, STEPPER_MIN, Stepper } from './Stepper';
import { useToast } from './Toast';

const HIDDEN = { includeHiddenElements: true } as const;
const render = renderWithProviders;

afterEach(() => {
  jest.restoreAllMocks();
  jest.useRealTimers();
});

describe('motion (02 §15)', () => {
  it('reduces every movement to nothing or a cross-fade', () => {
    const reduced = motionFor(true);
    expect(reduced.moves).toBe(false);
    expect(reduced.pressScale).toBe(1);
    expect(reduced.toastRise).toBe(0);
    expect(reduced.toggle).toBe(0);
    expect(reduced.pulse).toBe(0);
    expect(reduced.sheetIn).toBe(motion.crossFade);
    expect(reduced.modal).toBe(motion.crossFade);
  });

  it('keeps the specified timings otherwise', () => {
    const full = motionFor(false);
    expect([full.press, full.sheetIn, full.sheetOut, full.toast, full.pulse]).toEqual([
      100, 300, 250, 200, 1500,
    ]);
  });
});

describe('SettingsRow — toggle (02 §7, §11)', () => {
  it('makes the whole row the switch, with its label and state', async () => {
    const onValueChange = jest.fn();
    await render(
      <SettingsRow
        variant="toggle"
        label="Billing reminders"
        value={false}
        onValueChange={onValueChange}
        testID="row"
      />,
    );

    const row = screen.getByRole('switch', { name: 'Billing reminders' });
    expect(row).not.toBeChecked();
    await fireEvent.press(screen.getByTestId('row'));
    expect(onValueChange).toHaveBeenCalledWith(true);
  });

  it('is 52pt tall, so the 24pt toggle sits in a target anyone can hit', async () => {
    await render(
      <SettingsRow
        variant="toggle"
        label="X"
        value
        onValueChange={jest.fn()}
        testID="row"
      />,
    );

    const height = declaredTouchHeight(screen.getByTestId('row').props.style);
    expect(height).toBe(sizes.rowSettingsToggle);
    expect(height).toBeGreaterThanOrEqual(sizes.minTouch);
  });

  it('hides the visual toggle from screen readers — the row speaks for it', async () => {
    await render(
      <SettingsRow variant="toggle" label="X" value onValueChange={jest.fn()} />,
    );

    expect(screen.queryAllByRole('switch')).toHaveLength(1);
  });

  it('snaps the thumb under reduced motion', async () => {
    const timing = jest.spyOn(Animated, 'timing');
    const { rerender } = await render(
      <SettingsRow variant="toggle" label="X" value={false} onValueChange={jest.fn()} />,
      { reduceMotion: true },
    );
    await rerender(
      <SettingsRow variant="toggle" label="X" value onValueChange={jest.fn()} />,
    );

    expect(timing).not.toHaveBeenCalled();
  });
});

describe('SettingsRow — other variants', () => {
  it('chevron: announces its current value with the label', async () => {
    await render(<SettingsRow label="Currency" value="USD" onPress={jest.fn()} />);

    expect(screen.getByRole('button', { name: 'Currency, USD' })).toBeOnTheScreen();
  });

  it('destructive: draws the label in danger red', async () => {
    await render(
      <SettingsRow variant="destructive" label="Sign out" onPress={jest.fn()} />,
    );

    expect(flattenStyle(screen.getByText('Sign out').props.style).color).toBe(
      lightColors.danger,
    );
  });

  it('stepper: steps within its bounds and is adjustable for screen readers', async () => {
    const onValueChange = jest.fn();
    await render(
      <SettingsRow
        variant="stepper"
        label="Remind me"
        value={1}
        min={1}
        max={3}
        format={(n) => `${n} days`}
        onValueChange={onValueChange}
        testID="step"
      />,
    );

    expect(screen.getByTestId('step-decrement')).toBeDisabled();
    await fireEvent.press(screen.getByTestId('step-increment'));
    expect(onValueChange).toHaveBeenCalledWith(2);
    expect(screen.getByTestId('step').props.accessibilityRole).toBe('adjustable');
    expect(screen.getByTestId('step').props.accessibilityValue).toEqual({
      text: '1 days',
    });
  });
});

describe('GroupedList', () => {
  it('renders its section header, rows and footnote', async () => {
    await render(
      <GroupedList title="Display" footnote="Rates from Sep 30.">
        <SettingsRow label="Currency" onPress={jest.fn()} />
        <SettingsRow label="Time zone" onPress={jest.fn()} />
      </GroupedList>,
    );

    expect(screen.getByRole('header', { name: 'Display' })).toBeOnTheScreen();
    expect(screen.getByText('Time zone')).toBeOnTheScreen();
    expect(screen.getByText('Rates from Sep 30.')).toBeOnTheScreen();
  });

  it('drops conditional rows that rendered nothing', async () => {
    const showExtra = false;
    await render(
      <GroupedList>
        <SettingsRow label="Only row" onPress={jest.fn()} />
        {showExtra && <SettingsRow label="Hidden" onPress={jest.fn()} />}
      </GroupedList>,
    );

    expect(screen.queryByText('Hidden')).toBeNull();
  });
});

describe('SegmentedControl (02 §4)', () => {
  it('is a tablist of tabs with the current one selected', async () => {
    await render(
      <SegmentedControl
        label="Billing cycle"
        options={BILLING_CYCLE_OPTIONS}
        value="monthly"
        onChange={jest.fn()}
      />,
    );

    expect(screen.getByLabelText('Billing cycle').props.accessibilityRole).toBe(
      'tablist',
    );
    expect(screen.getByRole('tab', { name: 'Monthly' })).toBeSelected();
    expect(screen.getByRole('tab', { name: 'Weekly' })).not.toBeSelected();
  });

  it('always offers all five billing cycles', async () => {
    // The prototype dropped Quarterly in one place and Custom in another.
    await render(
      <SegmentedControl
        label="Billing cycle"
        options={BILLING_CYCLE_OPTIONS}
        value="monthly"
        onChange={jest.fn()}
      />,
    );

    expect(screen.getAllByRole('tab').map((tab) => tab.props.accessibilityLabel)).toEqual(
      ['Weekly', 'Monthly', 'Quarterly', 'Yearly', 'Custom'],
    );
  });

  it('reports the chosen value', async () => {
    const onChange = jest.fn();
    await render(
      <SegmentedControl
        label="Billing cycle"
        options={BILLING_CYCLE_OPTIONS}
        value="monthly"
        onChange={onChange}
        testID="cycle"
      />,
    );

    await fireEvent.press(screen.getByTestId('cycle-quarterly'));
    expect(onChange).toHaveBeenCalledWith('quarterly');
  });

  it('fits five labels without truncation at 402pt', () => {
    // There is no layout engine here, so this checks the arithmetic the design
    // rests on: the widest label, measured from the font file, fits its share.
    expect(WIDEST_BILLING_LABEL_PX).toBeLessThanOrEqual(segmentBudget(402));
  });

  it('switches to a Select when a larger text size would truncate', async () => {
    await render(
      <BillingCycleField value="monthly" onChange={jest.fn()} fontScale={1.3} />,
    );

    expect(screen.queryAllByRole('tab')).toHaveLength(0);
    expect(screen.getByRole('combobox', { name: 'Billing cycle' })).toBeOnTheScreen();
  });

  it('uses segments at the default text size', async () => {
    await render(
      <BillingCycleField value="monthly" onChange={jest.fn()} fontScale={1} />,
    );

    expect(screen.getAllByRole('tab')).toHaveLength(5);
  });
});

describe('ListRow (02 §9)', () => {
  const netflix = {
    name: 'Netflix',
    price: '15.49',
    currency: 'USD',
    cycle: { unit: 'month', count: 1 },
    nextBillOn: '2026-10-12',
  } as const;

  it('is one touchable with the composed label from 02', async () => {
    const onPress = jest.fn();
    await render(<ListRow {...netflix} onPress={onPress} />);

    const row = screen.getByRole('button', {
      name: 'Netflix, $15.49 per month, next bill October 12, 2026',
    });
    await fireEvent.press(row);
    expect(onPress).toHaveBeenCalled();
  });

  it('builds the subtitle from two text nodes: muted label, medium value', async () => {
    await render(<ListRow {...netflix} />);

    const value = flattenStyle(screen.getByText('Oct 12, 2026', HIDDEN).props.style);
    expect(value.fontFamily).toBe('DMSans_500Medium');
    expect(value.color).toBe(lightColors.text);
  });

  it('truncates a long name on one line and keeps the suffix', async () => {
    await render(<ListRow {...netflix} name="A very long service name indeed" />);

    expect(
      screen.getByText('A very long service name indeed', HIDDEN).props.numberOfLines,
    ).toBe(1);
    expect(screen.getByText('/mo', HIDDEN)).toBeTruthy();
  });

  it('dims a cancelled subscription and says so', async () => {
    await render(<ListRow {...netflix} cancelled />);

    expect(screen.getByLabelText(/cancelled$/)).toBeOnTheScreen();
    expect(flattenStyle(screen.getByText('Netflix', HIDDEN).props.style).opacity).toBe(
      opacity.cancelled,
    );
  });

  it('meets the 72pt row height', async () => {
    await render(<ListRow {...netflix} onPress={jest.fn()} testID="row" />);

    expect(declaredTouchHeight(screen.getByTestId('row').props.style)).toBe(
      sizes.rowSubscription,
    );
  });

  describe('compact (Home upcoming renewals)', () => {
    it('shows a relative date instead of the two-tone absolute one', async () => {
      await render(<ListRow {...netflix} compact today="2026-10-10" />);

      expect(screen.getByText('in 2 days', HIDDEN)).toBeOnTheScreen();
      expect(screen.queryByText('Oct 12, 2026', HIDDEN)).toBeNull();
    });

    it('keeps the spoken label absolute — "in 2 days" alone is not actionable', async () => {
      await render(
        <ListRow {...netflix} compact today="2026-10-10" onPress={jest.fn()} />,
      );

      expect(
        screen.getByRole('button', {
          name: 'Netflix, $15.49 per month, next bill October 12, 2026',
        }),
      ).toBeOnTheScreen();
    });

    it('falls back to the absolute date rather than inventing a today', async () => {
      await render(<ListRow {...netflix} compact />);

      expect(screen.getByText('Oct 12, 2026', HIDDEN)).toBeOnTheScreen();
    });

    it('drops the 72pt floor, pads 12, and shrinks the mark to 36', async () => {
      await render(<ListRow {...netflix} compact testID="row" />);

      const row = flattenStyle(screen.getByTestId('row').props.style);
      expect(row.minHeight).toBeUndefined();
      expect(row.padding).toBe(12);

      const letter = flattenStyle(screen.getByText('N', HIDDEN).props.style);
      expect(letter.fontSize).toBe(sizes.markCompact * 0.375);
    });

    it('draws the amount in text, not accent, and drops the /mo suffix', async () => {
      // 02 §9: a dozen accent figures down the renewals list would out-shout
      // the one hero total above them.
      await render(<ListRow {...netflix} compact today="2026-10-10" />);

      const amount = flattenStyle(screen.getByText('$15.49', HIDDEN).props.style);
      expect(amount.color).toBe(lightColors.text);
      expect(amount.fontFamily).toBe('DMSans_500Medium');
      expect(screen.queryByText('/mo', HIDDEN)).toBeNull();
    });
  });
});

describe('Select (02 §5)', () => {
  const OPTIONS = [
    { value: 'entertainment', label: 'Entertainment' },
    { value: 'productivity', label: 'Productivity' },
  ] as const;

  it('shows the placeholder when nothing is chosen', async () => {
    await render(
      <Select
        label="Category"
        options={OPTIONS}
        value={null}
        onChange={jest.fn()}
        placeholder="Choose a category"
      />,
    );

    expect(screen.getByText('Choose a category')).toBeOnTheScreen();
  });

  it('announces its current value', async () => {
    await render(
      <Select
        label="Category"
        options={OPTIONS}
        value="productivity"
        onChange={jest.fn()}
        testID="cat"
      />,
    );

    expect(screen.getByTestId('cat').props.accessibilityValue).toEqual({
      text: 'Productivity',
    });
  });

  it('opens a sheet and reports the option picked', async () => {
    const onChange = jest.fn();
    await render(
      <Select
        label="Category"
        options={OPTIONS}
        value={null}
        onChange={onChange}
        testID="cat"
      />,
    );

    await fireEvent.press(screen.getByTestId('cat'));
    expect(screen.getByTestId('cat-sheet')).toBeOnTheScreen();
    await fireEvent.press(screen.getByTestId('cat-option-entertainment'));

    expect(onChange).toHaveBeenCalledWith('entertainment');
  });

  it('draws custom option content, such as a CategoryBadge', async () => {
    await render(
      <Select
        label="Category"
        options={OPTIONS}
        value="entertainment"
        onChange={jest.fn()}
        renderOption={(option) => (
          <CategoryBadge category={option.value} testID={`b-${option.value}`} />
        )}
      />,
    );

    expect(screen.getByTestId('b-entertainment')).toBeOnTheScreen();
  });
});

describe('CurrencyField (02 §3)', () => {
  it.each([
    ['15,49', 'USD', '15.49'],
    ['15.499', 'USD', '15.49'],
    ['$1,234.5', 'USD', '1.2345'.slice(0, 0) + '1.23'],
    ['1200', 'JPY', '1200'],
    ['1200.50', 'JPY', '1200'],
    ['abc', 'EUR', ''],
  ])(
    'normalizes %p in %s to %p — text only, no arithmetic',
    (input, currency, expected) => {
      expect(normalizePriceInput(input, currency)).toBe(expected);
    },
  );

  it.each([
    ['15.49', true],
    ['0', false],
    ['0.00', false],
    ['', false],
    ['.5', false],
    ['0.01', true],
  ])('isValidPrice(%p) is %p', (value, valid) => {
    expect(isValidPrice(value)).toBe(valid);
  });

  it('words the error with the selected currency, never a hardcoded $', () => {
    expect(invalidPriceMessage('USD')).toBe('Enter a valid price greater than $0.');
    expect(invalidPriceMessage('EUR')).toBe('Enter a valid price greater than €0.');
  });

  it('shows the billing currency symbol', async () => {
    await render(<CurrencyField value="9.99" onChangeValue={jest.fn()} currency="GBP" />);

    expect(screen.getByText('£')).toBeOnTheScreen();
  });

  it('reports a normalized value as the user types', async () => {
    const onChangeValue = jest.fn();
    await render(
      <CurrencyField
        value=""
        onChangeValue={onChangeValue}
        currency="EUR"
        testID="price"
      />,
    );

    await fireEvent.changeText(screen.getByTestId('price'), '9,99');
    expect(onChangeValue).toHaveBeenCalledWith('9.99');
  });
});

describe('DateField (02 §6)', () => {
  it('shows the date in the long style and announces it', async () => {
    await render(
      <DateField label="Next bill" value="2026-10-12" onChange={jest.fn()} testID="d" />,
    );

    expect(screen.getByText('Oct 12, 2026')).toBeOnTheScreen();
    expect(screen.getByTestId('d').props.accessibilityValue).toEqual({
      text: 'Oct 12, 2026',
    });
  });

  it('opens the native picker on a tap and reports a calendar date', async () => {
    const onChange = jest.fn();
    await render(
      <DateField label="Next bill" value={null} onChange={onChange} testID="d" />,
    );

    await fireEvent.press(screen.getByTestId('d'));
    const picker = screen.getByTestId('d-picker');
    await act(async () => {
      picker.props.onChange({ type: 'set' }, new Date(2026, 9, 12));
    });

    expect(onChange).toHaveBeenCalledWith('2026-10-12');
  });

  it('builds the date from local parts, so it never shifts a day', () => {
    expect(toDateOnly(new Date(2026, 0, 1, 23, 59))).toBe('2026-01-01');
  });
});

describe('Card, CategoryBadge, SectionHeader', () => {
  it('Card draws a border and no shadow', async () => {
    await render(
      <Card testID="card">
        <Text>Inside</Text>
      </Card>,
    );

    const style = flattenStyle(screen.getByTestId('card').props.style);
    expect(style.borderWidth).toBe(1);
    expect(style.shadowOpacity).toBeUndefined();
    expect(style.elevation).toBeUndefined();
  });

  it('CategoryBadge pairs the dot with its label, per theme', async () => {
    await render(<CategoryBadge category="ai-tools" testID="b" />);
    expect(screen.getByLabelText('AI Tools')).toBeOnTheScreen();
    expect(
      flattenStyle(screen.getByTestId('b-dot', HIDDEN).props.style).backgroundColor,
    ).toBe(lightCategoryColors.aiTools);
  });

  it('CategoryBadge uses the dark category colour in the dark theme', async () => {
    await render(<CategoryBadge category="ai-tools" testID="b" />, { scheme: 'dark' });
    expect(
      flattenStyle(screen.getByTestId('b-dot', HIDDEN).props.style).backgroundColor,
    ).toBe(darkCategoryColors.aiTools);
  });

  it('CategoryBadge reads "Uncategorized" for a null category', async () => {
    await render(<CategoryBadge category={null} />);
    expect(screen.getByLabelText('Uncategorized')).toBeOnTheScreen();
  });

  it('SectionHeader is a header, uppercase, Bold, and not below 12px', async () => {
    await render(<SectionHeader title="Notifications" />);

    const header = screen.getByRole('header', { name: 'Notifications' });
    const style = flattenStyle(header.props.style);
    expect(style.textTransform).toBe('uppercase');
    // 02 §14: Bold 12, measured. The 11px SemiBold it first listed was a
    // misread, and 11 would break 01 §4's floor for new text.
    expect(style.fontFamily).toBe('DMSans_700Bold');
    expect(Number(style.fontSize)).toBeGreaterThanOrEqual(12);
  });

  it('SectionHeader draws an optional category square the reader never hears', async () => {
    // 01 §7: colour is never the only carrier, so the label is always there and
    // the square is decorative.
    await render(
      <SectionHeader
        title="Entertainment"
        color={lightCategoryColors.entertainment}
        testID="sh"
      />,
    );

    expect(screen.getByRole('header', { name: 'Entertainment' })).toBeOnTheScreen();

    const square = screen.getByTestId('sh-square', HIDDEN);
    expect(square.props.accessibilityElementsHidden).toBe(true);
    const style = flattenStyle(square.props.style);
    expect(style.width).toBe(sizes.dot);
    expect(style.height).toBe(sizes.dot);
    expect(style.borderRadius).toBe(radius.badge);
    expect(style.backgroundColor).toBe(lightCategoryColors.entertainment);
  });
});

describe('BottomSheet (02 §12)', () => {
  it('closes on a backdrop tap', async () => {
    const onClose = jest.fn();
    await render(
      <BottomSheet visible onClose={onClose} title="Pick one" testID="sheet">
        <Text>Body</Text>
      </BottomSheet>,
    );

    // Included-hidden: in a test the fade-in has not run, so it is still at opacity 0.
    await fireEvent.press(screen.getByTestId('sheet-backdrop', HIDDEN));
    expect(onClose).toHaveBeenCalled();
  });

  it('ignores the backdrop when not dismissible', async () => {
    const onClose = jest.fn();
    await render(
      <BottomSheet visible onClose={onClose} dismissible={false} testID="sheet">
        <Text>Body</Text>
      </BottomSheet>,
    );

    await fireEvent.press(screen.getByTestId('sheet-backdrop', HIDDEN));
    expect(onClose).not.toHaveBeenCalled();
  });

  it('is modal for screen readers', async () => {
    await render(
      <BottomSheet visible onClose={jest.fn()} title="Pick one" testID="sheet">
        <Text>Body</Text>
      </BottomSheet>,
    );

    expect(screen.getByTestId('sheet').props.accessibilityViewIsModal).toBe(true);
  });

  it('slides normally, but only fades under reduced motion', async () => {
    const { rerender } = await render(
      <BottomSheet visible onClose={jest.fn()} testID="sheet">
        <Text>Body</Text>
      </BottomSheet>,
    );
    expect(flattenStyle(screen.getByTestId('sheet').props.style).transform).toBeDefined();

    await rerender(<></>);
    await render(
      <BottomSheet visible onClose={jest.fn()} testID="sheet2">
        <Text>Body</Text>
      </BottomSheet>,
      { reduceMotion: true },
    );
    const reduced = flattenStyle(screen.getByTestId('sheet2').props.style);
    expect(reduced.transform).toBeUndefined();
    expect(reduced.opacity).toBeDefined();
  });

  it('takes the measured 70% scrim and 24pt top radius', async () => {
    await render(
      <BottomSheet visible onClose={jest.fn()} title="Pick one" testID="sheet">
        <Text>Body</Text>
      </BottomSheet>,
    );

    expect(
      flattenStyle(screen.getByTestId('sheet-backdrop', HIDDEN).parent?.props.style)
        .backgroundColor,
    ).toBe(lightColors.scrim);
    expect(lightColors.scrim).toBe('rgba(0, 0, 0, 0.7)');

    const sheet = flattenStyle(screen.getByTestId('sheet').props.style);
    expect(sheet.borderTopLeftRadius).toBe(radius.sheet);
    expect(radius.sheet).toBe(24);
    // 02 §12: a 1px border on the top edge, so the sheet reads as its own surface.
    expect(sheet.borderTopWidth).toBe(sizes.hairline);
  });

  it('default tone: grabber, gap 20', async () => {
    await render(
      <BottomSheet visible onClose={jest.fn()} title="Pick one" testID="sheet">
        <Text>Body</Text>
      </BottomSheet>,
    );

    expect(screen.getByTestId('sheet-grabber', HIDDEN)).toBeOnTheScreen();
    expect(screen.queryByTestId('sheet-alert', HIDDEN)).toBeNull();
    expect(flattenStyle(screen.getByTestId('sheet').props.style).gap).toBe(20);
  });

  it('destructive tone: no grabber, an alert header, gap 24 and a 34pt base', async () => {
    // A sheet that deletes something may not look swipe-away-able (02 §12).
    await render(
      <BottomSheet
        visible
        onClose={jest.fn()}
        tone="destructive"
        title="Delete Netflix?"
        testID="sheet"
      >
        <Text>Body</Text>
      </BottomSheet>,
    );

    expect(screen.queryByTestId('sheet-grabber', HIDDEN)).toBeNull();
    expect(screen.getByTestId('sheet-alert', HIDDEN)).toBeOnTheScreen();

    const sheet = flattenStyle(screen.getByTestId('sheet').props.style);
    expect(sheet.gap).toBe(24);
    // 34 plus the inset, not instead of it: the test harness pins bottom to 34.
    expect(sheet.paddingBottom).toBe(sizes.sheetBottomDestructive + 34);
  });

  it('ConfirmSheet: a destructive confirm uses the danger button and needs a choice', async () => {
    const onConfirm = jest.fn();
    const onCancel = jest.fn();
    await render(
      <ConfirmSheet
        visible
        destructive
        title="Delete Netflix?"
        message="This cannot be undone."
        confirmLabel="Delete"
        onConfirm={onConfirm}
        onCancel={onCancel}
        testID="confirm"
      />,
    );

    await fireEvent.press(screen.getByTestId('confirm-backdrop', HIDDEN));
    expect(onCancel).not.toHaveBeenCalled();

    expect(
      flattenStyle(screen.getByTestId('confirm-confirm-surface').props.style)
        .backgroundColor,
    ).toBe(lightColors.danger);
    // And it carries the destructive tone, not just the danger button.
    expect(screen.getByTestId('confirm-alert', HIDDEN)).toBeOnTheScreen();

    await fireEvent.press(screen.getByRole('button', { name: 'Delete' }));
    expect(onConfirm).toHaveBeenCalled();
  });
});

describe('Stepper (02 §16)', () => {
  it('is one adjustable element announcing "Every, 2"', async () => {
    // Two bare buttons would make an assistive user hunt for a 14px glyph.
    await render(<Stepper value={2} onChange={jest.fn()} label="Every" />);

    const control = screen.getByRole('adjustable', { name: 'Every' });
    expect(control.props.accessibilityValue).toEqual({
      now: 2,
      min: STEPPER_MIN,
      max: STEPPER_MAX,
      text: 'Every, 2',
    });
  });

  it('steps up and down', async () => {
    // Controlled: the parent owns the number, so each press is followed by the
    // rerender a real form would do.
    const onChange = jest.fn();
    const { rerender } = await render(
      <Stepper value={2} onChange={onChange} label="Every" testID="step" />,
    );

    await fireEvent.press(screen.getByTestId('step-increment', HIDDEN));
    expect(onChange).toHaveBeenLastCalledWith(3);

    await rerender(<Stepper value={3} onChange={onChange} label="Every" testID="step" />);
    await fireEvent.press(screen.getByTestId('step-decrement', HIDDEN));
    expect(onChange).toHaveBeenLastCalledWith(2);
  });

  it('refuses to cross either bound', async () => {
    const onChange = jest.fn();
    const { rerender } = await render(
      <Stepper value={STEPPER_MIN} onChange={onChange} label="Every" testID="step" />,
    );
    await fireEvent.press(screen.getByTestId('step-decrement', HIDDEN));
    expect(onChange).not.toHaveBeenCalled();

    await rerender(
      <Stepper value={STEPPER_MAX} onChange={onChange} label="Every" testID="step" />,
    );
    await fireEvent.press(screen.getByTestId('step-increment', HIDDEN));
    expect(onChange).not.toHaveBeenCalled();
  });

  it('mutes and disables the side that is at its bound', async () => {
    await render(
      <Stepper value={STEPPER_MIN} onChange={jest.fn()} label="Every" testID="step" />,
    );

    expect(
      screen.getByTestId('step-decrement', HIDDEN).props.accessibilityState?.disabled,
    ).toBe(true);
    expect(
      screen.getByTestId('step-increment', HIDDEN).props.accessibilityState?.disabled,
    ).not.toBe(true);
  });

  it('gives each side a 44pt-tall target, since the glyphs are 14', async () => {
    await render(<Stepper value={2} onChange={jest.fn()} label="Every" testID="step" />);

    // The sides stretch to the control's own height, which is the 44 floor.
    const control = flattenStyle(screen.getByTestId('step').props.style);
    expect(control.height).toBe(sizes.stepperControl);
    expect(
      declaredTouchHeight(screen.getByTestId('step').props.style),
    ).toBeGreaterThanOrEqual(sizes.minTouch);
    expect(
      flattenStyle(screen.getByTestId('step-increment', HIDDEN).props.style).alignSelf,
    ).toBe('stretch');
  });

  it('repeats on a long press, then stops at the bound', async () => {
    jest.useFakeTimers();
    let value = 96;
    const onChange = jest.fn((next: number) => {
      value = next;
    });

    const { rerender } = await render(
      <Stepper value={value} onChange={onChange} label="Every" testID="step" />,
    );

    await fireEvent(screen.getByTestId('step-increment', HIDDEN), 'pressIn');

    // Nothing before the 400ms hold.
    await act(async () => {
      jest.advanceTimersByTime(399);
    });
    expect(onChange).not.toHaveBeenCalled();

    // Then 8 a second, up to 99 and no further.
    await act(async () => {
      jest.advanceTimersByTime(1 + 125 * 6);
    });
    await rerender(
      <Stepper value={value} onChange={onChange} label="Every" testID="step" />,
    );
    expect(value).toBe(STEPPER_MAX);
    expect(onChange).toHaveBeenCalledTimes(3);
  });

  it('cancels the repeat on release, so a released finger stops counting', async () => {
    jest.useFakeTimers();
    const onChange = jest.fn();
    await render(<Stepper value={2} onChange={onChange} label="Every" testID="step" />);

    const plus = screen.getByTestId('step-increment', HIDDEN);
    await fireEvent(plus, 'pressIn');
    await fireEvent(plus, 'pressOut');
    await act(async () => {
      jest.advanceTimersByTime(2000);
    });

    expect(onChange).not.toHaveBeenCalled();
  });
});

describe('SearchField (02 §18)', () => {
  it('is a search input at 44, not the 52 of a form field', async () => {
    await render(
      <SearchField
        value=""
        onChangeText={jest.fn()}
        placeholder="Search currencies"
        testID="search"
      />,
    );

    expect(screen.getByRole('search', { name: 'Search currencies' })).toBeOnTheScreen();
    expect(
      declaredTouchHeight(screen.getByTestId('search-input').parent?.props.style),
    ).toBe(sizes.search);
  });

  it('reports every keystroke, so a local list filters instantly', async () => {
    const onChangeText = jest.fn();
    await render(
      <SearchField
        value=""
        onChangeText={onChangeText}
        placeholder="Search"
        testID="search"
      />,
    );

    await fireEvent.changeText(screen.getByTestId('search-input'), 'net');
    expect(onChangeText).toHaveBeenCalledWith('net');
  });

  it('does not fire the debounced channel on mount', async () => {
    // An empty field costs a server-backed caller a request for nothing.
    jest.useFakeTimers();
    const onSearch = jest.fn();
    await render(
      <SearchField
        value=""
        onChangeText={jest.fn()}
        onSearch={onSearch}
        placeholder="Search"
      />,
    );

    await act(async () => {
      jest.advanceTimersByTime(1000);
    });
    expect(onSearch).not.toHaveBeenCalled();
  });

  it('debounces the server-backed channel by 200ms', async () => {
    jest.useFakeTimers();
    const onSearch = jest.fn();
    const { rerender } = await render(
      <SearchField
        value=""
        onChangeText={jest.fn()}
        onSearch={onSearch}
        placeholder="Search"
      />,
    );

    await rerender(
      <SearchField
        value="n"
        onChangeText={jest.fn()}
        onSearch={onSearch}
        placeholder="Search"
      />,
    );
    await act(async () => {
      jest.advanceTimersByTime(199);
    });
    expect(onSearch).not.toHaveBeenCalled();

    // A keystroke inside the window restarts it rather than firing twice.
    await rerender(
      <SearchField
        value="ne"
        onChangeText={jest.fn()}
        onSearch={onSearch}
        placeholder="Search"
      />,
    );
    await act(async () => {
      jest.advanceTimersByTime(200);
    });
    expect(onSearch).toHaveBeenCalledTimes(1);
    expect(onSearch).toHaveBeenCalledWith('ne');
  });

  it('shows a clear button only when there is something to clear', async () => {
    const onChangeText = jest.fn();
    const onSearch = jest.fn();
    const { rerender } = await render(
      <SearchField
        value=""
        onChangeText={onChangeText}
        onSearch={onSearch}
        placeholder="Search"
        testID="search"
      />,
    );
    expect(screen.queryByTestId('search-clear')).toBeNull();

    await rerender(
      <SearchField
        value="net"
        onChangeText={onChangeText}
        onSearch={onSearch}
        placeholder="Search"
        testID="search"
      />,
    );

    const clear = screen.getByRole('button', { name: 'Clear search' });
    // 16px glyph, 44pt target.
    expect(sizes.iconSmall + clear.props.hitSlop * 2).toBeGreaterThanOrEqual(
      sizes.minTouch,
    );

    await fireEvent.press(clear);
    expect(onChangeText).toHaveBeenCalledWith('');
    // Clearing is immediate: tapping × means "everything back, now".
    expect(onSearch).toHaveBeenCalledWith('');
  });
});

describe('Toast (02 §13)', () => {
  function ShowOnMount({ message }: { message: string }) {
    const toast = useToast();
    return <Text onPress={() => toast.show(message)}>show</Text>;
  }

  it('announces the message and sits above the tab bar and safe area', async () => {
    const announce = jest.spyOn(AccessibilityInfo, 'announceForAccessibility');
    await render(<ShowOnMount message="Subscription saved" />);

    await fireEvent.press(screen.getByText('show'));

    expect(screen.getByText('Subscription saved')).toBeOnTheScreen();
    expect(announce).toHaveBeenCalledWith('Subscription saved');
    const style = flattenStyle(screen.getByTestId('toast').props.style);
    // The render helper's bottom inset is 34.
    expect(Number(style.bottom)).toBeGreaterThanOrEqual(34 + sizes.tabBar);
    expect(screen.getByTestId('toast').props.accessibilityRole).toBe('alert');
  });

  it('goes away by itself after 3 seconds', async () => {
    jest.useFakeTimers();
    await render(<ShowOnMount message="Saved" />);
    await fireEvent.press(screen.getByText('show'));
    expect(screen.getByText('Saved')).toBeOnTheScreen();

    await act(async () => {
      jest.advanceTimersByTime(motion.toastHold + motion.toast + 50);
    });

    expect(screen.queryByText('Saved')).toBeNull();
  });
});

describe('Skeleton (02 §14)', () => {
  it('pulses normally', async () => {
    const loop = jest.spyOn(Animated, 'loop');
    await render(<Skeleton />);

    expect(loop).toHaveBeenCalled();
  });

  it('renders static at 60% under reduced motion', async () => {
    const loop = jest.spyOn(Animated, 'loop');
    await render(<Skeleton testID="s" />, { reduceMotion: true });

    expect(loop).not.toHaveBeenCalled();
    const style = flattenStyle(screen.getByTestId('s', HIDDEN).props.style);
    expect(Number(style.opacity)).toBe(opacity.skeletonStatic);
  });
});
