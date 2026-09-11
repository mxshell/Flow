import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { columnTitle, defaultColumnTitles, parseDocument, renameColumn, template } from './model';
import type { Diagram, Flow } from './model';
import { buildLayout } from './layout';
import SankeyChart from './SankeyChart';
import ColumnTitle from './ColumnTitle';

const flow = (from: string, to: string, id = from): Flow => ({ id, from, to, amount: 10 });
const custom = (): Diagram => ({ ...template('budget'), kind: 'custom', columnTitles: [], flows: [flow('A', 'B'), flow('B', 'C')] });

const renderedTitle = (title: string, width: number) => renderToStaticMarkup(
  <svg><ColumnTitle title={title} depth={0} x={100} width={width} onRename={() => {}} /></svg>,
);
const renderedLines = (markup: string) => [...markup.matchAll(/<tspan\b([^>]*)>([^<]*)<\/tspan>/g)]
  .map(match => ({ attributes: match[1], text: match[2] }));

describe('column-title wrapping', () => {
  it.each(['ß', 'ﬃ'])('keeps the complete uppercase expansion of %s in three lines', character => {
    const title = character.repeat(60);
    const lines = renderedLines(renderedTitle(title, 160));
    expect(lines).toHaveLength(3);
    expect(lines.map(line => line.text).join('')).toBe(title.toUpperCase());
    expect(lines.map(line => Number(line.attributes.match(/y="(\d+)"/)?.[1]))).toEqual([18, 31, 44]);
  });
  it.each(['👩‍💻', 'e\u0301'])('wraps %s without splitting its graphemes', grapheme => {
    const title = grapheme.repeat(Math.floor(60 / grapheme.length));
    const lines = renderedLines(renderedTitle(title, 80));
    expect(lines.length).toBeLessThanOrEqual(3);
    expect(lines.map(line => line.text).join('')).toBe(title.toUpperCase());
    for (const line of lines) {
      expect(line.text.split(grapheme.toUpperCase()).join('')).toBe('');
    }
  });
  it.each(['W', '界'])('constrains wide %s headings to their allocated text area', character => {
    const lines = renderedLines(renderedTitle(character.repeat(60), 160));
    expect(lines).toHaveLength(3);
    for (const line of lines) {
      expect(line.attributes).toContain('textLength="122"');
      expect(line.attributes).toContain('lengthAdjust="spacingAndGlyphs"');
    }
  });
  it('leaves ordinary short headings at their natural width', () => {
    const lines = renderedLines(renderedTitle('Income', 220));
    expect(lines).toHaveLength(1);
    expect(lines[0].text).toBe('INCOME');
    expect(lines[0].attributes).not.toContain('textLength');
    expect(lines[0].attributes).not.toContain('lengthAdjust');
  });
});

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
          // D3 relaxation may cross the bound by a floating-point rounding error.
          expect(node.y0).toBeGreaterThanOrEqual(100 - 1e-8);
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
