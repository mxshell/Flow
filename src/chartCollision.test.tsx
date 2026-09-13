// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, render } from '@testing-library/react';
import SankeyChart from './SankeyChart';
import { appearance, defaultNumberSettings, renameNode } from './model';
import type { Diagram } from './model';
import { buildLayout } from './layout';
import { exportSvg } from './imageExport';

type Box = { x: number; y: number; width: number; height: number };
type NamedBox = Box & { name: string };
const observers: { callback: ResizeObserverCallback; target?: Element }[] = [];
let fonts: EventTarget;
let glyphScale = 1;
let ascent = 0.82;
let descent = 0.24;
let measurementReads = 0;
const originalBBox = Object.getOwnPropertyDescriptor(SVGElement.prototype, 'getBBox');
const originalTextLength = Object.getOwnPropertyDescriptor(SVGElement.prototype, 'getComputedTextLength');
const originalViewBox = Object.getOwnPropertyDescriptor(SVGElement.prototype, 'viewBox');
const originalFonts = Object.getOwnPropertyDescriptor(document, 'fonts');

function numeric(element: Element, name: string, fallback = 0): number {
  const value = element.getAttribute(name);
  return value === null ? fallback : Number(value);
}

function inherited(element: Element, name: string, fallback: string): string {
  let current: Element | null = element;
  while (current) {
    const value = current.getAttribute(name);
    if (value !== null) return value;
    current = current.parentElement;
  }
  return fallback;
}

function union(boxes: Box[]): Box {
  if (!boxes.length) return { x: 0, y: 0, width: 0, height: 0 };
  const x = Math.min(...boxes.map(box => box.x));
  const y = Math.min(...boxes.map(box => box.y));
  return { x, y, width: Math.max(...boxes.map(box => box.x + box.width)) - x,
    height: Math.max(...boxes.map(box => box.y + box.height)) - y };
}

