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
import { flattenStyle } from '@/test/render';
import {
  darkCategoryColors,
  darkServicePalette,
  lightCategoryColors,
  lightColors,
  radius,
  serviceTint,
  sizes,
  ThemeProvider,
} from '@/theme';

import { AlertCard } from './AlertCard';
import { Amount } from './Amount';
import { Badge } from './Badge';
import { BarRow } from './BarRow';
import { EmptyState } from './EmptyState';
import { ErrorState } from './ErrorState';
import { FilterChip } from './FilterChip';
import { ServiceMark } from './ServiceMark';
import { Skeleton, SkeletonGroup, SkeletonRow } from './Skeleton';
import { StackedBar } from './StackedBar';

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
    await render(<Badge label="Trial" tone="warning" />);

    expect(screen.getByLabelText('Status: Trial')).toBeOnTheScreen();
  });

  it('always shows the word, so colour is never the only signal', async () => {
    await render(<Badge label="Active" tone="success" />);

    expect(screen.getByText('Active')).toBeOnTheScreen();
  });

  it('is Bold 12 at the type floor, never a pill (02 §19)', async () => {
    // The prototype's 10px count badge is raised to 01 §4's 12pt floor.
    await render(<Badge label="12 active" tone="success" testID="badge" />);

    const label = flattenStyle(screen.getByText('12 active').props.style);
    expect(label.fontSize).toBe(12);
    expect(label.fontFamily).toBe('DMSans_700Bold');
    expect(flattenStyle(screen.getByTestId('badge').props.style).borderRadius).toBe(
      radius.badge,
    );
  });

  it.each([
    ['success', 'successSurface', 'success'],
    ['neutral', 'surface2', 'text'],
    ['warning', 'warningSurface', 'text'],
  ] as const)('tone %s pairs its measured fill and text', async (tone, fill, text) => {
    // `neutral` and `warning` take `text`, not `textMuted`: muted grey is
    // 4.28:1 on surface2 and 4.22:1 on the warning tint — both AA failures.
    await render(<Badge label="State" tone={tone} testID="badge" />);

    expect(flattenStyle(screen.getByTestId('badge').props.style).backgroundColor).toBe(
      lightColors[fill],
    );
    expect(flattenStyle(screen.getByText('State').props.style).color).toBe(
      lightColors[text],
    );
  });
});

describe('FilterChip (02 §17)', () => {
  it('announces its selected state', async () => {
    // Without this the current filter is invisible to a screen-reader user.
    await render(<FilterChip label="Streaming" selected onPress={jest.fn()} />);

    expect(screen.getByRole('radio', { name: 'Streaming' })).toBeSelected();
  });

  it('fires onPress', async () => {
    const onPress = jest.fn();
    await render(<FilterChip label="Software" selected={false} onPress={onPress} />);

    await fireEvent.press(screen.getByRole('radio'));

    expect(onPress).toHaveBeenCalled();
  });

  it('draws at 28 and reaches 44 through hitSlop', async () => {
    // 02 §17 measures 28. Growing the box would make a filter row read as a
    // row of buttons, so the slop — not the height — carries the touch floor.
    await render(<FilterChip label="All" selected onPress={jest.fn()} testID="chip" />);

    const chip = screen.getByTestId('chip');
    expect(flattenStyle(chip.props.style).height).toBe(sizes.chipVisual);

    const { top, bottom } = chip.props.hitSlop;
    expect(sizes.chipVisual + top + bottom).toBeGreaterThanOrEqual(sizes.minTouch);
  });
});

