import { describe, expect, it } from 'vitest';
import {
  analyze, appearance, balanceDifference, formatPercentage, getPercentageReference, parseDocument, renameNode, template,
} from './model';
import type { Diagram, Flow } from './model';

const rows = (data: [string, string, number][]): Flow[] => data.map(([from, to, amount], i) => ({ id: `flow-${i}`, from, to, amount }));
const custom = (data: [string, string, number][]): Diagram => ({
  version: 2, id: 'test', title: 'Test', kind: 'custom', columnTitles: [], numberFormat: 'decimal', currency: 'USD',
  flows: rows(data), appearance: { ...appearance },
});

describe('renaming diagram nodes', () => {
  it('updates all incoming and outgoing references without changing flow IDs or source data', () => {
    const doc = custom([['Salary', 'Income', 5], ['Freelance', 'Income', 3], ['Income', 'Housing', 6], ['Income', 'Savings', 2]]);
    const original = JSON.stringify(doc);
    const result = renameNode(doc, 'Income', '  Monthly income  ');
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error(result.error);
    expect(result.name).toBe('Monthly income');
    expect(result.diagram.flows.map(flow => [flow.from, flow.to])).toEqual([
      ['Salary', 'Monthly income'], ['Freelance', 'Monthly income'], ['Monthly income', 'Housing'], ['Monthly income', 'Savings'],
    ]);
    expect(result.diagram.flows.map(flow => flow.id)).toEqual(doc.flows.map(flow => flow.id));
    expect(JSON.stringify(doc)).toBe(original);
  });

  it('keeps an unchanged node as a no-op for undo history', () => {
    const doc = custom([['Income', 'Savings', 10]]);
    expect(renameNode(doc, 'Income', ' Income ')).toEqual({ ok: true, diagram: doc, name: 'Income' });
    const result = renameNode(doc, 'Income', 'Income');
    if (result.ok) expect(result.diagram).toBe(doc);
  });

  it('rejects missing, blank, or overlong names', () => {
    const doc = custom([['A', 'B', 1]]);
    expect(renameNode(doc, 'Gone', 'New')).toMatchObject({ ok: false, error: expect.stringContaining('no longer exists') });
    expect(renameNode(doc, 'A', '  ')).toMatchObject({ ok: false, error: expect.stringContaining('Enter a name') });
    expect(renameNode(doc, 'A', 'x'.repeat(61))).toMatchObject({ ok: false, error: expect.stringContaining('60') });
    expect(renameNode(doc, 'A', 'x'.repeat(60)).ok).toBe(true);
  });

  it('requests confirmation before a valid merge and preserves every row when confirmed', () => {
    const doc = custom([['A', 'C', 5], ['B', 'C', 3]]);
    expect(renameNode(doc, 'A', 'B')).toMatchObject({ ok: false, mergeRequired: true });
    const result = renameNode(doc, 'A', 'B', true);
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error(result.error);
    expect(result.diagram.flows).toEqual(rows([['B', 'C', 5], ['B', 'C', 3]]));
    expect(analyze(result.diagram.flows).links).toEqual([{ source: 'B', target: 'C', value: 8, ids: ['flow-0', 'flow-1'] }]);
  });

  it.each([false, true])('rejects a merge creating a self-connection even with allowMerge=%s', allowMerge => {
    const result = renameNode(custom([['A', 'B', 5]]), 'A', 'B', allowMerge);
    expect(result).toMatchObject({ ok: false, error: expect.stringContaining('itself') });
    expect(result).not.toHaveProperty('mergeRequired');
  });

  it.each([false, true])('rejects a merge creating an indirect cycle even with allowMerge=%s', allowMerge => {
    const result = renameNode(custom([['A', 'B', 5], ['B', 'C', 5], ['D', 'A', 5]]), 'C', 'D', allowMerge);
    expect(result).toMatchObject({ ok: false, error: expect.stringContaining('loop') });
    expect(result).not.toHaveProperty('mergeRequired');
  });

  it('keeps the selected percentage reference attached to a renamed node', () => {
    const doc = custom([['A', 'B', 5], ['B', 'C', 3]]);
    doc.appearance.percentageBase = 'B';
    const result = renameNode(doc, 'B', 'Stage');
    if (!result.ok) throw new Error(result.error);
    expect(result.diagram.appearance.percentageBase).toBe('Stage');
    expect(getPercentageReference(result.diagram)).toEqual({ name: 'Stage', value: 5 });
    expect(doc.appearance.percentageBase).toBe('B');
  });

  it('keeps unrelated rows and percentage settings unchanged', () => {
    const doc = custom([['A', 'B', 5], ['X', 'Y', 2]]);
    doc.appearance.percentageBase = 'X';
    const result = renameNode(doc, 'A', 'Source');
    if (!result.ok) throw new Error(result.error);
    expect(result.diagram.flows[1]).toBe(doc.flows[1]);
    expect(result.diagram.appearance).toBe(doc.appearance);
  });
});

