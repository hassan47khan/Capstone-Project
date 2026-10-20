/**
 * Component barrel — the app's UI library.
 *
 * Screens import from `@/components`, never from an individual file, so the set
 * of available components is one import away and adding one is visible in
 * review.
 *
 * The set is handoff 02's twenty-one (Button, TextField, CurrencyField,
 * SegmentedControl, Select, DateField, Toggle, Card, ListRow, CategoryBadge,
 * SettingsRow, BottomSheet, Toast, EmptyState/Skeleton/SectionHeader, Stepper,
 * FilterChip, SearchField, Badge, AlertCard, ServiceMark) plus the Phase-0
 * primitives that 02 did not replace. 02's ProgressBar is deliberately absent:
 * §19's note defers it and the confidence chip to the AI epic (11 §2), not
 * Phase 0. They hold no feature knowledge:
 * no API calls, no navigation, no copy baked in. Every one is drawn in every
 * state by the dev gallery (src/features/dev/GalleryScreen.tsx).
 */

export { AlertCard } from './AlertCard';
export type { AlertCardProps, AlertTone } from './AlertCard';

export { Amount } from './Amount';
export type { AmountProps } from './Amount';

export { Badge } from './Badge';
export type { BadgeProps, BadgeTone } from './Badge';

export { BarRow } from './BarRow';
export type { BarRowProps } from './BarRow';

export { BottomSheet, ConfirmSheet } from './BottomSheet';
export type { BottomSheetProps, ConfirmSheetProps, SheetTone } from './BottomSheet';

export { Button } from './Button';
export type { ButtonProps, ButtonVariant } from './Button';

export { Card } from './Card';
export type { CardProps } from './Card';

export { CategoryBadge } from './CategoryBadge';
export type { CategoryBadgeProps } from './CategoryBadge';

export {
  CurrencyField,
  invalidPriceMessage,
  isValidPrice,
  normalizePriceInput,
} from './CurrencyField';
export type { CurrencyFieldProps } from './CurrencyField';

export { DateField, toDateOnly } from './DateField';
export type { DateFieldProps } from './DateField';

export { EmptyState } from './EmptyState';
export type { EmptyStateProps } from './EmptyState';

export { ErrorState } from './ErrorState';
export type { ErrorStateProps, ErrorVariant } from './ErrorState';

export { FilterChip } from './FilterChip';
export type { FilterChipProps } from './FilterChip';

export { GroupedList } from './GroupedList';
export type { GroupedListProps } from './GroupedList';

export { Header } from './Header';
export type { HeaderProps } from './Header';

export { ListRow } from './ListRow';
export type { ListRowProps } from './ListRow';

export { Screen } from './Screen';
export type { ScreenProps } from './Screen';

export { SEARCH_DEBOUNCE_MS, SearchField } from './SearchField';
export type { SearchFieldProps } from './SearchField';

export { SectionHeader } from './SectionHeader';
export type { SectionHeaderProps } from './SectionHeader';

export {
  BILLING_CYCLE_OPTIONS,
  BillingCycleField,
  SegmentedControl,
  segmentBudget,
  WIDEST_BILLING_LABEL_PX,
} from './SegmentedControl';
export type {
  BillingCycleFieldProps,
  BillingCycleOption,
  SegmentedControlProps,
  SegmentedOption,
} from './SegmentedControl';

export { Select } from './Select';
export type { SelectOption, SelectProps } from './Select';

export { ServiceMark } from './ServiceMark';
export type { ServiceMarkProps, ServiceMarkSize } from './ServiceMark';

export { SettingsRow } from './SettingsRow';
export type { SettingsRowProps } from './SettingsRow';

export { Skeleton, SkeletonGroup, SkeletonRow } from './Skeleton';
export type { SkeletonGroupProps, SkeletonProps } from './Skeleton';

export { StackedBar } from './StackedBar';
export type { StackedBarProps, StackedBarSegment } from './StackedBar';

export { STEPPER_MAX, STEPPER_MIN, Stepper } from './Stepper';
export type { StepperProps } from './Stepper';

export { TabBar } from './TabBar';

export { FieldBox, FieldMessage, TextField } from './TextField';
export type { FieldBoxProps, TextFieldProps } from './TextField';

export { Toast, ToastProvider, useToast } from './Toast';
export type { ToastProps, ToastTone } from './Toast';

export { Toggle } from './Toggle';
export type { ToggleProps } from './Toggle';
