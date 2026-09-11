// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import SankeyChart from './SankeyChart';
import { buildLayout } from './layout';
import { exportSvg } from './imageExport';
import { renameNode, template } from './model';
import type { Diagram } from './model';

beforeEach(() => {
  vi.stubGlobal('ResizeObserver', class { observe() {} disconnect() {} });
  Object.defineProperty(document, 'fonts', { configurable: true, value: {
    ready: Promise.resolve(), addEventListener: vi.fn(), removeEventListener: vi.fn(),
  } });
  Object.defineProperty(SVGElement.prototype, 'getComputedTextLength', { configurable: true, value() { return (this.textContent?.length ?? 0) * 7; } });
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

function show(doc: Diagram, onBalanceAction = vi.fn()) {
  return render(<SankeyChart doc={doc} selected={null} onSelect={() => {}} onRenameColumn={() => {}}
    onRenameNode={(oldName, newName, allowMerge) => renameNode(doc, oldName, newName, allowMerge)}
    onBalanceAction={onBalanceAction} zoom={100} />);
}
function node(container: HTMLElement, name: string) {
  const button = Array.from(container.querySelectorAll('[data-node-name]')).find(item => item.getAttribute('data-node-name') === name);
  if (!button?.parentElement?.parentElement) throw new Error(`Missing node ${name}`);
  return button.parentElement.parentElement;
}

describe('chart numbers and balance actions', () => {
  it('shows amounts and percentages with one explicit reference in the diagram', () => {
    const doc = template('jobs');
    doc.appearance.valueDisplay = 'both';
    const { container } = show(doc);
    expect(node(container, 'Offers').textContent).toContain('8%');
    expect(node(container, 'Applications').textContent).toContain('100%');
    expect(container.querySelector('.percentage-reference')?.textContent).toBe('Percentages of Total inflow (100)');
  });
  it('recalculates every percentage against the selected node and keeps its base visible', () => {
    const doc = template('jobs');
    doc.appearance.valueDisplay = 'percentages';
    doc.appearance.percentageBase = 'Interviews';
    const { container } = show(doc);
    expect(node(container, 'Offers').textContent).toContain('40%');
    expect(node(container, 'Interviews').textContent).toContain('100%');
    expect(container.querySelector('.percentage-reference')?.textContent).toBe('Percentages of Interviews (20)');
  });
  it('uses inflow for overallocated nodes so the value and percentage share the same meaning', () => {
    const doc = template('budget');
    doc.flows[2].amount += 600;
    doc.appearance.valueDisplay = 'both';
    const onBalanceAction = vi.fn();
    const { container } = show(doc, onBalanceAction);
    const total = node(container, 'Total income');
    expect(total.textContent).toContain('$6,000.00');
    expect(total.textContent).toContain('100%');
    const action = screen.getByRole('button', { name: 'Review flows for Total income: $600.00 more out than in' });
    fireEvent.keyDown(action, { key: 'Enter' });
    expect(onBalanceAction).toHaveBeenCalledExactlyOnceWith('Total income');
  });
  it('offers remaining allocation only at an intermediate node', () => {
    const doc = template('budget');
    doc.flows = doc.flows.filter(flow => flow.to !== 'A little fun');
    const onBalanceAction = vi.fn();
    show(doc, onBalanceAction);
    const action = screen.getByRole('button', { name: 'Add remaining flow from Total income: $400.00 left to allocate' });
    fireEvent.click(action);
    expect(onBalanceAction).toHaveBeenCalledExactlyOnceWith('Total income');
    expect(screen.queryByRole('button', { name: /Add remaining flow from Housing/ })).toBeNull();
    expect(screen.queryByRole('button', { name: /Add remaining flow from Salary/ })).toBeNull();
  });
  it('hides all numeric labels and the percentage caption together', () => {
    const doc = template('jobs');
    doc.appearance.valueDisplay = 'both';
    doc.appearance.values = false;
    const { container } = show(doc);
    expect(container.querySelector('.percentage-reference')).toBeNull();
    expect(node(container, 'Offers').querySelectorAll('text')).toHaveLength(1);
  });
  it('reserves room between small adjacent nodes for names and two numeric lines', () => {
    const doc = template('budget');
    doc.appearance.valueDisplay = 'both';
    doc.flows = Array.from({ length: 12 }, (_, index) => ({ id: String(index), from: 'Income', to: `Expense ${index}`, amount: index === 0 ? 100000 : 1 }));
    const layout = buildLayout(doc)!;
    const destinations = layout.graph.nodes.filter(item => item.name !== 'Income');
    for (let index = 1; index < destinations.length; index++) {
      const previous = destinations[index - 1], current = destinations[index];
      expect((current.y0! + current.y1!) / 2 - (previous.y0! + previous.y1!) / 2).toBeGreaterThanOrEqual(46);
    }
  });
});

describe('editing a dense diagram', () => {
  it('keeps small intermediate labels clear of the previous bar and label', () => {
    const doc = template('budget');
    doc.appearance.valueDisplay = 'both';
    doc.flows = [
      { id: '1', from: 'Start', to: 'Large middle', amount: 100000 },
      { id: '2', from: 'Start', to: 'Small A', amount: 2 },
      { id: '3', from: 'Start', to: 'Small B', amount: 2 },
      { id: '4', from: 'Large middle', to: 'End', amount: 100000 },
      { id: '5', from: 'Small A', to: 'End', amount: 1 },
      { id: '6', from: 'Small B', to: 'End', amount: 1 },
    ];
    const { container } = show(doc);
    const middleNames = ['Large middle', 'Small A', 'Small B'];
    for (let index = 1; index < middleNames.length; index++) {
      const previous = node(container, middleNames[index - 1]);
      const current = node(container, middleNames[index]);
      const bar = previous.querySelector('.node-select rect')!;
      const label = current.querySelector('.node-name-hit')!;
      expect(Number(label.getAttribute('y'))).toBeGreaterThan(Number(bar.getAttribute('y')) + Number(bar.getAttribute('height')));
    }
  });
  it('paints an open editor above its own labels and other nodes, without hover tooltips', () => {
    const doc = template('budget');
    doc.appearance.valueDisplay = 'both';
    doc.flows = doc.flows.filter(flow => flow.to !== 'A little fun');
    const { container } = show(doc);
    fireEvent.click(screen.getByRole('button', { name: 'Rename node: Total income' }));
    const edited = node(container, 'Total income');
    expect(edited.lastElementChild?.querySelector('foreignObject')).not.toBeNull();
    expect(Array.from(container.querySelectorAll('.sankey-node')).at(-1)).toBe(edited);
    fireEvent.mouseEnter(container.querySelector('.sankey-link')!);
    expect(container.querySelector('.chart-tooltip')).toBeNull();
  });
});

describe('SVG export during editing', () => {
  it('keeps saved names, numbers and their denominator while removing interactive controls', () => {
    const doc = template('budget');
    doc.flows = doc.flows.filter(flow => flow.to !== 'A little fun');
    doc.appearance.valueDisplay = 'both';
    const { container } = show(doc);
    fireEvent.click(screen.getByRole('button', { name: 'Rename node: Total income' }));
    const source = container.querySelector('svg#sankey-diagram') as SVGSVGElement;
    const layout = buildLayout(doc)!;
    Object.defineProperty(source, 'viewBox', { configurable: true, value: { baseVal: { width: layout.width, height: layout.height } } });
    expect(source.querySelector('foreignObject')).not.toBeNull();
    const exported = exportSvg(source, doc.title, doc.appearance.opacity);
    expect(exported.querySelector('foreignObject')).toBeNull();
    expect(exported.querySelector('[data-export-omit]')).toBeNull();
    expect(exported.querySelector('.node-balance-action')).toBeNull();
    expect(exported.querySelector('.node-name-pencil')).toBeNull();
    expect(exported.querySelector('.percentage-reference')?.textContent).toBe('Percentages of Total inflow ($6,000.00)');
    const savedName = Array.from(exported.querySelectorAll('.node-name-text')).find(element => element.textContent === 'Total income');
    expect(savedName?.getAttribute('opacity')).toBe('1');
    expect(exported.querySelector('[role="button"]')).toBeNull();
    expect(source.querySelector('foreignObject')).not.toBeNull();
  });
});
