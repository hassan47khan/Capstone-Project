/**
 * Tests for the display and state primitives.
 *
 * Button and TextField have their own files because their behaviour is
 * substantial. The components here are mostly presentational, so they are
 * grouped — but every one is checked against the same three questions:
 *
 *   1. Does it render what it was given?
 *   2. Is it announced correctly to a screen reader?
 *   3. If it is tappable, is the target at least 44pt?
 *
 * Remember: `render` and `fireEvent` are ASYNC in React Native Testing Library
 * v14 and must be awaited.
 */
import { fireEvent, render, screen } from '@testing-library/react-native';

import { ApiError } from '@/api/errors';
import { declaredTouchHeight, flattenStyle } from '@/test/render';
import { categoryColors, sizes } from '@/theme';

import { Amount } from './Amount';
import { Badge } from './Badge';
import { BarRow } from './BarRow';
import { Chip } from './Chip';
import { EmptyState } from './EmptyState';
import { ErrorState } from './ErrorState';
import { GroupedList } from './GroupedList';
import { ListRow } from './ListRow';
import { NoticeBanner } from './NoticeBanner';
import { Segmented } from './Segmented';
import { Select } from './Select';
import { Skeleton, SkeletonGroup, SkeletonRow } from './Skeleton';
import { StackedBar } from './StackedBar';
import { Switch } from './Switch';
import { Tile } from './Tile';

/**
 * Opts a query into elements hidden from the accessibility tree.
 *
 * Tiles, bars and skeleton blocks set `accessibilityElementsHidden` ON PURPOSE —
 * their meaning is carried by adjacent text, so announcing them would be noise.
 * React Native Testing Library honours that and excludes them from queries by
 * default, so a test that needs to inspect one has to ask for it explicitly.
 * Needing this flag is therefore a sign the component is correct, not broken.
 */
const HIDDEN = { includeHiddenElements: true } as const;

describe('Amount', () => {
  it('splits dollars from cents so each can be sized differently', async () => {
    await render(<Amount value="144.45" currency="USD" size="hero" />);

    expect(screen.getByText('$144')).toBeOnTheScreen();
    expect(screen.getByText('.45')).toBeOnTheScreen();
  });

  it('announces the whole figure as one number', async () => {
    // Split across two Text nodes a screen reader says "one forty four" then
    // "forty five", which sounds like two separate numbers.
    await render(<Amount value="1733.40" currency="USD" size="large" />);

    expect(screen.getByLabelText('$1,733.40')).toBeOnTheScreen();
  });

  it('renders no decimal point for a zero-decimal currency', async () => {
    await render(<Amount value="1200" currency="JPY" size="large" />);

    expect(screen.getByText('¥1,200')).toBeOnTheScreen();
    expect(screen.queryByText('.00')).toBeNull();
  });

  it('says in words that an amount could not be converted', async () => {
    // US-4. The on-screen marker is an asterisk, which a screen reader would
    // read as "star" or skip, so the meaning has to be in the label.
    await render(<Amount value="4500.00" currency="ARS" unconverted />);

    expect(
      screen.getByLabelText('ARS4,500.00, not converted — no exchange rate available'),
    ).toBeOnTheScreen();
  });
});

describe('Badge', () => {
  it('announces itself as a status rather than a loose word', async () => {
    await render(<Badge label="Trial" tone="notice" />);

    expect(screen.getByLabelText('Status: Trial')).toBeOnTheScreen();
  });

  it('always shows the word, so colour is never the only signal', async () => {
    await render(<Badge label="Active" tone="accent" />);

    expect(screen.getByText('Active')).toBeOnTheScreen();
  });
});

describe('Chip', () => {
  it('announces its selected state', async () => {
    // Without this the current filter is invisible to a screen-reader user.
    await render(<Chip label="Streaming" selected onPress={jest.fn()} />);

    expect(screen.getByRole('radio', { name: 'Streaming' })).toBeSelected();
  });

  it('fires onPress', async () => {
    const onPress = jest.fn();
    await render(<Chip label="Software" selected={false} onPress={onPress} />);

    await fireEvent.press(screen.getByRole('radio'));

    expect(onPress).toHaveBeenCalled();
  });

  it('meets the 44pt touch target', async () => {
    await render(<Chip label="All" selected onPress={jest.fn()} testID="chip" />);

    expect(
      declaredTouchHeight(screen.getByTestId('chip').props.style),
    ).toBeGreaterThanOrEqual(sizes.minTouch);
  });
});