// JSDOM has no SVG font engine. Model natural glyph widths, ascenders,
// descenders, anchoring, and fitted text independently of the layout solver.
function textLength(element: Element): number {
  if (element.hasAttribute('textLength')) return numeric(element, 'textLength');
  const fontSize = Number(inherited(element, 'font-size', '15'));
  const spacing = Number(inherited(element, 'letter-spacing', '0'));
  const characters = Array.from(element.textContent ?? '');
  const glyphs = characters.reduce((sum, character) => sum +
    (/\s/.test(character) ? 0.3 : /[ilI1.,:;!'|]/.test(character) ? 0.29 : /[MW@%]/.test(character) ? 0.89 : /[A-Z0-9]/.test(character) ? 0.63 : 0.53), 0);
  return glyphs * fontSize * glyphScale + Math.max(0, characters.length - 1) * spacing;
}

function localBox(element: Element): Box {
  if (element.tagName.toLowerCase() === 'text' && element.querySelector('tspan')) {
    return union(Array.from(element.querySelectorAll('tspan'), localBox));
  }
  if (['text', 'tspan'].includes(element.tagName.toLowerCase())) {
    const width = textLength(element);
    const size = Number(inherited(element, 'font-size', '15'));
    const anchor = inherited(element, 'text-anchor', 'start');
    const x = numeric(element, 'x') - (anchor === 'middle' ? width / 2 : anchor === 'end' ? width : 0);
    return { x, y: numeric(element, 'y') - size * ascent, width, height: size * (ascent + descent) };
  }
  return { x: numeric(element, 'x'), y: numeric(element, 'y'), width: numeric(element, 'width'), height: numeric(element, 'height') };
}

function globalBox(element: Element): Box {
  const box = localBox(element);
  let current: Element | null = element;
  while (current) {
    const transform = current.getAttribute('transform');
    const match = transform?.match(/translate\(\s*([-\d.eE]+)(?:[\s,]+([-\d.eE]+))?\s*\)/);
    if (match) { box.x += Number(match[1]); box.y += Number(match[2] ?? 0); }
    current = current.parentElement;
  }
  return box;
}

function overlap(first: Box, second: Box): boolean {
  const tolerance = 0.02;
  return first.x < second.x + second.width - tolerance && second.x < first.x + first.width - tolerance
    && first.y < second.y + second.height - tolerance && second.y < first.y + first.height - tolerance;
}

function assertSeparate(boxes: NamedBox[]) {
  for (let index = 0; index < boxes.length; index++) {
    for (const other of boxes.slice(index + 1)) {
      expect(overlap(boxes[index], other), `${boxes[index].name} overlaps ${other.name}`).toBe(false);
    }
  }
}

function dimensions(svg: SVGSVGElement) {
  const [x, y, width, height] = svg.getAttribute('viewBox')!.split(/\s+/).map(Number);
  return { x, y, width, height };
}

function assertClearChart(svg: SVGSVGElement) {
  const bounds = dimensions(svg);
  const visibleTexts = Array.from(svg.querySelectorAll('text')).filter(text => text.getAttribute('opacity') !== '0');
  const textBoxes = visibleTexts.map((text, index) => ({ ...globalBox(text), name: `${index}: ${text.textContent}` }));
  const labels = Array.from(svg.querySelectorAll<SVGGElement>('[data-node-label]'), group => ({
    ...union(Array.from(group.querySelectorAll('text, .node-name-hit, .node-balance-action > rect'), globalBox)),
    name: group.dataset.nodeLabel!,
  })).filter(box => box.width > 0 && box.height > 0);
  assertSeparate(textBoxes);
  assertSeparate(labels);
  for (const box of [...textBoxes, ...labels]) {
    expect(box.x, `${box.name} exceeds the left edge`).toBeGreaterThanOrEqual(bounds.x - 0.02);
    expect(box.y, `${box.name} exceeds the top edge`).toBeGreaterThanOrEqual(bounds.y - 0.02);
    expect(box.x + box.width, `${box.name} exceeds the right edge`).toBeLessThanOrEqual(bounds.x + bounds.width + 0.02);
    expect(box.y + box.height, `${box.name} exceeds the bottom edge`).toBeLessThanOrEqual(bounds.y + bounds.height + 0.02);
  }
  const bars = Array.from(svg.querySelectorAll('.node-select > rect'), globalBox);
  for (const label of labels) {
    for (const bar of bars) expect(overlap(label, bar), `${label.name} overlaps a node bar`).toBe(false);
  }
}

function branchingDiagram(): Diagram {
  const edges: [string, string, number][] = [
    ['Total regional resources', 'Initial reserve', 100],
    ['Total regional resources', 'Operating allocation', 900],
    ['Operating allocation', 'Workstream Alpha', 50],
    ['Operating allocation', 'Workstream Bravo', 30],
    ['Operating allocation', 'Workstream Charlie', 20],
    ['Operating allocation', 'Workstream Delta', 40],
    ['Operating allocation', 'Workstream Echo', 60],
    ['Operating allocation', 'Continuing programme', 700],
    ['Continuing programme', 'Delivery East', 200],
    ['Continuing programme', 'Delivery North', 200],
    ['Continuing programme', 'Delivery South', 300],
  ];
  return {
    version: 2, id: 'collision-example', title: 'Regional allocation', kind: 'custom',
    ...defaultNumberSettings, columnTitles: ['Resources', 'Initial allocation', 'Workstreams', 'Delivery'],
    appearance: { ...appearance, valueDisplay: 'both' },
    flows: edges.map(([from, to, amount], index) => ({ id: `edge-${index}`, from, to, amount })),
  };
}

function Chart({ doc, zoom = 100 }: { doc: Diagram; zoom?: number }) {
  return <div><div><SankeyChart doc={doc} selected={null} onSelect={() => {}}
    onRenameColumn={() => {}} onRenameNode={(oldName, newName, allowMerge) => renameNode(doc, oldName, newName, allowMerge)}
    onBalanceAction={() => {}} zoom={zoom} /></div></div>;
}

async function settle() {
  await act(async () => { await new Promise(resolve => setTimeout(resolve, 0)); });
  const reads = measurementReads;
  await act(async () => { await Promise.resolve(); });
  expect(measurementReads, 'Measurements should converge rather than continuously relayout').toBe(reads);
}

async function resize(width: number) {
  await act(async () => {
    for (const observer of observers) {
      if (observer.target) observer.callback([{ target: observer.target, contentRect: { width } } as ResizeObserverEntry], {} as ResizeObserver);
    }
  });
  await settle();
}

beforeEach(() => {
  observers.length = 0;
  glyphScale = 1;
  ascent = 0.82;
  descent = 0.24;
  measurementReads = 0;
  vi.stubGlobal('ResizeObserver', class {
    record: { callback: ResizeObserverCallback; target?: Element };
    constructor(callback: ResizeObserverCallback) { this.record = { callback }; observers.push(this.record); }
    observe(target: Element) { this.record.target = target; }
    unobserve() { this.record.target = undefined; }
    disconnect() { this.record.target = undefined; }
  });
  fonts = new EventTarget();
  Object.defineProperty(document, 'fonts', { configurable: true, value: Object.assign(fonts, { ready: Promise.resolve() }) });
  Object.defineProperty(SVGElement.prototype, 'getBBox', { configurable: true, value(this: SVGElement) {
    measurementReads++;
    if (measurementReads > 4000) throw new Error('SVG measurements did not converge');
    const box = localBox(this);
    return new DOMRect(box.x, box.y, box.width, box.height);
  } });
  Object.defineProperty(SVGElement.prototype, 'getComputedTextLength', { configurable: true, value(this: SVGElement) { return textLength(this); } });
  Object.defineProperty(SVGElement.prototype, 'viewBox', { configurable: true, get(this: SVGSVGElement) { return { baseVal: dimensions(this) }; } });
});

afterEach(() => {
  cleanup();
  const restore = (target: object, name: string, descriptor?: PropertyDescriptor) => {
    if (descriptor) Object.defineProperty(target, name, descriptor);
    else Reflect.deleteProperty(target, name);
  };
  restore(SVGElement.prototype, 'getBBox', originalBBox);
  restore(SVGElement.prototype, 'getComputedTextLength', originalTextLength);
  restore(SVGElement.prototype, 'viewBox', originalViewBox);
  restore(document, 'fonts', originalFonts);
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('measured label collisions in the mounted chart', () => {
  it('separates early terminals from large intermediate labels at desktop and narrow viewport widths', async () => {
    const doc = branchingDiagram();
    const { container, rerender } = render(<Chart doc={doc} />);
    await settle();
    const svg = container.querySelector('svg#sankey-diagram') as SVGSVGElement;
    expect(svg.querySelectorAll('[data-node-label]')).toHaveLength(12);
    assertClearChart(svg);
    const base = buildLayout(doc, 1000)!;
    expect(dimensions(svg).width).toBeGreaterThanOrEqual(base.width);
    expect(Array.from(svg.querySelectorAll('.sankey-link'), link => Number(link.getAttribute('stroke-width'))))
      .toEqual(base.graph.links.map(link => Math.max(1, link.width ?? 1)));
    await resize(2400);
    assertClearChart(svg);
    await resize(360);
    assertClearChart(svg);
    expect(Number.parseFloat(svg.style.minWidth)).toBe(dimensions(svg).width);
    rerender(<Chart doc={doc} zoom={160} />);
    await settle();
    assertClearChart(svg);
    expect(Number.parseFloat(svg.style.minWidth)).toBeCloseTo(dimensions(svg).width * 1.6);
    expect(measurementReads).toBeLessThan(1500);
  });

  it('remeasures after fonts load and keeps formats, number modes, and label visibility collision-free', async () => {
    let doc = branchingDiagram();
    const { container, rerender } = render(<Chart doc={doc} />);
    const svg = container.querySelector('svg#sankey-diagram') as SVGSVGElement;
    await settle();
    const initialReads = measurementReads;
    glyphScale = 1.32;
    ascent = 0.97;
    descent = 0.3;
    await act(async () => { fonts.dispatchEvent(new Event('loadingdone')); });
    await settle();
    expect(measurementReads).toBeGreaterThan(initialReads);
    assertClearChart(svg);

    const variants: Partial<Diagram['appearance']>[] = [
      { labels: false, valueDisplay: 'both' },
      { labels: true, valueDisplay: 'percentages' },
      { labels: true, valueDisplay: 'values' },
      { labels: true, values: false },
      { labels: false, values: false },
      { labels: true, values: true, valueDisplay: 'both' },
    ];
    for (const [index, variant] of variants.entries()) {
      doc = { ...doc, numberFormat: index % 2 === 0 ? 'decimal' : 'integer',
        appearance: { ...doc.appearance, ...variant },
        flows: branchingDiagram().flows.map(flow => ({ ...flow, amount: flow.amount * 1234567.89 })) };
      rerender(<Chart doc={doc} />);
      await settle();
      assertClearChart(svg);
    }
    // An imbalance introduces an additional action row above an intermediate bar.
    doc = { ...doc, numberFormat: 'currency', currency: 'SGD', flows: doc.flows.filter(flow => flow.to !== 'Workstream Echo') };
    rerender(<Chart doc={doc} />);
    await settle();
    expect(svg.querySelectorAll('.node-balance-action')).toHaveLength(1);
    assertClearChart(svg);
    expect(measurementReads).toBeLessThan(3000);
  });

  it('exports the resolved positions and preserves fitted widths with a portable font', async () => {
    const doc = branchingDiagram();
    const { container } = render(<Chart doc={doc} />);
    await settle();
    await resize(420);
    const source = container.querySelector('svg#sankey-diagram') as SVGSVGElement;
    const exported = exportSvg(source, doc.title, doc.appearance.opacity);
    expect(exported.getAttribute('viewBox')).toBe(source.getAttribute('viewBox'));
    expect(Number(exported.getAttribute('width'))).toBe(dimensions(source).width);
    expect(Number(exported.getAttribute('height'))).toBe(dimensions(source).height);
    expect(exported.querySelector('[data-export-omit]')).toBeNull();
    const geometry = (svg: SVGSVGElement) => Array.from(svg.querySelectorAll('.node-select > rect'), bar =>
      ['x', 'y', 'width', 'height'].map(attribute => bar.getAttribute(attribute)));
    expect(geometry(exported)).toEqual(geometry(source));
    expect(Array.from(exported.querySelectorAll('.sankey-link'), link => [link.getAttribute('d'), link.getAttribute('stroke-width')]))
      .toEqual(Array.from(source.querySelectorAll('.sankey-link'), link => [link.getAttribute('d'), link.getAttribute('stroke-width')]));
    const sourceTexts = Array.from(source.querySelectorAll<SVGTextElement>('text[data-max-width]'));
    const exportedTexts = Array.from(exported.querySelectorAll<SVGTextElement>('text[data-max-width]'));
    expect(exportedTexts).toHaveLength(sourceTexts.length);
    exportedTexts.forEach((text, index) => {
      expect(text.getAttribute('x')).toBe(sourceTexts[index].getAttribute('x'));
      expect(text.getAttribute('y')).toBe(sourceTexts[index].getAttribute('y'));
      expect(Number(text.getAttribute('textLength'))).toBeCloseTo(textLength(sourceTexts[index]));
      expect(text.getAttribute('lengthAdjust')).toBe('spacingAndGlyphs');
    });
    // The fallback glyphs can be wider; explicit export widths must still keep
    // the already-resolved labels separate without recomputing the diagram.
    glyphScale = 1.6;
    assertClearChart(exported);
    expect(exported.style.minWidth).toBe('');
    expect(exported.style.fontFamily).toBe('Arial, sans-serif');
  });
});
