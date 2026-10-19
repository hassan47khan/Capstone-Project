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
 *   - SectionHeader is 12px, not 11px (01's 12pt floor).
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
  BillingCycleField,
  BottomSheet,
  Button,
  Card,
  CategoryBadge,
  ConfirmSheet,
  CurrencyField,
  DateField,
  EmptyState,
  GroupedList,
  Header,
  invalidPriceMessage,
  isValidPrice,
  ListRow,
  Screen,
  SectionHeader,
  SegmentedControl,
  Select,
  SettingsRow,
  Skeleton,
  SkeletonGroup,
  SkeletonRow,
  TextField,
  useToast,
  type BillingCycleOption,
  type ButtonVariant,
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
  const { preference, setPreference, reduceMotion } = useTheme();
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
          variant="destructive"
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