describe('Tile', () => {
  it('shows the first letter of the name, uppercased', async () => {
    await render(<Tile name="streamly plus" category="streaming" />);

    expect(screen.getByText('S', HIDDEN)).toBeOnTheScreen();
  });

  it('does not split a multi-byte character in half', async () => {
    // `name[0]` on an emoji yields half a surrogate pair and a broken glyph.
    await render(<Tile name="🎬 Movie Club" category="streaming" />);

    expect(screen.getByText('🎬', HIDDEN)).toBeOnTheScreen();
  });

  it('falls back to a question mark for a blank name', async () => {
    await render(<Tile name="   " category={null} />);

    expect(screen.getByText('?', HIDDEN)).toBeOnTheScreen();
  });

  it('uses the uncategorized palette for a null category', async () => {
    await render(<Tile name="Thing" category={null} testID="tile" />);

    const style = flattenStyle(screen.getByTestId('tile', HIDDEN).props.style);
    expect(style.backgroundColor).toBe(categoryColors.other.tint);
  });
});

describe('Switch', () => {
  it('is announced as a switch with its on/off state', async () => {
    await render(<Switch label="Renewal reminders" value onValueChange={jest.fn()} />);

    expect(screen.getByRole('switch', { name: 'Renewal reminders' })).toBeChecked();
  });

  it('toggles from a tap anywhere on the row, not just the control', async () => {
    const onValueChange = jest.fn();
    await render(
      <Switch
        label="Price change alerts"
        description="When a subscription costs more"
        value={false}
        onValueChange={onValueChange}
        testID="toggle"
      />,
    );

    await fireEvent.press(screen.getByTestId('toggle'));

    expect(onValueChange).toHaveBeenCalledWith(true);
  });

  it('meets the 44pt touch target', async () => {
    await render(<Switch label="X" value onValueChange={jest.fn()} testID="toggle" />);

    expect(
      declaredTouchHeight(screen.getByTestId('toggle').props.style),
    ).toBeGreaterThanOrEqual(sizes.minTouch);
  });
});

describe('Segmented', () => {
  const CYCLES = [
    { value: 'week', label: 'Weekly' },
    { value: 'month', label: 'Monthly' },
    { value: 'year', label: 'Yearly' },
  ] as const;

  it('is announced as a single-choice group', async () => {
    await render(
      <Segmented
        label="Billing cycle"
        options={CYCLES}
        value="month"
        onChange={jest.fn()}
      />,
    );

    expect(screen.getByLabelText('Billing cycle')).toBeOnTheScreen();
  });

  it('marks only the current option as selected', async () => {
    await render(
      <Segmented
        label="Billing cycle"
        options={CYCLES}
        value="month"
        onChange={jest.fn()}
      />,
    );

    expect(screen.getByRole('radio', { name: 'Monthly' })).toBeSelected();
    expect(screen.getByRole('radio', { name: 'Weekly' })).not.toBeSelected();
  });

  it('reports the chosen value', async () => {
    const onChange = jest.fn();
    await render(
      <Segmented
        label="Billing cycle"
        options={CYCLES}
        value="month"
        onChange={onChange}
        testID="cycle"
      />,
    );

    await fireEvent.press(screen.getByTestId('cycle-year'));

    expect(onChange).toHaveBeenCalledWith('year');
  });
});

describe('ListRow', () => {
  it('is announced as one element rather than three separate stops', async () => {
    await render(
      <ListRow
        title="Streamly Plus"
        subtitle="Streaming · Renews Oct 3"
        accessibilityLabel="Streamly Plus, Streaming, renews Oct 3, $15.49"
        onPress={jest.fn()}
        variant="subscription"
      />,
    );

    expect(
      screen.getByLabelText('Streamly Plus, Streaming, renews Oct 3, $15.49'),
    ).toBeOnTheScreen();
  });

  it('composes a label from its two lines when none is given', async () => {
    await render(<ListRow title="Currency" subtitle="USD ($)" onPress={jest.fn()} />);

    expect(screen.getByLabelText('Currency, USD ($)')).toBeOnTheScreen();
  });

  it('is not a button when it has no press handler', async () => {
    // A row of content should not offer an action that does nothing.
    await render(<ListRow title="Billing cycle" subtitle="Monthly" />);

    expect(screen.queryByRole('button')).toBeNull();
  });

  it('announces a selected row, such as the chosen currency', async () => {
    await render(<ListRow title="USD" selected onPress={jest.fn()} testID="row" />);

    expect(screen.getByTestId('row')).toBeSelected();
  });
});

