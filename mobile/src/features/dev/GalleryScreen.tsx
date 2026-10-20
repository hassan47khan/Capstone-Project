/**
 * Component gallery — every shared component in every state (handoff 02 §16).
 *
 * What it is for
 *   Checking the library by eye on a real phone: both themes (switch at the
 *   top), every variant and state, and the animations. Development builds only
 *   — the route is registered under `__DEV__`, so it does not exist in a release.
 *
 * How to check reduced motion
 *   Turn on Reduce Motion in the OS accessibility settings and come back: the
 *   button press, sheet, toast, skeleton and toggle animations all change
 *   (02 §15). The live flag is shown at the top.
 *
 * Deviations from handoff 02 visible here (each explained in its component):
 *   - Field and secondary-button outlines use `borderControl`, not `border`
 *     (1.51:1 fails WCAG 1.4.11).
 *   - SectionHeader is Bold 12, not 02's first 11px SemiBold (01's 12pt floor).
 *   - FilterChip is a `radio`, not a `button`: the row is single-choice.
 *   - Badge `neutral`/`warning` text is `text`, not `textMuted` (both fail AA).
 *   - Unselected segments use `text`, not `textMuted` (muted on surface2 is 4.28:1).
 *   - Toast follows the Figma symbol (radius 6, 18px icon, SemiBold 15).
 *   - CurrencyField emits a decimal string, never minor units (no client money math).
 *   - DateField shows "Oct 12, 2026" until `date_format` exists (09).
 */
import { useNavigation } from '@react-navigation/native';
import { Inbox } from 'lucide-react-native';
import { useState, type ReactNode } from 'react';
import { Text, View } from 'react-native';

import {
  AlertCard,
  Amount,
  Badge,
  BarRow,
  BillingCycleField,
  BottomSheet,
  Button,
  Card,
  CategoryBadge,
  ConfirmSheet,
  CurrencyField,
  DateField,
  EmptyState,
  ErrorState,
  FilterChip,
  GroupedList,
  Header,
  invalidPriceMessage,
  isValidPrice,
  ListRow,
  Screen,
  SearchField,
  SectionHeader,
  SegmentedControl,
  Select,
  ServiceMark,
  SettingsRow,
  Skeleton,
  SkeletonGroup,
  SkeletonRow,
  StackedBar,
  Stepper,
  TextField,
  Toggle,
  useToast,
  type BadgeTone,
  type BillingCycleOption,
  type ButtonVariant,
  type ServiceMarkSize,
} from '@/components';
import {
  CATEGORY_LABELS,
  CATEGORY_SLUGS,
  makeStyles,
  spacing,
  useTheme,
  type Category,
  type ThemePreference,
} from '@/theme';

const VARIANTS: readonly ButtonVariant[] = [
  'primary',
  'secondary',
  'destructive',
  'ghost',
];

const BADGE_TONES: readonly BadgeTone[] = ['success', 'neutral', 'warning'];

const MARK_SIZES: readonly ServiceMarkSize[] = ['compact', 'row', 'medium', 'large'];

const FILTERS = ['All', 'Entertainment', 'Productivity', 'Utilities'] as const;

function Section({ title, children }: { title: string; children: ReactNode }) {
  const styles = useStyles();
  return (
    <View style={styles.section}>
      <SectionHeader title={title} />
      {children}
    </View>
  );
}

