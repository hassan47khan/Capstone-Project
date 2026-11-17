/**
 * The rules behind Review extraction (11 §2.2, §2.4).
 */
import { huluExtraction, spotifyExtraction } from '@/test/aiFixtures';

import {
  bandFor,
  percent,
  reminderFor,
  rowsFor,
  shiftDate,
  toConfirmInput,
  unresolvedRows,
  validateReview,
  valuesFromExtraction,
} from './reviewModel';

const TODAY = '2026-10-01';

describe('confidence bands (11 §2.2)', () => {
  it.each([
    [0.95, 'high'],
    [0.9, 'high'],
    [0.89, 'medium'],
    [0.6, 'medium'],
    [0.59, 'low'],
    [null, null],
  ])('%p is %p', (score, band) => {
    expect(bandFor(score)).toBe(band);
  });

  it('rounds down, so 89.9% never reads as a green 90%', () => {
    expect(percent(0.899)).toBe('89%');
    expect(percent(0.54)).toBe('54%');
  });
});

describe('rows', () => {
  it('the price row is amount, currency and cycle, scored by the weakest', () => {
    const values = valuesFromExtraction(huluExtraction);
    const price = rowsFor(huluExtraction, values).find((row) => row.key === 'price')!;
    expect(price.confidence).toBe(0.92);
    expect(price.band).toBe('high');
  });

  it('a trial gets a "Trial ends" row; a paid plan does not', () => {
    const hulu = rowsFor(huluExtraction, valuesFromExtraction(huluExtraction));
    const spotify = rowsFor(spotifyExtraction, valuesFromExtraction(spotifyExtraction));
    expect(hulu.map((r) => r.key)).toEqual([
      'name',
      'price',
      'category',
      'trial',
      'start',
    ]);
    expect(spotify.map((r) => r.key)).toEqual([
      'name',
      'plan',
      'price',
      'category',
      'start',
    ]);
  });

  it('flags a row the server flagged, and any row under 60%', () => {
    const rows = rowsFor(huluExtraction, valuesFromExtraction(huluExtraction));
    expect(rows.filter((r) => r.flagged).map((r) => r.key)).toEqual(['trial']);

    const shaky = {
      ...spotifyExtraction,
      confidence: { ...spotifyExtraction.confidence, category: 0.4 },
    };
    const shakyRows = rowsFor(shaky, valuesFromExtraction(shaky));
    expect(shakyRows.find((r) => r.key === 'category')!.flagged).toBe(true);
  });

  it('a value the email did not have stays blank, never a guess', () => {
    const blank = {
      ...spotifyExtraction,
      fields: { ...spotifyExtraction.fields, price: null },
      confidence: { ...spotifyExtraction.confidence, price: null },
      flagged: ['price'],
    };
    const values = valuesFromExtraction(blank);
    expect(values.price).toBe('');
    expect(rowsFor(blank, values).find((r) => r.key === 'price')!.flagged).toBe(true);
  });
});

describe('flagged fields must be resolved before saving (11 §2.4 rule 2)', () => {
  const initial = valuesFromExtraction(huluExtraction);
  const rows = rowsFor(huluExtraction, initial);

  it('an untouched flagged row blocks', () => {
    expect(unresolvedRows(rows, initial, initial, new Set())).toEqual(['trial']);
  });

  it('"Looks right" resolves it', () => {
    expect(unresolvedRows(rows, initial, initial, new Set(['trial']))).toEqual([]);
  });

  it('editing the value resolves it', () => {
    const edited = { ...initial, trialEndsOn: '2026-10-20' };
    expect(unresolvedRows(rows, edited, initial, new Set())).toEqual([]);
  });

  it('editing a different row does not', () => {
    const edited = { ...initial, name: 'Hulu (No Ads)' };
    expect(unresolvedRows(rows, edited, initial, new Set())).toEqual(['trial']);
  });
});

describe('what Confirm and track sends', () => {
  it('a trial carries its end date and its length in days', () => {
    const input = toConfirmInput(valuesFromExtraction(huluExtraction));
    expect(input).toMatchObject({
      name: 'Hulu',
      billing_price: '17.99',
      billing_currency: 'USD',
      billing_cycle: 'monthly',
      category: 'entertainment',
      start_date: '2026-09-19',
      is_trial: true,
      trial_ends_on: '2026-10-19',
      trial_length_days: 30,
      trial_reminder_enabled: true,
    });
  });

  it('a paid plan carries no trial fields', () => {
    const input = toConfirmInput(valuesFromExtraction(spotifyExtraction));
    expect(input).toMatchObject({
      is_trial: false,
      trial_ends_on: null,
      trial_length_days: null,
    });
  });

  it('a trial must end after it starts', () => {
    const values = { ...valuesFromExtraction(huluExtraction), trialEndsOn: '2026-09-01' };
    expect(validateReview(values, TODAY).trialEndsOn).toBe(
      'The trial has to end after it starts.',
    );
  });

  it('a trial needs an end date', () => {
    const values = { ...valuesFromExtraction(huluExtraction), trialEndsOn: null };
    expect(validateReview(values, TODAY).trialEndsOn).toBe(
      'Add the date the trial ends.',
    );
  });
});

describe('reminder date (11 §2.4 rule 5)', () => {
  it('is the trial end minus the alert days', () => {
    expect(reminderFor('2026-10-19', 3, TODAY)).toEqual({
      on: '2026-10-16',
      dueNow: false,
    });
  });

  it('says "due now" when that date has passed', () => {
    expect(reminderFor('2026-10-03', 3, TODAY)).toEqual({
      on: '2026-09-30',
      dueNow: true,
    });
  });

  it('shifts across month ends', () => {
    expect(shiftDate('2026-03-01', -1)).toBe('2026-02-28');
  });
});