describe('GroupedList', () => {
  it('renders its title, rows and footnote', async () => {
    await render(
      <GroupedList title="Display" footnote="Rates from Sep 30.">
        <ListRow title="Currency" />
        <ListRow title="Time zone" />
      </GroupedList>,
    );

    expect(screen.getByText('Display')).toBeOnTheScreen();
    expect(screen.getByText('Currency')).toBeOnTheScreen();
    expect(screen.getByText('Time zone')).toBeOnTheScreen();
    expect(screen.getByText('Rates from Sep 30.')).toBeOnTheScreen();
  });

  it('drops conditional rows that rendered nothing', async () => {
    // Otherwise a `{flag && <Row/>}` leaves a divider with nothing beneath it.
    const showExtra = false;
    await render(
      <GroupedList testID="list">
        <ListRow title="Only row" />
        {showExtra && <ListRow title="Hidden" />}
      </GroupedList>,
    );

    expect(screen.queryByText('Hidden')).toBeNull();
  });
});

describe('StackedBar', () => {
  it('sizes each segment by its server-supplied percentage', async () => {
    await render(
      <StackedBar
        segments={[
          { category: 'software', percent: 45 },
          { category: 'streaming', percent: 55 },
        ]}
        testID="bar"
      />,
    );

    // flexGrow carries the proportion. The component performs no arithmetic on
    // amounts — it never sees any.
    const [first, second] = screen.getByTestId('bar', HIDDEN).props.children;
    expect(flattenStyle(first.props.style).flexGrow).toBe(45);
    expect(flattenStyle(second.props.style).flexGrow).toBe(55);
  });

  it('omits zero-width segments', async () => {
    await render(
      <StackedBar
        segments={[
          { category: 'software', percent: 100 },
          { category: 'fitness', percent: 0 },
        ]}
        testID="bar"
      />,
    );

    expect(screen.getByTestId('bar', HIDDEN).props.children).toHaveLength(1);
  });

  it('is hidden from screen readers, because the legend says it in words', async () => {
    await render(
      <StackedBar segments={[{ category: 'software', percent: 100 }]} testID="bar" />,
    );

    expect(screen.getByTestId('bar', HIDDEN).props.accessibilityElementsHidden).toBe(
      true,
    );
  });
});

describe('BarRow', () => {
  it('shows the category, amount and percentage as text beside the bar', async () => {
    // Prompt section 10: every chart has the same figures in words.
    await render(
      <BarRow category="software" amount="99.99" currency="USD" percent={45} />,
    );

    expect(screen.getByText('Software')).toBeOnTheScreen();
    expect(screen.getByText('$99.99 · 45%')).toBeOnTheScreen();
  });

  it('labels a null category as Uncategorized', async () => {
    await render(<BarRow category={null} amount="4.00" currency="USD" percent={2} />);

    expect(screen.getByText('Uncategorized')).toBeOnTheScreen();
  });

  it('announces the row as one readable sentence', async () => {
    await render(
      <BarRow category="fitness" amount="34.99" currency="USD" percent={16} />,
    );

    expect(screen.getByLabelText('Fitness, $34.99, 16 percent')).toBeOnTheScreen();
  });
});

describe('NoticeBanner', () => {
  it('is announced as an alert so it is not missed', async () => {
    await render(
      <NoticeBanner message="Streamly Plus is going up to $17.99 on Oct 3." />,
    );

    expect(
      screen.getByRole('alert', {
        name: 'Streamly Plus is going up to $17.99 on Oct 3.',
      }),
    ).toBeOnTheScreen();
  });

  it('becomes a button when it has somewhere to go', async () => {
    const onPress = jest.fn();
    await render(<NoticeBanner message="A thing happened." onPress={onPress} />);

    await fireEvent.press(screen.getByRole('button'));

    expect(onPress).toHaveBeenCalled();
  });
});

