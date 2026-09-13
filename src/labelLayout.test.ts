import { describe, expect, it } from 'vitest';
import { buildLayout } from './layout';
import type { ChartNode } from './layout';
import { layoutWithLabels } from './labelLayout';
import type { LabelBounds } from './labelLayout';
import { template } from './model';
import type { Diagram } from './model';

type Layout = NonNullable<ReturnType<typeof buildLayout>>;

function diagram(flows: [string, string, number][]): Diagram {
  const doc = template('budget');
  doc.appearance.valueDisplay = 'both';
  doc.flows = flows.map(([from, to, amount], index) => ({ id: String(index), from, to, amount }));
  return doc;
}

// Synthetic measurements reproduce the two label styles without storing any
// private data from the user's diagram. Bounds include the hover edit target.
function measure(layout: Layout, lines = 3): Map<string, LabelBounds> {
  return new Map(layout.graph.nodes.map(node => {
    const first = node.depth === 0;
    const terminal = !node.sourceLinks?.length;
    const barWidth = node.x1! - node.x0!;
    const barHeight = node.y1! - node.y0!;
    const baseline = first || terminal ? barHeight / 2 + 5 - (lines - 1) * 10 : -10 - (lines - 1) * 20;
    const left = first ? -192 : terminal ? barWidth + 12 : barWidth / 2 - 110;
    return [node.name, { left, right: left + (first ? 180 : 220), top: baseline - 19, bottom: baseline + (lines - 1) * 20 + 8 }];
  }));
}

function envelopes(layout: Layout, bounds: ReadonlyMap<string, LabelBounds>) {
  return layout.graph.nodes.map(node => {
    const box = bounds.get(node.name);
    return { name: node.name,
      left: node.x0! + Math.min(0, box?.left ?? 0),
      right: Math.max(node.x1!, node.x0! + (box?.right ?? 0)),
      top: node.y0! + Math.min(0, box?.top ?? 0),
      bottom: node.y0! + Math.max(2, node.y1! - node.y0!, box?.bottom ?? 0) };
  });
}

function assertSeparated(layout: Layout, bounds: ReadonlyMap<string, LabelBounds>) {
  const boxes = envelopes(layout, bounds);
  for (let index = 0; index < boxes.length; index++) {
    const a = boxes[index];
    expect(a.left).toBeGreaterThanOrEqual(12 - 1e-7);
    expect(a.right).toBeLessThanOrEqual(layout.width - 12 + 1e-7);
    expect(a.top).toBeGreaterThanOrEqual(64 - 1e-7);
    expect(a.bottom).toBeLessThanOrEqual(layout.height - 60 + 1e-7);
    for (let other = index + 1; other < boxes.length; other++) {
      const b = boxes[other];
      expect(a.right + 8 <= b.left + 1e-7 || b.right + 8 <= a.left + 1e-7
        || a.bottom + 8 <= b.top + 1e-7 || b.bottom + 8 <= a.top + 1e-7,
      `${a.name} overlaps ${b.name}`).toBe(true);
    }
  }
}

function mixedDiagram() {
  return diagram([
    ['Source', 'Deduction', 70], ['Source', 'Available', 930],
    ['Available', 'Large expense', 170], ['Available', 'Small expense', 20],
    ['Available', 'Reserve', 740], ['Reserve', 'Goal A', 30], ['Reserve', 'Goal B', 710],
  ]);
}