describe('balance action amounts', () => {
  it('returns the amount left to allocate, or its negative when too much is allocated', () => {
    expect(balanceDifference({ incoming: 6000, outgoing: 5400 })).toBe(600);
    expect(balanceDifference({ incoming: 25, outgoing: 30 })).toBe(-5);
  });

  it('uses the same relative tolerance as warnings for both ordinary and tiny amounts', () => {
    expect(balanceDifference({ incoming: 0.1 + 0.2, outgoing: 0.3 })).toBe(0);
    expect(balanceDifference({ incoming: 1e-10, outgoing: 2e-10 })).toBe(-1e-10);
    expect(balanceDifference({ incoming: 0, outgoing: 0 })).toBe(0);
    const result = analyze(rows([['A', 'B', 1e-10], ['B', 'C', 2e-10]]));
    expect(result.balances.map(node => [node.name, balanceDifference(node)])).toEqual([['B', -1e-10]]);
  });

  it('keeps source and terminal nodes out of balance warnings', () => {
    const result = analyze(rows([['A', 'B', 5], ['B', 'C', 3]]));
    expect(result.balances.map(node => node.name)).toEqual(['B']);
  });
});

describe('percentage settings and references', () => {
  it.each(['budget', 'business', 'jobs'] as const)('keeps the %s example showing values by default', kind => {
    const doc = template(kind);
    expect(doc.appearance.valueDisplay).toBe('values');
    expect(doc.appearance.percentageBase).toBeNull();
  });

  it.each([1, 2])('defaults missing percentage settings in version %s without enabling hidden values', version => {
    const doc = parseDocument({ ...template('jobs'), version, unit: 'applications', appearance: { values: false } });
    expect(doc.appearance.valueDisplay).toBe('values');
    expect(doc.appearance.percentageBase).toBeNull();
    expect(doc.appearance.values).toBe(false);
  });

  it.each(['values', 'percentages', 'both'] as const)('round-trips the %s display mode and selected reference', valueDisplay => {
    const doc = template('budget');
    doc.appearance = { ...doc.appearance, valueDisplay, percentageBase: 'Total income' };
    expect(parseDocument(JSON.parse(JSON.stringify(doc))).appearance).toEqual(doc.appearance);
  });

  it('normalizes invalid metadata and deleted references safely', () => {
    const doc = template('budget');
    const parsed = parseDocument({ ...doc, appearance: { valueDisplay: { toString: null }, percentageBase: 'Missing node' } });
    expect(parsed.appearance).toEqual(appearance);
    expect(parseDocument({ ...doc, appearance: { valueDisplay: ['both'], percentageBase: 7 } }).appearance).toEqual(appearance);
    expect(parseDocument({ ...doc, appearance: { percentageBase: ' Total income ' } }).appearance.percentageBase).toBe('Total income');
  });

  it('counts all disconnected source inflows once rather than counting every step', () => {
    const doc = custom([['A', 'B', 5], ['B', 'C', 5], ['X', 'Y', 3]]);
    expect(getPercentageReference(doc)).toEqual({ name: 'Total inflow', value: 8 });
    expect(getPercentageReference(doc, analyze(doc.flows))).toEqual({ name: 'Total inflow', value: 8 });
  });

  it('uses node inflow even when its outflow is larger, and uses outflow for sources', () => {
    const doc = custom([['A', 'B', 5], ['B', 'C', 7]]);
    doc.appearance.percentageBase = 'B';
    expect(getPercentageReference(doc)).toEqual({ name: 'B', value: 5 });
    doc.appearance.percentageBase = 'A';
    expect(getPercentageReference(doc)).toEqual({ name: 'A', value: 5 });
    doc.appearance.percentageBase = 'C';
    expect(getPercentageReference(doc)).toEqual({ name: 'C', value: 7 });
  });

  it('falls back to total inflow for a stale selection or an empty diagram', () => {
    const doc = custom([['A', 'B', 5]]);
    doc.appearance.percentageBase = 'Removed';
    expect(getPercentageReference(doc)).toEqual({ name: 'Total inflow', value: 5 });
    expect(getPercentageReference(custom([]))).toEqual({ name: 'Total inflow', value: 0 });
  });
});

describe('percentage formatting', () => {
  it.each([[1800, 6000, '30%'], [8, 100, '8%'], [20, 25, '80%'], [1, 3, '33.3%'], [0, 100, '0%'], [3, 2, '150%'], [1, 1000, '0.1%']])(
    'formats %s of %s as %s', (value, base, expected) => {
      expect(formatPercentage(value as number, base as number)).toBe(expected);
    },
  );

  it.each([[1, 10000], [Number.MIN_VALUE, 1e15], [1e-200, 1e200]])('keeps a tiny positive percentage visible for %s of %s', (value, base) => {
    expect(formatPercentage(value, base)).toBe('<0.1%');
  });

  it.each([[NaN, 1], [Infinity, 1], [-1, 1], [1, NaN], [1, Infinity], [1, 0], [1, -1], [0, 0]])('handles invalid percentages safely for %s of %s', (value, base) => {
    expect(formatPercentage(value, base)).toBe('—');
  });

  it.each([[Number.MAX_VALUE, Number.MIN_VALUE], [1e15, Number.MIN_VALUE], [1e15, 1e-300], [1e15, 1]])('bounds extreme percentages for %s of %s', (value, base) => {
    const label = formatPercentage(value, base);
    expect(label).toMatch(/^\d(?:\.\d)?e\+\d+%$/);
    expect(label).not.toMatch(/Infinity|NaN|∞/);
    expect(label.length).toBeLessThan(20);
  });
});
