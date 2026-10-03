/**
 * Component barrel — the app's UI primitives.
 *
 * Screens import from `@/components`, never from an individual file, so the set
 * of available primitives is one import away and adding a twenty-first is
 * visible in review.
 *
 * These twenty are the complete set named in section 4 of the project prompt.
 * They hold no feature knowledge: no API calls, no navigation, no copy baked in.
 * Everything they show arrives as props, which is what lets the same `ListRow`
 * serve a subscription, a settings row and a currency.
 */

export { Amount } from './Amount';
export type { AmountProps } from './Amount';

export { Badge } from './Badge';
export type { BadgeProps, BadgeTone } from './Badge';

export { BarRow } from './BarRow';
export type { BarRowProps } from './BarRow';

export { Button } from './Button';
export type { ButtonProps, ButtonVariant } from './Button';

export { Chip } from './Chip';
export type { ChipProps } from './Chip';

export { EmptyState } from './EmptyState';
export type { EmptyStateProps } from './EmptyState';

export { ErrorState } from './ErrorState';
export type { ErrorStateProps, ErrorVariant } from './ErrorState';

export { GroupedList } from './GroupedList';
export type { GroupedListProps } from './GroupedList';

export { Header } from './Header';
export type { HeaderProps } from './Header';

export { ListRow } from './ListRow';
export type { ListRowProps } from './ListRow';

export { NoticeBanner } from './NoticeBanner';
export type { NoticeBannerProps } from './NoticeBanner';

export { Screen } from './Screen';
export type { ScreenProps } from './Screen';

export { Segmented } from './Segmented';
export type { SegmentedOption, SegmentedProps } from './Segmented';

export { Select } from './Select';
export type { SelectOption, SelectProps } from './Select';

export { Skeleton, SkeletonGroup, SkeletonRow } from './Skeleton';
export type { SkeletonGroupProps, SkeletonProps } from './Skeleton';

export { StackedBar } from './StackedBar';
export type { StackedBarProps, StackedBarSegment } from './StackedBar';

export { Switch } from './Switch';
export type { SwitchProps } from './Switch';

export { TabBar } from './TabBar';

export { TextField } from './TextField';
export type { TextFieldProps } from './TextField';

export { Tile } from './Tile';
export type { TileProps } from './Tile';