describe('measured label layout', () => {
  it.each([1, 2, 3, 4])('separates mixed terminal and intermediate labels with %s visible lines', lines => {
    const base = buildLayout(mixedDiagram())!;
    const measurements = measure(base, lines);
    const result = layoutWithLabels(base, measurements);
    assertSeparated(result, measurements);
    expect(result.graph.nodes.map(node => node.name)).toEqual(base.graph.nodes.map(node => node.name));
  });

  it('moves overlapping envelopes equally when that minimizes squared displacement', () => {
    const base = buildLayout(diagram([['Source', 'A', 1], ['Source', 'B', 1]]))!;
    const a = base.graph.nodes.find(node => node.name === 'A')!;
    const b = base.graph.nodes.find(node => node.name === 'B')!;
    a.y0 = 200; a.y1 = 210;
    b.y0 = 220; b.y1 = 230;
    const bounds = new Map(['A', 'B'].map(name => [name, { left: 0, right: 20, top: -10, bottom: 30 }]));
    const result = layoutWithLabels(base, bounds);
    expect(result.graph.nodes.find(node => node.name === 'A')!.y0).toBeCloseTo(186);
    expect(result.graph.nodes.find(node => node.name === 'B')!.y0).toBeCloseTo(234);
    expect(result.height).toBe(base.height);
    assertSeparated(result, bounds);
  });

  it('packs long cross-column labels horizontally and grows only the required width', () => {
    const base = buildLayout(diagram([['Start', 'Middle', 1], ['Middle', 'End', 1]]))!;
    const bounds = new Map(base.graph.nodes.map(node => [node.name, { left: -300, right: 500, top: -10, bottom: 0 }]));
    const result = layoutWithLabels(base, bounds);
    expect(result.width).toBe(12 + 3 * 800 + 2 * 8 + 12);
    expect(result.height).toBe(base.height);
    assertSeparated(result, bounds);
    result.headings.forEach(heading => {
      const node = result.graph.nodes.find(item => item.depth === heading.depth)!;
      expect(heading.x).toBe((node.x0! + node.x1!) / 2);
    });
  });


  it('preserves every original column pitch when a wide later label pushes earlier columns left', () => {
    const base = buildLayout(diagram([['Start', 'Middle', 1], ['Middle', 'End', 1]]))!;
    const bounds = new Map<string, LabelBounds>([
      ['Start', { left: -140, right: 13, top: 0, bottom: 10 }],
      ['Middle', { left: -100, right: 100, top: 0, bottom: 10 }],
      ['End', { left: -500, right: 450, top: 0, bottom: 10 }],
    ]);
    const result = layoutWithLabels(base, bounds);
    const pitch = base.headings[1].x - base.headings[0].x;
    const firstWidth = Math.max(153, pitch + 40 - 8);
    expect(result.width).toBeCloseTo(Math.max(base.width, 24 + firstWidth + 200 + 950 + 16));
    for (let index = 1; index < base.headings.length; index++) {
      expect(result.headings[index].x - result.headings[index - 1].x)
        .toBeGreaterThanOrEqual(base.headings[index].x - base.headings[index - 1].x - 1e-7);
    }
    assertSeparated(result, bounds);
  });

  it('grows vertically only enough for complete envelopes and heading/footer clearance', () => {
    const base = buildLayout(diagram([['Source', 'A', 1], ['Source', 'B', 1], ['Source', 'C', 1]]))!;
    const bounds = new Map(base.graph.nodes.filter(node => node.name !== 'Source')
      .map(node => [node.name, { left: 0, right: 80, top: -250, bottom: 250 }]));
    const result = layoutWithLabels(base, bounds);
    expect(result.height).toBe(64 + 3 * 500 + 2 * 8 + 60);
    assertSeparated(result, bounds);
  });

  it('does not move or enlarge a diagram whose measured labels already fit', () => {
    const base = buildLayout(diagram([['Start', 'Finish', 1]]))!;
    const result = layoutWithLabels(base, new Map());
    expect(result.width).toBe(base.width);
    expect(result.height).toBe(base.height);
    result.graph.nodes.forEach((node, index) => {
      expect(node.x0).toBeCloseTo(base.graph.nodes[index].x0!);
      expect(node.x1).toBeCloseTo(base.graph.nodes[index].x1!);
      expect(node.y0).toBeCloseTo(base.graph.nodes[index].y0!);
      expect(node.y1).toBeCloseTo(base.graph.nodes[index].y1!);
    });
  });

  it('preserves the input, all bar/link widths, and stacking order while updating endpoints', () => {
    const base = buildLayout(mixedDiagram())!;
    const snapshot = base.graph.nodes.map(node => ({ x0: node.x0, x1: node.x1, y0: node.y0, y1: node.y1,
      sourceLinks: [...node.sourceLinks!], targetLinks: [...node.targetLinks!] }));
    const originalLinks = base.graph.links.map(link => ({ ...link }));
    const result = layoutWithLabels(base, measure(base));
    result.graph.nodes.forEach((node, index) => {
      const original = base.graph.nodes[index];
      expect(node).not.toBe(original);
      expect(node.x1! - node.x0!).toBeCloseTo(original.x1! - original.x0!);
      expect(node.y1! - node.y0!).toBeCloseTo(original.y1! - original.y0!);
      expect(node.sourceLinks!.map(link => link.ids)).toEqual(original.sourceLinks!.map(link => link.ids));
      expect(node.targetLinks!.map(link => link.ids)).toEqual(original.targetLinks!.map(link => link.ids));
      expect({ x0: original.x0, x1: original.x1, y0: original.y0, y1: original.y1,
        sourceLinks: original.sourceLinks, targetLinks: original.targetLinks }).toEqual(snapshot[index]);
      for (const [side, coordinate] of [['sourceLinks', 'y0'], ['targetLinks', 'y1']] as const) {
        let y = node.y0!;
        node[side]!.forEach(link => {
          expect(link[coordinate]).toBeCloseTo(y + link.width! / 2);
          expect(link[side === 'sourceLinks' ? 'source' : 'target']).toBe(node);
          y += link.width!;
        });
      }
    });
    result.graph.links.forEach((link, index) => {
      expect(link).not.toBe(base.graph.links[index]);
      expect(link.width).toBe(originalLinks[index].width);
      expect(link.value).toBe(originalLinks[index].value);
      expect(link.ids).toEqual(originalLinks[index].ids);
      expect(link.ids).not.toBe(base.graph.links[index].ids);
      expect(base.graph.links[index]).toEqual(originalLinks[index]);
    });
  });

  it('separates 300 flows with mixed tiny values, disconnected sources, and early terminal nodes', () => {
    const flows: [string, string, number][] = [];
    for (let index = 0; index < 100; index++) {
      const value = index === 0 ? 1e15 : index % 2 ? Number.MIN_VALUE : 1;
      flows.push([`Source ${index}`, `Terminal ${index}`, value],
        [`Source ${index}`, `Middle ${index}`, value], [`Middle ${index}`, `End ${index}`, value]);
    }
    const base = buildLayout(diagram(flows))!;
    const bounds = measure(base, 4);
    const result = layoutWithLabels(base, bounds);
    assertSeparated(result, bounds);
    for (let index = 1; index < base.headings.length; index++) {
      expect(result.headings[index].x - result.headings[index - 1].x)
        .toBeGreaterThanOrEqual(base.headings[index].x - base.headings[index - 1].x - 1e-7);
    }
    expect([result.width, result.height, ...result.graph.nodes.flatMap(node => [node.x0, node.x1, node.y0, node.y1]),
      ...result.graph.links.flatMap(link => [link.width, link.y0, link.y1])].every(Number.isFinite)).toBe(true);
    expect(result.graph.links.map(link => link.value)).toEqual(base.graph.links.map(link => link.value));
  });

  it('ignores unavailable or invalid measurements and never writes NaN coordinates', () => {
    const base = buildLayout(diagram([['Start', 'Finish', 1]]))!;
    const bounds = new Map<string, LabelBounds>([
      ['Start', { left: NaN, right: 30, top: -30, bottom: 30 }],
      ['Finish', { left: 0, right: Infinity, top: -30, bottom: 30 }],
    ]);
    const result = layoutWithLabels(base, bounds);
    assertSeparated(result, new Map());
    result.graph.links.forEach(link => {
      expect(result.graph.nodes).toContain(link.source as ChartNode);
      expect(result.graph.nodes).toContain(link.target as ChartNode);
    });
  });
});