describe('ServiceMark (02 §21)', () => {
  it('shows the first letter of the name, uppercased', async () => {
    await render(<ServiceMark name="streamly plus" />);

    expect(screen.getByText('S', HIDDEN)).toBeOnTheScreen();
  });

  it('does not split a multi-byte character in half', async () => {
    // `name[0]` on an emoji yields half a surrogate pair and a broken glyph.
    await render(<ServiceMark name="🎬 Movie Club" />);

    expect(screen.getByText('🎬', HIDDEN)).toBeOnTheScreen();
  });

  it('falls back to a question mark for a blank name', async () => {
    await render(<ServiceMark name="   " />);

    expect(screen.getByText('?', HIDDEN)).toBeOnTheScreen();
  });

  it('uses the catalog brand colours when given them', async () => {
    // 01 §3: service logos use brand colour, observed on Netflix.
    await render(
      <ServiceMark
        name="Netflix"
        brand={{ tint: '#ffecee', ink: '#e50914' }}
        testID="tile"
      />,
    );

    const style = flattenStyle(screen.getByTestId('tile', HIDDEN).props.style);
    expect(style.backgroundColor).toBe('#ffecee');
  });

  it('derives the same tint from the same name every time', async () => {
    // A user-entered service has no brand entry. Random would make the row
    // change colour between launches.
    await render(<ServiceMark name="Northside Gym" testID="tile" />);

    const style = flattenStyle(screen.getByTestId('tile', HIDDEN).props.style);
    expect(style.backgroundColor).toBe(serviceTint('Northside Gym').tint);
    expect(serviceTint(' northside gym ')).toEqual(serviceTint('Northside Gym'));
  });

  it('switches to the dark service palette in the dark theme', async () => {
    await render(
      <ThemeProvider initialPreference="dark">
        <ServiceMark name="Northside Gym" testID="tile" />
      </ThemeProvider>,
    );

    const style = flattenStyle(screen.getByTestId('tile', HIDDEN).props.style);
    expect(style.backgroundColor).toBe(
      serviceTint('Northside Gym', darkServicePalette).tint,
    );
  });

  it('prefers the catalog mark over the initial, at up to two characters', async () => {
    // 02 §21: "iC" for iCloud, not "I".
    await render(<ServiceMark name="iCloud+" mark="iC" />);

    expect(screen.getByText('iC', HIDDEN)).toBeOnTheScreen();
  });

  // 02 §21: radius is always half the diameter and the mark always 0.375 of it,
  // so adding a size needs no new measurement.
  it.each([
    ['compact', sizes.markCompact],
    ['row', sizes.mark],
    ['medium', sizes.markMedium],
    ['large', sizes.markLarge],
  ] as const)('is a circle with a 0.375 mark at %s', async (size, diameter) => {
    await render(<ServiceMark name="Netflix" size={size} testID="mark" />);

    const style = flattenStyle(screen.getByTestId('mark', HIDDEN).props.style);
    expect(style.width).toBe(diameter);
    expect(style.height).toBe(diameter);
    expect(style.borderRadius).toBe(diameter / 2);

    const letter = flattenStyle(screen.getByText('N', HIDDEN).props.style);
    expect(letter.fontSize).toBe(diameter * 0.375);
  });

  it('is a 28pt rounded square when square, whatever size is asked for', async () => {
    // 02 §21 draws the square at one size only, on Member detail (10 §3.4).
    await render(
      <ServiceMark name="Netflix" shape="square" size="large" testID="mark" />,
    );

    const style = flattenStyle(screen.getByTestId('mark', HIDDEN).props.style);
    expect(style.width).toBe(sizes.markSquare);
    expect(style.borderRadius).toBe(radius.card);
  });
});

describe('StackedBar', () => {
  it('sizes each segment by its server-supplied percentage', async () => {
    await render(
      <StackedBar
        segments={[
          { category: 'productivity', percent: 45 },
          { category: 'entertainment', percent: 55 },
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

  it('colours each segment by its category token, per theme', async () => {
    const segments = [{ category: 'ai-tools', percent: 100 }] as const;

    await render(<StackedBar segments={segments} testID="bar" />);
    const [light] = screen.getByTestId('bar', HIDDEN).props.children;
    expect(flattenStyle(light.props.style).backgroundColor).toBe(
      lightCategoryColors.aiTools,
    );

    await render(
      <ThemeProvider initialPreference="dark">
        <StackedBar segments={segments} testID="bar" />
      </ThemeProvider>,
    );
    const [dark] = screen.getByTestId('bar', HIDDEN).props.children;
    expect(flattenStyle(dark.props.style).backgroundColor).toBe(
      darkCategoryColors.aiTools,
    );
  });

  it('omits zero-width segments', async () => {
    await render(
      <StackedBar
        segments={[
          { category: 'productivity', percent: 100 },
          { category: 'health-wellness', percent: 0 },
        ]}
        testID="bar"
      />,
    );

    expect(screen.getByTestId('bar', HIDDEN).props.children).toHaveLength(1);
  });

  it('is hidden from screen readers, because the legend says it in words', async () => {
    await render(
      <StackedBar segments={[{ category: 'productivity', percent: 100 }]} testID="bar" />,
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
      <BarRow category="productivity" amount="69.99" currency="USD" percent={32} />,
    );

    expect(screen.getByText('Productivity')).toBeOnTheScreen();
    expect(screen.getByText('$69.99 · 32%')).toBeOnTheScreen();
  });

  it('labels a null category as Uncategorized', async () => {
    await render(<BarRow category={null} amount="4.00" currency="USD" percent={2} />);

    expect(screen.getByText('Uncategorized')).toBeOnTheScreen();
  });

  it('announces the row as one readable sentence', async () => {
    await render(
      <BarRow category="health-wellness" amount="34.99" currency="USD" percent={16} />,
    );

    expect(
      screen.getByLabelText('Health & Wellness, $34.99, 16 percent'),
    ).toBeOnTheScreen();
  });
});

describe('AlertCard (02 §20)', () => {
  it('is announced as an alert so it is not missed', async () => {
    await render(<AlertCard message="Streamly Plus is going up to $17.99 on Oct 3." />);

    expect(
      screen.getByRole('alert', {
        name: 'Streamly Plus is going up to $17.99 on Oct 3.',
      }),
    ).toBeOnTheScreen();
  });

  it('becomes a button when it has somewhere to go', async () => {
    const onPress = jest.fn();
    await render(<AlertCard message="A thing happened." onPress={onPress} />);

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
