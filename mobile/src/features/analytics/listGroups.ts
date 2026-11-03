/**
 * The Analytics subscription list's data (handoff 08 §2.4): which rows show,
 * the category chips, the search, and the groups. Plain functions, no React.
 */
import type { BillingCycle as RowCycle } from '@/api/types';
import type { SubscriptionRow } from '@/features/subscriptions/api';
import {
  CATEGORY_LABELS,
  CATEGORY_SLUGS,
  categorySlugToKey,
  UNCATEGORIZED_LABEL,
  type CategoryKey,
} from '@/theme';

// Cancelled subscriptions have no next bill (the contract sends null), and
// ListRow needs one. They join the list once ListRow can show them.
export function listedRows(rows: readonly SubscriptionRow[]): SubscriptionRow[] {
  return rows.filter((row) => row.status !== 'cancelled' && row.next_bill_date !== null);
}

/** ListRow's cycle: "monthly" → every 1 month, Headspace's custom → every 2 months. */
export function rowCycle(row: SubscriptionRow): RowCycle {
  switch (row.billing_cycle) {
    case 'weekly':
      return { unit: 'week', count: 1 };
    case 'quarterly':
      return { unit: 'month', count: 3 };
    case 'yearly':
      return { unit: 'year', count: 1 };
    case 'custom': {
      const unit = row.custom_cycle_unit ?? 'months';
      return {
        unit:
          unit === 'days'
            ? 'day'
            : unit === 'weeks'
              ? 'week'
              : unit === 'years'
                ? 'year'
                : 'month',
        count: row.custom_cycle_count ?? 1,
      };
    }
    default:
      return { unit: 'month', count: 1 };
  }
}

export const UNCATEGORIZED = 'uncategorized';

export interface CategoryOption {
  /** The category slug, or UNCATEGORIZED. */
  key: string;
  name: string;
  /** For the group header's color square. */
  colorKey: CategoryKey;
  count: number;
}

const keyOf = (row: SubscriptionRow) => row.category?.slug ?? UNCATEGORIZED;

/**
 * One chip per category (08 §2.4), A to Z by name, each with how many it has:
 * every category, not only the ones in use, so a chip that empties out says
 * "No subscriptions in …" instead of vanishing. "Uncategorized" comes last,
 * and only when something is uncategorized. Names and colors are the theme's,
 * which match the server's categories.
 */
export function categoryOptions(rows: readonly SubscriptionRow[]): CategoryOption[] {
  const countOf = (key: string) => rows.filter((row) => keyOf(row) === key).length;
  const options: CategoryOption[] = CATEGORY_SLUGS.map((slug) => ({
    key: slug,
    name: CATEGORY_LABELS[slug],
    colorKey: categorySlugToKey[slug],
    count: countOf(slug),
  })).sort((a, b) => a.name.localeCompare(b.name));
  const uncategorized = countOf(UNCATEGORIZED);
  if (uncategorized > 0) {
    options.push({
      key: UNCATEGORIZED,
      name: UNCATEGORIZED_LABEL,
      colorKey: categorySlugToKey.other,
      count: uncategorized,
    });
  }
  return options;
}

/** The rows matching the chip (null is "All") and the search, by name. */
export function filterRows(
  rows: readonly SubscriptionRow[],
  category: string | null,
  query: string,
): SubscriptionRow[] {
  const wanted = query.trim().toLocaleLowerCase();
  return rows.filter(
    (row) =>
      (category === null || keyOf(row) === category) &&
      (!wanted || row.name.toLocaleLowerCase().includes(wanted)),
  );
}

export interface RowGroup {
  category: CategoryOption;
  rows: SubscriptionRow[];
}

/**
 * The rows grouped by category: groups in chip order, empty ones left out,
 * rows in the server's order (soonest bill first).
 */
export function groupRows(rows: readonly SubscriptionRow[]): RowGroup[] {
  return categoryOptions(rows)
    .filter((category) => category.count > 0)
    .map((category) => ({
      category,
      rows: rows.filter((row) => keyOf(row) === category.key),
    }));
}
