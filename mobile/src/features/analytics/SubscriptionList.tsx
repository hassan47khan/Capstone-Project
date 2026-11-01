/**
 * The subscription list, last on Analytics (handoff 08 §2.4).
 *
 * Search by name, a row of category chips ("All" + one per category that has a
 * subscription), then the list grouped by category: a SectionHeader with the
 * category's color square, and a ListRow per subscription, in the server's
 * order (soonest bill first, cancelled ones last). Tapping a row opens its
 * Detail.
 *
 * Filtering is local and instant: the list is small, and the server sends all
 * of it in one page (02 §18).
 *
 * Empty results (08 §4): "No subscriptions in {Category}" with Clear filter, or
 * "No results for '{query}'". The count of matches is announced as the search
 * or chip changes (08 §7).
 *
 * Cancelled subscriptions are listed too (08 §5), dimmed, with when they were
 * cancelled in place of a next bill, last in their group as the server sorts
 * them.
 *
 * Not yet: virtualizing 50+ rows.
 */
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useState } from 'react';
import { ScrollView, Text, View } from 'react-native';

import { Button, FilterChip, ListRow, SearchField, SectionHeader } from '@/components';
import type { SubscriptionRow } from '@/features/subscriptions/api';
import type { AppStackParamList } from '@/navigation/types';
import { makeStyles, spacing, UNCATEGORIZED_LABEL, useTheme } from '@/theme';

import {
  categoryOptions,
  filterRows,
  groupRows,
  rowCycle,
  UNCATEGORIZED,
} from './listGroups';

export const LIST_COPY = {
  title: 'Your subscriptions',
  search: 'Search subscriptions…',
  all: 'All',
  count: (n: number) =>
    n === 0 ? 'no subscriptions' : n === 1 ? '1 subscription' : `${n} subscriptions`,
  noneInCategory: (name: string) => `No subscriptions in ${name}`,
  clearFilter: 'Clear filter',
  noResults: (query: string) => `No results for '${query}'`,
} as const;

type Navigation = NativeStackNavigationProp<AppStackParamList>;

export function SubscriptionList({ rows }: { rows: readonly SubscriptionRow[] }) {
  const styles = useStyles();
  const { categoryColors } = useTheme();
  const navigation = useNavigation<Navigation>();
  const [query, setQuery] = useState('');
  // The selected chip's category key, or null for "All".
  const [category, setCategory] = useState<string | null>(null);

  const chips = categoryOptions(rows);
  const matches = filterRows(rows, category, query);
  const groups = groupRows(matches);
  // "Uncategorized" has no chip once it's empty, so name it anyway.
  const chipName =
    chips.find((chip) => chip.key === category)?.name ??
    (category === UNCATEGORIZED ? UNCATEGORIZED_LABEL : '');
  const filtering = category !== null || query.trim() !== '';

  return (
    <View style={styles.section} testID="analytics-list">
      <SectionHeader title={LIST_COPY.title} />

      <SearchField
        value={query}
        onChangeText={setQuery}
        placeholder={LIST_COPY.search}
        testID="analytics-search"
      />

      {/* One line that scrolls sideways, not wrapping rows (02 §17). */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.chips}
        accessibilityRole="radiogroup"
      >
        <FilterChip
          label={LIST_COPY.all}
          selected={category === null}
          onPress={() => setCategory(null)}
          accessibilityLabel={`${LIST_COPY.all}, ${LIST_COPY.count(rows.length)}`}
          testID="analytics-chip-all"
        />
        {chips.map((chip) => (
          <FilterChip
            key={chip.key}
            label={chip.name}
            selected={category === chip.key}
            onPress={() => setCategory(chip.key)}
            accessibilityLabel={`${chip.name}, ${LIST_COPY.count(chip.count)}`}
            testID={`analytics-chip-${chip.key}`}
          />
        ))}
      </ScrollView>

      {/* Announced when the search or chip changes (08 §7). */}
      {filtering ? (
        <Text
          style={styles.count}
          accessibilityLiveRegion="polite"
          testID="analytics-list-count"
        >
          {LIST_COPY.count(matches.length)}
        </Text>
      ) : null}

      {matches.length === 0 && filtering ? (
        <View style={styles.empty} testID="analytics-list-empty">
          <Text style={styles.emptyText}>
            {query.trim()
              ? LIST_COPY.noResults(query.trim())
              : LIST_COPY.noneInCategory(chipName ?? '')}
          </Text>
          {category !== null && !query.trim() ? (
            <Button
              label={LIST_COPY.clearFilter}
              variant="ghost"
              onPress={() => setCategory(null)}
              testID="analytics-clear-filter"
            />
          ) : null}
        </View>
      ) : (
        groups.map((group) => (
          <View key={group.category.key} style={styles.group}>
            <SectionHeader
              title={group.category.name}
              color={categoryColors[group.category.colorKey]}
              testID={`analytics-group-${group.category.key}`}
            />
            {group.rows.map((row) => (
              <ListRow
                key={row.id}
                name={row.name}
                price={row.billing_price}
                currency={row.billing_currency}
                cycle={rowCycle(row)}
                nextBillOn={row.next_bill_date}
                cancelledOn={row.cancelled_on}
                cancelled={row.status === 'cancelled'}
                mark={row.service_mark?.mark}
                brand={
                  row.service_mark
                    ? { tint: row.service_mark.tint_hex, ink: row.service_mark.brand_hex }
                    : undefined
                }
                onPress={() => navigation.navigate('SubscriptionDetail', { id: row.id })}
                testID={`analytics-row-${row.id}`}
              />
            ))}
          </View>
        ))
      )}
    </View>
  );
}

const useStyles = makeStyles(({ colors, typography }) => ({
  section: {
    gap: spacing.md,
  },
  chips: {
    gap: spacing.sm,
  },
  count: {
    ...typography.caption,
    color: colors.textMuted,
  },
  group: {
    gap: spacing.sm,
  },
  empty: {
    alignItems: 'flex-start',
    gap: spacing.sm,
  },
  emptyText: {
    ...typography.bodyMd,
    color: colors.textMuted,
  },
}));
