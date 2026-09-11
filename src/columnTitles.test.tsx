import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { columnTitle, defaultColumnTitles, parseDocument, renameColumn, template } from './model';
import type { Diagram, Flow } from './model';
import { buildLayout } from './layout';
import SankeyChart from './SankeyChart';

const flow = (from: string, to: string, id = from): Flow => ({ id, from, to, amount: 10 });
const custom = (): Diagram => ({ ...template('budget'), kind: 'custom', columnTitles: [], flows: [flow('A', 'B'), flow('B', 'C')] });

describe('consistent column titles', () => {
  it.each(['budget', 'business', 'jobs'] as const)('renders an editable title for every %s column', kind => {
    const doc = template(kind);
    const result = buildLayout(doc)!;
    const html = renderToStaticMarkup(<SankeyChart doc={doc} selected={null} onSelect={() => {}} onRenameColumn={() => {}} zoom={100} />);
    const titles = defaultColumnTitles(kind);
    expect(result.headings).toHaveLength(titles.length);
    titles.forEach((title, i) => expect(html).toContain(`aria-label="Rename column ${i + 1}: ${title}"`));
  });
  it('gives custom and newly added columns editable fallback titles', () => {
    const doc = custom();
    const html = renderToStaticMarkup(<SankeyChart doc={doc} selected={null} onSelect={() => {}} onRenameColumn={() => {}} zoom={100} />);
    expect(html).toContain('Rename column 1: Column 1');
    expect(html).toContain('Rename column 3: Column 3');
    doc.flows.push(flow('C', 'D'));
    const result = buildLayout(doc)!;
    expect(result.headings).toHaveLength(4);
    expect(columnTitle(doc, 3)).toBe('Column 4');
  });
  it('aligns headings with actual node centers across widths and node sizes', () => {
    for (const width of [780, 1000, 2000]) {
      const doc = template('business');
      doc.appearance.nodeWidth = 28;
      const result = buildLayout(doc, width)!;
      for (const heading of result.headings) {
        const nodes = result.graph.nodes.filter(n => n.depth === heading.depth);
        expect(nodes.length).toBeGreaterThan(0);
        for (const node of nodes) {
          expect(heading.x).toBeCloseTo((node.x0! + node.x1!) / 2);
          expect(node.y0).toBeGreaterThanOrEqual(100);
        }
      }
    }
  });
  it('keeps headings independent of node-name visibility and produces ordinary SVG text', () => {
    const doc = renameColumn(template('jobs'), 3, 'Final interviews');
    doc.appearance.labels = false;
    const html = renderToStaticMarkup(<SankeyChart doc={doc} selected={null} onSelect={() => {}} onRenameColumn={() => {}} zoom={100} />);
    expect(html).toContain('FINAL INTERVIEWS</tspan>');
    expect(html).not.toContain('<foreignObject');
    expect(html).toContain('data-export-omit="true"');
  });
});

describe('column-title persistence', () => {
  it('renames without mutating earlier undo states or flow values', () => {
    const before = template('budget');
    const after = renameColumn(before, 1, '  Take-home income  ');
    expect(columnTitle(before, 1)).toBe('Total');
    expect(columnTitle(after, 1)).toBe('Take-home income');
    expect(after.flows).toBe(before.flows);
    expect(parseDocument(JSON.parse(JSON.stringify(after))).columnTitles).toEqual(after.columnTitles);
  });
  it('preserves titles for columns that disappear and later return', () => {
    const doc = renameColumn(custom(), 2, 'Outcome');
    const shorter = { ...doc, flows: [flow('A', 'B')] };
    expect(buildLayout(shorter)!.headings).toHaveLength(2);
    const reloaded = parseDocument(JSON.parse(JSON.stringify(shorter)));
    reloaded.flows.push(flow('B', 'C'));
    expect(columnTitle(reloaded, 2)).toBe('Outcome');
    expect(buildLayout(reloaded)!.headings).toHaveLength(3);
  });
  it.each([1, 2])('adds defaults to older version %s files without titles', version => {
    const { columnTitles: _titles, ...doc } = template('budget');
    const parsed = parseDocument({ ...doc, version, ...(version === 1 ? { unit: 'USD' } : {}) });
    expect(parsed.columnTitles).toEqual(['Income', 'Total', 'Allocation']);
  });
  it('sanitizes titles without shifting column positions', () => {
    const doc = parseDocument({ ...custom(), columnTitles: [' Start ', null, 'Finish\nline', 'x'.repeat(90)] });
    expect(doc.columnTitles).toEqual(['Start', '', 'Finish line', 'x'.repeat(60)]);
    expect(columnTitle(doc, 1)).toBe('Column 2');
    expect(columnTitle(renameColumn(doc, 0, '   '), 0)).toBe('Column 1');
  });
});
