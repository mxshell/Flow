import { describe, expect, it } from 'vitest';
import { getNodeOptions, optionScrollTop } from './nodeOptions';

describe('node selector options', () => {
  it('shows all nodes alphabetically for an empty query without creating a blank node', () => {
    expect(getNodeOptions(['Salary', 'Housing', 'Food'], '')).toEqual([
      { name: 'Food', kind: 'existing' },
      { name: 'Housing', kind: 'existing' },
      { name: 'Salary', kind: 'existing' },
    ]);
    expect(getNodeOptions([], '')).toEqual([]);
  });

  it('trims names, removes blank names and deduplicates only exact-case identifiers', () => {
    const options = getNodeOptions([' Rent ', '', 'Rent', '  ', 'rent', 'Rent  '], '');
    expect(options).toHaveLength(2);
    expect(options).toEqual(expect.arrayContaining([
      { name: 'Rent', kind: 'existing' },
      { name: 'rent', kind: 'existing' },
    ]));
  });

  it('ranks exact case, case-insensitive exact, prefixes, then substring matches', () => {
    expect(getNodeOptions(['Pre-rent', 'Renter', 'Other', 'RENT', 'Rent'], 'Rent')).toEqual([
      { name: 'Rent', kind: 'existing' },
      { name: 'RENT', kind: 'existing' },
      { name: 'Renter', kind: 'existing' },
      { name: 'Pre-rent', kind: 'existing' },
    ]);
  });

  it('alphabetizes within match ranks and keeps creation after existing matches', () => {
    expect(getNodeOptions(['Zeta fund', 'Fund travel', 'Alpha fund', 'Fund food'], 'fund')).toEqual([
      { name: 'Fund food', kind: 'existing' },
      { name: 'Fund travel', kind: 'existing' },
      { name: 'Alpha fund', kind: 'existing' },
      { name: 'Zeta fund', kind: 'existing' },
      { name: 'fund', kind: 'create' },
    ]);
  });

  it('offers a case-distinct node even when an existing name matches case-insensitively', () => {
    expect(getNodeOptions(['Salary'], 'salary')).toEqual([
      { name: 'Salary', kind: 'existing' },
      { name: 'salary', kind: 'create' },
    ]);
  });

  it('offers only creation when no existing node contains the query', () => {
    expect(getNodeOptions(['Salary', 'Housing'], 'Groceries')).toEqual([
      { name: 'Groceries', kind: 'create' },
    ]);
  });

  it('ignores surrounding query whitespace for matching and creation', () => {
    expect(getNodeOptions([' Rent '], '  Rent  ')).toEqual([{ name: 'Rent', kind: 'existing' }]);
    expect(getNodeOptions(['Rent'], '  Food  ')).toEqual([{ name: 'Food', kind: 'create' }]);
    expect(getNodeOptions(['Rent'], '   ')).toEqual([{ name: 'Rent', kind: 'existing' }]);
  });

  it('preserves the original names array and its order', () => {
    const names = [' Salary ', 'Housing', 'Housing'];
    getNodeOptions(names, '');
    expect(names).toEqual([' Salary ', 'Housing', 'Housing']);
  });
});

describe('node selector keyboard scrolling', () => {
  it('keeps the list still when the active option is already visible', () => {
    expect(optionScrollTop(80, 100, 200, 130, 40)).toBe(80);
    expect(optionScrollTop(80, 100, 200, 100, 200)).toBe(80);
  });

  it('reveals an option below the list using the smallest scroll', () => {
    expect(optionScrollTop(80, 100, 200, 280, 40)).toBe(100);
  });

  it('reveals an option above the list without scrolling the page', () => {
    expect(optionScrollTop(80, 100, 200, 70, 40)).toBe(50);
  });

  it('aligns an oversized option to the top rather than jumping between its edges', () => {
    expect(optionScrollTop(80, 100, 60, 140, 100)).toBe(120);
    expect(optionScrollTop(120, 100, 60, 100, 100)).toBe(120);
  });

  it('handles hidden lists and clamps upward scrolling at the first option', () => {
    expect(optionScrollTop(80, 100, 0, 140, 40)).toBe(80);
    expect(optionScrollTop(10, 100, 200, 80, 40)).toBe(0);
  });
});
