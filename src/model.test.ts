import { describe, expect, it } from 'vitest';
import { analyze, appearance, parseDocument, template } from './model';
import type { Diagram, Flow } from './model';
import { buildLayout } from './layout';
import type { ChartNode } from './layout';

const flows = (rows: [string, string, number][]): Flow[] => rows.map(([from, to, amount], i) => ({ id: String(i), from, to, amount }));
const custom = (f: Flow[]): Diagram => ({ version: 1, id: 'test', kind: 'custom', title: 'Test', unit: 'number', flows: f, appearance });

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