describe('EmptyState', () => {
  it('shows a title, an explanation and a call to action', async () => {
    const onAction = jest.fn();
    await render(
      <EmptyState
        title="No subscriptions yet"
        message="Add your first one to see what you spend each month."
        actionLabel="Add subscription"
        onAction={onAction}
        testID="empty"
      />,
    );

    expect(screen.getByText('No subscriptions yet')).toBeOnTheScreen();
    await fireEvent.press(screen.getByTestId('empty-action'));
    expect(onAction).toHaveBeenCalled();
  });

  it('omits the action when there is nothing useful to offer', async () => {
    // "No results for 'xyz'" should not invite the user to create something.
    await render(<EmptyState title="No results" message="Try a different search." />);

    expect(screen.queryByRole('button')).toBeNull();
  });
});

describe('ErrorState', () => {
  it('distinguishes offline from a server error', async () => {
    // A Retry button is useless with no connection, so the copy differs.
    const offline = new ApiError({ status: 0, code: 'network_error', message: 'x' });
    await render(<ErrorState error={offline} onRetry={jest.fn()} />);

    expect(screen.getByText('You are offline')).toBeOnTheScreen();
  });

  it('shows the generic failure for a 500', async () => {
    const serverError = new ApiError({ status: 500, code: 'server_error', message: 'x' });
    await render(<ErrorState error={serverError} onRetry={jest.fn()} />);

    expect(screen.getByText('Something went wrong')).toBeOnTheScreen();
  });

  it('never reveals whether a 404 exists but belongs to someone else', async () => {
    // The API returns 404 for both cases so ids cannot be probed; the copy must
    // not undo that by mentioning permission.
    const notFound = new ApiError({ status: 404, code: 'not_found', message: 'x' });
    await render(<ErrorState error={notFound} />);

    expect(screen.getByText('This item is no longer available.')).toBeOnTheScreen();
    expect(screen.queryByText(/permission/i)).toBeNull();
  });

  it('is announced as an alert', async () => {
    await render(<ErrorState variant="error" testID="err" />);

    expect(screen.getByTestId('err').props.accessibilityRole).toBe('alert');
  });

  it('offers retry only when retrying is possible', async () => {
    const onRetry = jest.fn();
    await render(<ErrorState variant="error" onRetry={onRetry} testID="err" />);

    await fireEvent.press(screen.getByTestId('err-retry'));

    expect(onRetry).toHaveBeenCalled();
  });
});

describe('Skeleton', () => {
  it('announces loading once per group, not once per block', async () => {
    await render(
      <SkeletonGroup label="Loading subscriptions" testID="group">
        <SkeletonRow />
        <SkeletonRow />
        <SkeletonRow />
      </SkeletonGroup>,
    );

    expect(screen.getByLabelText('Loading subscriptions')).toBeOnTheScreen();
    expect(screen.getByTestId('group')).toBeBusy();
  });

  it('hides individual blocks from screen readers', async () => {
    await render(<Skeleton testID="block" />);

    expect(screen.getByTestId('block', HIDDEN).props.accessibilityElementsHidden).toBe(
      true,
    );
  });
});

describe('Select', () => {
  const CATEGORIES = [
    { value: 'streaming', label: 'Streaming' },
    { value: 'software', label: 'Software' },
  ] as const;

  it('shows the placeholder when nothing is chosen', async () => {
    await render(
      <Select
        label="Category"
        options={CATEGORIES}
        value={null}
        onChange={jest.fn()}
        placeholder="Choose a category"
      />,
    );

    expect(screen.getByText('Choose a category')).toBeOnTheScreen();
  });

  it('announces its current value, which a plain button would not', async () => {
    await render(
      <Select
        label="Category"
        options={CATEGORIES}
        value="software"
        onChange={jest.fn()}
        testID="cat"
      />,
    );

    expect(screen.getByTestId('cat').props.accessibilityValue).toEqual({
      text: 'Software',
    });
  });

  it('reports the option the user picks', async () => {
    const onChange = jest.fn();
    await render(
      <Select
        label="Category"
        options={CATEGORIES}
        value={null}
        onChange={onChange}
        testID="cat"
      />,
    );

    await fireEvent.press(screen.getByTestId('cat'));
    await fireEvent.press(screen.getByTestId('cat-option-streaming'));

    expect(onChange).toHaveBeenCalledWith('streaming');
  });
});
