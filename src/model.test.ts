import { describe, expect, it } from 'vitest';
import { analyze, appearance, formatAmount, parseDocument, template } from './model';
import type { Diagram, Flow } from './model';
import { buildLayout } from './layout';
import type { ChartNode } from './layout';

const flows = (rows: [string, string, number][]): Flow[] => rows.map(([from, to, amount], i) => ({ id: String(i), from, to, amount }));
const custom = (f: Flow[]): Diagram => ({ version: 2, id: 'test', kind: 'custom', title: 'Test', columnTitles: [], numberFormat: 'decimal', currency: 'USD', flows: f, appearance });

describe('flow analysis', () => {
  it.each([['budget', 6000], ['business', 1200000], ['jobs', 100]] as const)('balances the %s example without counting money twice', (kind, total) => {
    const result = analyze(template(kind).flows);
    expect(result.errors).toEqual([]);
    expect(result.balances).toEqual([]);
    expect(result.total).toBe(total);
  });
  it('detects cycles even inside a disconnected component', () => {
    expect(analyze(flows([['A', 'B', 1], ['X', 'Y', 1], ['Y', 'Z', 1], ['Z', 'X', 1]])).errors[0]).toContain('loop');
  });
  it('accepts a diamond without double counting and aggregates duplicate edges', () => {
    const result = analyze(flows([['A', 'B', 2], ['A', 'B', 3], ['A', 'C', 5], ['B', 'D', 5], ['C', 'D', 5]]));
    expect(result.errors).toEqual([]);
    expect(result.links[0].value).toBe(5);
    expect(result.links[0].ids).toHaveLength(2);
    expect(result.total).toBe(10);
    expect(result.balances).toEqual([]);
  });
  it('normalizes whitespace and rejects hidden self-links', () => {
    expect(analyze(flows([[' A ', 'A', 2]])).errors[0]).toContain('different');
    expect(analyze(flows([[' A ', 'B', 2], ['B ', 'C', 2]])).nodes).toHaveLength(3);
  });
  it.each([0, -1, NaN, Infinity, 1e16])('rejects unsafe amount %s', amount => {
    expect(analyze(flows([['A', 'B', amount]])).errors.length).toBeGreaterThan(0);
  });
  it('handles floating point balances and warns only for intermediate nodes', () => {
    expect(analyze(flows([['A', 'B', 0.1], ['C', 'B', 0.2], ['B', 'D', 0.3]])).balances).toEqual([]);
    const result = analyze(flows([['A', 'B', 5], ['B', 'C', 3]]));
    expect(result.errors).toEqual([]);
    expect(result.balances.map(n => n.name)).toEqual(['B']);
  });
});

describe('number formats and saved-data compatibility', () => {
  it.each(['USD', 'SGD', 'EUR', 'GBP'])('migrates legacy %s diagrams without changing amounts', unit => {
    const source = template('budget');
    const migrated = parseDocument({ ...source, version: 1, unit });
    expect(migrated.version).toBe(2);
    expect(migrated.numberFormat).toBe('currency');
    expect(migrated.currency).toBe(unit);
    expect(migrated.flows.map(f => f.amount)).toEqual(source.flows.map(f => f.amount));
    expect(migrated).not.toHaveProperty('unit');
  });
  it.each([['applications', 'integer'], ['number', 'decimal'], ['unknown', 'decimal']])('migrates legacy %s to %s', (unit, expected) => {
    const migrated = parseDocument({ ...template('jobs'), version: 1, unit });
    expect(migrated.numberFormat).toBe(expected);
  });
  it('preserves small fractions and suppresses floating-point noise in decimal display', () => {
    const settings = { numberFormat: 'decimal', currency: 'USD' } as const;
    expect(formatAmount(1234.56789, settings)).toBe('1,234.56789');
    expect(formatAmount(0.0000001, settings)).toBe('0.0000001');
    expect(formatAmount(0.1 + 0.2, settings)).toBe('0.3');
  });
  it('rounds only the display in whole-number format, including compact labels', () => {
    const doc = template('jobs');
    doc.flows[0].amount = 1234.75;
    const before = JSON.stringify(doc);
    expect(formatAmount(doc.flows[0].amount, doc)).toBe('1,235');
    expect(formatAmount(doc.flows[0].amount, doc, true)).toBe('1K');
    expect(JSON.stringify(doc)).toBe(before);
  });
  it('uses the selected currency’s minor units', () => {
    expect(formatAmount(1234.5, { numberFormat: 'currency', currency: 'USD' })).toBe('$1,234.50');
    expect(formatAmount(1234.5, { numberFormat: 'currency', currency: 'JPY' })).toBe('¥1,235');
  });
  it('keeps the chosen currency across format switches and file round trips', () => {
    const decimal = { ...template('budget'), numberFormat: 'decimal' as const, currency: 'SGD' as const };
    const reloaded = parseDocument(JSON.parse(JSON.stringify(decimal)));
    expect(reloaded.numberFormat).toBe('decimal');
    expect(reloaded.currency).toBe('SGD');
    expect(formatAmount(12.5, { ...reloaded, numberFormat: 'currency' })).toBe('SGD 12.50');
  });
  it('falls back safely for invalid new format settings', () => {
    const doc = parseDocument({ ...template('budget'), numberFormat: '__proto__', currency: 'INVALID' });
    expect(doc.numberFormat).toBe('decimal');
    expect(doc.currency).toBe('USD');
  });
});

describe('layout and file safety', () => {
  it('does not mutate or create cycles in the saved source data', () => {
    const doc = template('business'), before = JSON.stringify(doc);
    const result = buildLayout(doc)!;
    expect(JSON.stringify(doc)).toBe(before);
    expect(result.graph.nodes.every(n => Number.isFinite(n.x0) && n.y1! > n.y0!)).toBe(true);
  });
  it('keeps flow widths positive for 300 destinations', () => {
    const result = buildLayout(custom(flows(Array.from({ length: 300 }, (_, i) => ['Source', `Destination ${i}`, 1]))))!;
    expect(result.height).toBeGreaterThan(555);
    expect(result.graph.links.every(l => l.width! > 0)).toBe(true);
    expect(result.graph.nodes.every(n => n.y1! > n.y0!)).toBe(true);
  });
  it('keeps a long chain moving forward with space between columns', () => {
    const result = buildLayout(custom(flows(Array.from({ length: 100 }, (_, i) => [`Stage ${i}`, `Stage ${i + 1}`, 1]))))!;
    expect(result.graph.links.every(l => (l.target as ChartNode).x0! > (l.source as ChartNode).x1!)).toBe(true);
  });
  it('round-trips all examples and rejects malformed imports', () => {
    for (const kind of ['budget', 'business', 'jobs'] as const) {
      const doc = template(kind), parsed = parseDocument(JSON.parse(JSON.stringify(doc)));
      expect(parsed.flows.map(({ from, to, amount }) => [from, to, amount])).toEqual(doc.flows.map(({ from, to, amount }) => [from, to, amount]));
    }
    expect(() => parseDocument({ version: 2, flows: [] })).toThrow();
    expect(() => parseDocument({ ...template('budget'), flows: [{ from: 'A', to: 'B', amount: '5' }] })).toThrow();
    expect(() => parseDocument({ ...template('budget'), flows: flows([['A', 'B', 2], ['B', 'A', 2]]) })).toThrow();
  });
  it('normalizes unsafe appearance settings on import', () => {
    const doc = parseDocument({ ...template('budget'), appearance: { palette: '__proto__', opacity: Infinity, nodeWidth: -50 } });
    expect(doc.appearance).toEqual(appearance);
  });
});
