/**
 * Tests for the price history step chart (07 §4, §11).
 */
import { fireEvent, screen } from '@testing-library/react-native';

import { renderWithProviders } from '@/test/render';
import { headspaceDetail, netflixDetail } from '@/test/subscriptionFixtures';

import {
  CHART_HEIGHT,
  chartGeometry,
  PRICE_CHART_COPY,
  PriceHistoryChart,
} from './PriceHistoryChart';
import { buildPriceSeries, describePriceHistory } from './priceHistory';

const TODAY = '2026-10-23';
const netflixSeries = buildPriceSeries(netflixDetail.history, '15.49', TODAY);
const netflixSummary = describePriceHistory(netflixDetail.history, 'USD', '15.49');

describe('chartGeometry', () => {
  it('us7_price_chart_steps_up_on_2026_10_01', () => {
    const { path, points } = chartGeometry(netflixSeries, 365);

    // One step, near the right edge (Oct 1 is 343 days into a 365-day window)...
    expect(points).toHaveLength(1);
    expect(points[0]!.step).toEqual({ date: '2026-10-01', price: '15.49' });
    expect(points[0]!.x).toBe(343);
    // ...going UP: the new price is drawn higher (smaller y) than the old one.
    const startY = Number(path.split(' ')[2]);
    expect(points[0]!.y).toBeLessThan(startY);
    // Both levels stay inside the chart.
    expect(startY).toBeLessThanOrEqual(CHART_HEIGHT);
    expect(points[0]!.y).toBeGreaterThanOrEqual(0);
    // Across, up, then across to today.
    expect(path).toBe(`M 0 ${startY} H 343 V ${points[0]!.y} H 365`);
  });
});

describe('PriceHistoryChart', () => {
  it('us7_no_changes_shows_a_message_not_an_empty_axis', async () => {
    const series = buildPriceSeries(headspaceDetail.history, '12.99', TODAY);
    await renderWithProviders(
      <PriceHistoryChart series={series} currency="USD" summary="unused" />,
    );

    expect(screen.getByText(PRICE_CHART_COPY.empty)).toBeOnTheScreen();
    expect(
      screen.queryByTestId('price-chart-plot', { includeHiddenElements: true }),
    ).toBeNull();
  });

  it('us7_chart_has_the_same_figures_in_text_beside_it', async () => {
    await renderWithProviders(
      <PriceHistoryChart
        series={netflixSeries}
        currency="USD"
        summary={netflixSummary}
      />,
      { reduceMotion: true },
    );

    expect(screen.getByTestId('price-chart-summary')).toHaveTextContent(
      'Price history: $13.99 from March 2024, increased to $15.49 on October 1, 2026.',
    );
    // The drawing itself is hidden from screen readers.
    expect(screen.queryByTestId('price-chart-plot')).toBeNull();
    expect(
      screen.getByTestId('price-chart-plot', { includeHiddenElements: true }),
    ).toBeTruthy();
  });

  it('draws the line once it knows its width, with axis labels', async () => {
    await renderWithProviders(
      <PriceHistoryChart
        series={netflixSeries}
        currency="USD"
        summary={netflixSummary}
      />,
      { reduceMotion: true },
    );

    const plot = screen.getByTestId('price-chart-plot', { includeHiddenElements: true });
    await fireEvent(plot, 'layout', { nativeEvent: { layout: { width: 300 } } });

    expect(
      screen.getByTestId('price-chart-line', { includeHiddenElements: true }),
    ).toBeTruthy();
    expect(screen.getByText('Oct 2025', { includeHiddenElements: true })).toBeTruthy();
    expect(screen.getByText('Today', { includeHiddenElements: true })).toBeTruthy();
  });
});
