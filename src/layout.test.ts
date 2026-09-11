import { describe, expect, it } from 'vitest';
import { buildLayout } from './layout';
import { template } from './model';

describe('layout numeric stability', () => {
  it.each([Number.MIN_VALUE, 1e-320, 1e-200])('lays out tiny positive values (%s) with finite coordinates', amount => {
    const doc = template('budget');
    doc.flows = [{ id: 'a', from: 'Source', to: 'Destination', amount }];
    const before = JSON.stringify(doc);
    const result = buildLayout(doc)!;
    for (const node of result.graph.nodes) {
      expect([node.x0, node.x1, node.y0, node.y1].every(Number.isFinite)).toBe(true);
      expect(node.y1! - node.y0!).toBeGreaterThan(0);
      expect(node.value).toBe(amount);
    }
    expect(result.graph.links[0].width).toBeGreaterThan(0);
    expect(result.graph.links[0].value).toBe(amount);
    expect(JSON.stringify(doc)).toBe(before);
  });

  it('preserves displayed values and finite geometry across extreme magnitudes', () => {
    const doc = template('budget');
    doc.flows = [
      { id: 'a', from: 'Large source', to: 'Large destination', amount: 1e15 },
      { id: 'b', from: 'Tiny source', to: 'Middle', amount: Number.MIN_VALUE },
      { id: 'c', from: 'Middle', to: 'Tiny destination', amount: Number.MIN_VALUE },
    ];
    const result = buildLayout(doc)!;
    for (const node of result.graph.nodes) {
      expect([node.x0, node.x1, node.y0, node.y1].every(Number.isFinite)).toBe(true);
    }
    for (const link of result.graph.links) {
      expect([link.width, link.y0, link.y1].every(Number.isFinite)).toBe(true);
    }
    expect(result.graph.links.map(link => link.value)).toEqual(doc.flows.map(flow => flow.amount));
  });
});