export function GalleryScreen() {
  const styles = useStyles();
  const navigation = useNavigation();
  const { preference, setPreference, reduceMotion, categoryColors } = useTheme();
  const toast = useToast();

  const [name, setName] = useState('');
  const [password, setPassword] = useState('');
  const [price, setPrice] = useState('15.49');
  const [cycle, setCycle] = useState<BillingCycleOption>('monthly');
  const [period, setPeriod] = useState<'monthly' | 'annual'>('monthly');
  const [category, setCategory] = useState<Category | null>(null);
  const [date, setDate] = useState<string | null>('2026-10-12');
  const [reminders, setReminders] = useState(true);
  const [leadDays, setLeadDays] = useState(3);
  const [sheet, setSheet] = useState(false);
  const [confirm, setConfirm] = useState<'plain' | 'destructive' | null>(null);
  const [filter, setFilter] = useState<string>('All');
  const [search, setSearch] = useState('');
  const [every, setEvery] = useState(2);

  return (
    <Screen scroll edges={['top', 'bottom']}>
      <Header title="Component gallery" backLabel="Settings" onBack={navigation.goBack} />

      <Section title="Theme">
        <SegmentedControl<ThemePreference>
          label="Theme"
          options={[
            { value: 'light', label: 'Light' },
            { value: 'dark', label: 'Dark' },
            { value: 'system', label: 'System' },
          ]}
          value={preference}
          onChange={setPreference}
        />
        <Text style={styles.note}>
          Reduce Motion is {reduceMotion ? 'on' : 'off'} (set it in the OS).
        </Text>
      </Section>

      <Section title="Button">
        {VARIANTS.map((variant) => (
          <View key={variant} style={styles.row}>
            <Button
              label={variant}
              variant={variant}
              onPress={() => {}}
              style={styles.grow}
            />
            <Button
              label="Disabled"
              variant={variant}
              disabled
              onPress={() => {}}
              style={styles.grow}
            />
            <Button
              label="Save"
              loadingLabel="Saving"
              variant={variant}
              loading
              onPress={() => {}}
              style={styles.grow}
            />
          </View>
        ))}
      </Section>

      <Section title="TextField">
        <TextField
          label="Name"
          value={name}
          onChangeText={setName}
          placeholder="e.g. Netflix"
          helper="Tap to see the focus ring."
        />
        <TextField
          label="Email"
          value="not-an-email"
          onChangeText={() => {}}
          error="Enter a valid email address."
        />
        <TextField
          label="Disabled"
          value="Read only"
          onChangeText={() => {}}
          editable={false}
        />
        <TextField
          label="Password"
          value={password}
          onChangeText={setPassword}
          secureTextEntry
        />
      </Section>

      <Section title="CurrencyField">
        <CurrencyField
          value={price}
          onChangeValue={setPrice}
          currency="USD"
          error={price && !isValidPrice(price) ? invalidPriceMessage('USD') : undefined}
        />
        <CurrencyField
          label="Price (EUR)"
          value="9,99"
          onChangeValue={() => {}}
          currency="EUR"
        />
        <CurrencyField
          label="Price (JPY)"
          value="1200"
          onChangeValue={() => {}}
          currency="JPY"
        />
        <CurrencyField
          label="Invalid"
          value="0"
          onChangeValue={() => {}}
          currency="GBP"
          error={invalidPriceMessage('GBP')}
        />
      </Section>

      <Section title="SegmentedControl">
        <BillingCycleField value={cycle} onChange={setCycle} />
        <SegmentedControl
          label="Period"
          options={[
            { value: 'monthly', label: 'Monthly' },
            { value: 'annual', label: 'Annual' },
          ]}
          value={period}
          onChange={setPeriod}
        />
      </Section>

      <Section title="Select">
        <Select
          label="Category"
          options={CATEGORY_SLUGS.map((slug) => ({
            value: slug,
            label: CATEGORY_LABELS[slug],
          }))}
          value={category}
          onChange={setCategory}
          placeholder="Choose a category"
          renderOption={(option) => <CategoryBadge category={option.value} />}
        />
        <Select
          label="With error"
          options={[{ value: 'a', label: 'Option A' }]}
          value={null}
          onChange={() => {}}
          error="Choose an option."
        />
        <Select
          label="Disabled"
          options={[{ value: 'a', label: 'Option A' }]}
          value="a"
          onChange={() => {}}
          disabled
        />
      </Section>

      <Section title="DateField">
        <DateField label="Next bill" value={date} onChange={setDate} />
        <DateField label="Start date" value={null} onChange={() => {}} />
        <DateField
          label="With error"
          value={null}
          onChange={() => {}}
          error="Choose a date."
        />
        <DateField label="Disabled" value="2026-01-01" onChange={() => {}} disabled />
      </Section>

      <Section title="SettingsRow + Toggle">
        <GroupedList title="Notifications">
          <SettingsRow
            variant="toggle"
            label="Billing reminders"
            value={reminders}
            onValueChange={setReminders}
          />
          <SettingsRow
            variant="toggle"
            label="Disabled toggle"
            value={false}
            onValueChange={() => {}}
            disabled
          />
          <SettingsRow
            variant="stepper"
            label="Remind me"
            value={leadDays}
            onValueChange={setLeadDays}
            min={1}
            max={14}
            format={(n) => `${n} days before`}
          />
          <SettingsRow label="Currency" value="USD" onPress={() => {}} />
          <SettingsRow variant="destructive" label="Sign out" onPress={() => {}} />
        </GroupedList>
      </Section>

      <Section title="Card">
        <Card>
          <Text style={styles.cardTitle}>Monthly total</Text>
          <Text style={styles.note}>A card has a border, never a shadow.</Text>
        </Card>
      </Section>

      <Section title="ListRow">
        <ListRow
          name="Netflix"
          price="15.49"
          currency="USD"
          cycle={{ unit: 'month', count: 1 }}
          nextBillOn="2026-10-12"
          onPress={() => {}}
        />
        <ListRow
          name="A service with a name long enough to need truncating"
          price="1234.56"
          currency="EUR"
          cycle={{ unit: 'year', count: 1 }}
          nextBillOn="2027-01-03"
          onPress={() => {}}
        />
        <ListRow
          name="Headspace"
          price="12.99"
          currency="USD"
          cycle={{ unit: 'month', count: 2 }}
          nextBillOn="2026-12-15"
          cancelled
          onPress={() => {}}
        />
      </Section>

      <Section title="ListRow - compact (02 S9)">
        <Text style={styles.note}>
          Home&apos;s upcoming renewals: 36pt mark, relative date, amount in text rather
          than accent.
        </Text>
        <ListRow
          name="Netflix"
          price="15.49"
          currency="USD"
          cycle={{ unit: 'month', count: 1 }}
          nextBillOn="2026-10-21"
          compact
          today="2026-10-19"
          onPress={() => {}}
        />
        <ListRow
          name="iCloud+"
          mark="iC"
          price="2.99"
          currency="USD"
          cycle={{ unit: 'month', count: 1 }}
          nextBillOn="2026-10-20"
          compact
          today="2026-10-19"
          onPress={() => {}}
        />
        <ListRow
          name="Spotify"
          price="11.99"
          currency="USD"
          cycle={{ unit: 'month', count: 1 }}
          nextBillOn="2026-10-19"
          compact
          today="2026-10-19"
          onPress={() => {}}
        />
      </Section>

      <Section title="ServiceMark (02 S21)">
        <View style={styles.markRow}>
          {MARK_SIZES.map((size) => (
            <ServiceMark key={size} name="Netflix" size={size} />
          ))}
        </View>
        <View style={styles.markRow}>
          <ServiceMark name="iCloud+" mark="iC" />
          <ServiceMark name="Google Play" mark="GP" />
          <ServiceMark name="Northside Gym" />
          <ServiceMark name="Movie Club" />
          <ServiceMark name="Netflix" shape="square" />
        </View>
        <Text style={styles.note}>
          Catalog marks, a derived tint, and the 28pt square used by Member detail.
        </Text>
      </Section>

      <Section title="Stepper (02 S16)">
        <View style={styles.row}>
          <View style={styles.grow}>
            <Stepper value={every} onChange={setEvery} label="Every" />
          </View>
          <View style={styles.grow}>
            <Select
              label="Unit"
              value="months"
              options={[
                { value: 'weeks', label: 'Weeks' },
                { value: 'months', label: 'Months' },
                { value: 'years', label: 'Years' },
              ]}
              onChange={() => {}}
            />
          </View>
        </View>
        <Text style={styles.note}>
          Hold minus or plus to repeat. At 1 and 99 that side mutes and stops.
        </Text>
        <Stepper value={1} onChange={() => {}} label="At the minimum" />
        <Stepper value={99} onChange={() => {}} label="At the maximum" />
      </Section>

      <Section title="SearchField (02 S18)">
        <SearchField
          value={search}
          onChangeText={setSearch}
          placeholder="Search subscriptions"
        />
        <Text style={styles.note}>
          44 tall, not 52. The clear button appears once there is something to clear.
        </Text>
      </Section>

      <Section title="FilterChip (02 S17)">
        <View style={styles.chipRow}>
          {FILTERS.map((label) => (
            <FilterChip
              key={label}
              label={label}
              selected={filter === label}
              onPress={() => setFilter(label)}
              accessibilityLabel={label === 'All' ? 'All categories' : undefined}
            />
          ))}
        </View>
        <Text style={styles.note}>
          Drawn at 28, tappable at 44. The row scrolls rather than wrapping.
        </Text>
      </Section>

      <Section title="Badge (02 S19)">
        <View style={styles.chipRow}>
          {BADGE_TONES.map((tone) => (
            <Badge key={tone} label={tone} tone={tone} />
          ))}
          <Badge label="12 active" tone="success" />
          <Badge label="Cancelled" />
        </View>
      </Section>

      <Section title="AlertCard (02 S20)">
        <AlertCard message="Streamly Plus is going up to $17.99 on Oct 3." />
        <AlertCard
          title="Price increase"
          message="Streamly Plus is going up to $17.99 on Oct 3."
          onPress={() => {}}
          accessibilityHint="Opens the subscription"
        />
      </Section>

      <Section title="Toggle (02 S7)">
        <View style={styles.row}>
          <Toggle value={false} />
          <Toggle value />
          <Toggle value={false} disabled />
          <Toggle value disabled />
        </View>
        <Text style={styles.note}>
          Drawn, not driven: Toggle takes no handler on purpose. It is 24pt tall, below
          the 44pt floor, so the SettingsRow above is the switch and this is only the
          indicator. Here to check the thumb travel and the off colour in both themes.
        </Text>
      </Section>

      <Section title="Amount">
        <Amount value="1284.50" currency="USD" size="hero" />
        <Amount value="1284.50" currency="USD" size="large" />
        <Amount value="15.49" currency="USD" size="row" />
        <Amount value="15.49" currency="USD" size="compact" />
        <Amount value="2400" currency="JPY" size="large" />
        <Amount value="15.49" currency="GBP" size="row" unconverted />
      </Section>

      <Section title="StackedBar + BarRow">
        <StackedBar
          segments={[
            { category: 'entertainment', percent: 45 },
            { category: 'productivity', percent: 30 },
            { category: 'cloud-storage', percent: 25 },
          ]}
        />
        <BarRow category="entertainment" amount="124.50" currency="USD" percent={45} />
        <BarRow category={null} amount="18.00" currency="USD" percent={7} />
      </Section>

      <Section title="SectionHeader - with a category square">
        <SectionHeader title="Entertainment" color={categoryColors.entertainment} />
        <SectionHeader title="Productivity" color={categoryColors.productivity} />
      </Section>

      <Section title="ErrorState">
        <ErrorState variant="offline" onRetry={() => {}} />
        <ErrorState variant="error" onRetry={() => {}} />
        <ErrorState variant="notFound" />
      </Section>

      <Section title="CategoryBadge">
        {CATEGORY_SLUGS.map((slug) => (
          <CategoryBadge key={slug} category={slug} />
        ))}
        <CategoryBadge category={null} />
      </Section>

      <Section title="BottomSheet + Toast">
        <Button label="Open sheet" variant="secondary" onPress={() => setSheet(true)} />
        <Button label="Confirm" variant="secondary" onPress={() => setConfirm('plain')} />
        <Button
          label="Destructive confirm"
          variant="destructiveOutline"
          onPress={() => setConfirm('destructive')}
        />
        <Button
          label="Show toast"
          variant="ghost"
          onPress={() => toast.show('Subscription saved')}
        />
        <Button
          label="Show neutral toast"
          variant="ghost"
          onPress={() => toast.show('Link copied', 'neutral')}
        />
      </Section>

      <Section title="EmptyState">
        <EmptyState
          icon={Inbox}
          title="No subscriptions yet"
          message="Add the first one with the + button."
          actionLabel="Add subscription"
          onAction={() => {}}
        />
      </Section>

      <Section title="Skeleton">
        <SkeletonGroup label="Loading subscriptions">
          <SkeletonRow />
          <Skeleton width="60%" />
        </SkeletonGroup>
      </Section>

      <BottomSheet visible={sheet} onClose={() => setSheet(false)} title="A bottom sheet">
        <Text style={styles.note}>Tap the backdrop to dismiss.</Text>
        <Button label="Close" onPress={() => setSheet(false)} fullWidth />
      </BottomSheet>

      <ConfirmSheet
        visible={confirm !== null}
        destructive={confirm === 'destructive'}
        title={confirm === 'destructive' ? 'Delete Netflix?' : 'Change currency?'}
        message={
          confirm === 'destructive'
            ? 'Its billing history is removed too. This cannot be undone.'
            : 'Totals will be shown in EUR from now on.'
        }
        confirmLabel={confirm === 'destructive' ? 'Delete' : 'Change'}
        onConfirm={() => setConfirm(null)}
        onCancel={() => setConfirm(null)}
      />
    </Screen>
  );
}

const useStyles = makeStyles(({ colors, typography }) => ({
  section: {
    gap: spacing.md,
    paddingBottom: spacing.lg,
  },
  row: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  markRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: spacing.md,
  },
  chipRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  grow: {
    flex: 1,
  },
  note: {
    ...typography.caption,
  },
  cardTitle: {
    ...typography.displayMd,
    color: colors.text,
  },
}));
