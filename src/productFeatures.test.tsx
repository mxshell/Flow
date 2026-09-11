// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import App from './App';
import { analyze, template } from './model';
import type { Diagram } from './model';
import { STORAGE_KEY } from './storage';

beforeEach(() => {
  localStorage.clear();
  vi.stubGlobal('ResizeObserver', class {
    observe() {}
    unobserve() {}
    disconnect() {}
  });
  vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => window.setTimeout(() => callback(performance.now()), 0));
  vi.stubGlobal('cancelAnimationFrame', (id: number) => window.clearTimeout(id));
  Object.defineProperty(document, 'fonts', { configurable: true, value: {
    ready: Promise.resolve(), addEventListener: vi.fn(), removeEventListener: vi.fn(),
  } });
  Object.defineProperty(SVGElement.prototype, 'getComputedTextLength', {
    configurable: true, value() { return (this.textContent?.length ?? 0) * 7; },
  });
  Object.defineProperty(Element.prototype, 'scrollIntoView', { configurable: true, value: vi.fn() });
});

afterEach(() => {
  cleanup();
  localStorage.clear();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

function savedDiagram(): Diagram {
  const raw = localStorage.getItem(STORAGE_KEY);
  if (!raw) throw new Error('The diagram was not saved.');
  const library = JSON.parse(raw) as { activeId: string; docs: Diagram[] };
  const diagram = library.docs.find(doc => doc.id === library.activeId);
  if (!diagram) throw new Error('The saved active diagram was not found.');
  return diagram;
}

function mountDiagram(doc: Diagram) {
  return render(<App initialLibrary={{ docs: [doc], activeId: doc.id }} />);
}

function nodeGroup(name: string) {
  const node = screen.getByRole('button', { name: `Rename node: ${name}` }).closest('.sankey-node');
  if (!(node instanceof SVGElement)) throw new Error(`No chart node for ${name}`);
  return within(node as unknown as HTMLElement);
}

describe('editing node names in the actual application', () => {
  it('renames every connected flow together and restores them with a single Undo', async () => {
    const user = userEvent.setup();
    const original = template('budget');
    original.appearance.percentageBase = 'Total income';
    mountDiagram(original);
    await user.click(screen.getByRole('button', { name: 'Rename node: Total income' }));
    const input = screen.getByRole('textbox', { name: 'Name for node: Total income' });
    await user.clear(input);
    await user.type(input, 'Monthly income');
    await user.keyboard('{Enter}');

    await waitFor(() => expect(screen.queryByRole('textbox', { name: 'Name for node: Total income' })).toBeNull());
    const renamed = savedDiagram();
    expect(renamed.flows).toHaveLength(original.flows.length);
    expect(renamed.flows.map(flow => flow.id)).toEqual(original.flows.map(flow => flow.id));
    expect(renamed.flows.every(flow => flow.from !== 'Total income' && flow.to !== 'Total income')).toBe(true);
    expect(renamed.appearance.percentageBase).toBe('Monthly income');
    for (const flow of renamed.flows) {
      expect((screen.getByRole('combobox', { name: `From ${flow.from} to ${flow.to}` }) as HTMLInputElement).value).toBe(flow.from);
      expect((screen.getByRole('combobox', { name: `To for ${flow.from} to ${flow.to}` }) as HTMLInputElement).value).toBe(flow.to);
    }

    await user.click(screen.getByRole('button', { name: 'Undo' }));
    expect(savedDiagram().flows).toEqual(original.flows);
    expect(savedDiagram().appearance.percentageBase).toBe('Total income');
    expect(screen.getByRole('button', { name: 'Rename node: Total income' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Undo' }).hasAttribute('disabled')).toBe(true);
  });

  it('waits for explicit merge confirmation and keeps all flow rows undoable', async () => {
    const user = userEvent.setup();
    const original = template('budget');
    mountDiagram(original);
    await user.click(screen.getByRole('button', { name: 'Rename node: Salary' }));
    const input = screen.getByRole('textbox', { name: 'Name for node: Salary' });
    await user.clear(input);
    await user.type(input, 'Freelance');
    await user.keyboard('{Enter}');
    expect(screen.getByRole('alert').textContent).toContain('Merge');
    expect(savedDiagram().flows).toEqual(original.flows);
    await user.click(screen.getByRole('button', { name: 'Merge nodes' }));
    expect(savedDiagram().flows).toHaveLength(original.flows.length);
    expect(savedDiagram().flows.filter(flow => flow.from === 'Freelance')).toHaveLength(2);
    expect(screen.queryByRole('button', { name: 'Rename node: Salary' })).toBeNull();
    await user.click(screen.getByRole('button', { name: 'Undo' }));
    expect(savedDiagram().flows).toEqual(original.flows);
  });
});

describe('percentage display in the actual application', () => {
  it('changes the visible percentage base, persists through reload, and supports hiding numbers', async () => {
    const user = userEvent.setup();
    const rendered = mountDiagram(template('jobs'));
    await user.selectOptions(screen.getByRole('combobox', { name: 'Diagram numbers' }), 'percentages');
    expect(nodeGroup('Offers').getByText('8%')).toBeTruthy();
    expect(screen.getByText('Percentages of Total inflow (100)')).toBeTruthy();
    await user.selectOptions(screen.getByRole('combobox', { name: 'Percentage base' }), 'Interviews');
    expect(nodeGroup('Offers').getByText('40%')).toBeTruthy();
    expect(screen.getByText('Percentages of Interviews (20)')).toBeTruthy();
    await user.selectOptions(screen.getByRole('combobox', { name: 'Diagram numbers' }), 'both');
    expect(nodeGroup('Offers').getByText('8')).toBeTruthy();
    expect(nodeGroup('Offers').getByText('40%')).toBeTruthy();
    expect(savedDiagram().appearance).toMatchObject({ values: true, valueDisplay: 'both', percentageBase: 'Interviews' });

    rendered.unmount();
    render(<App />);
    expect((screen.getByRole('combobox', { name: 'Diagram numbers' }) as HTMLSelectElement).value).toBe('both');
    expect((screen.getByRole('combobox', { name: 'Percentage base' }) as HTMLSelectElement).value).toBe('Interviews');
    expect(nodeGroup('Offers').getByText('40%')).toBeTruthy();
    await user.selectOptions(screen.getByRole('combobox', { name: 'Diagram numbers' }), screen.getByRole('option', { name: 'Hidden' }));
    expect(nodeGroup('Offers').queryByText('8')).toBeNull();
    expect(nodeGroup('Offers').queryByText('40%')).toBeNull();
    expect(screen.queryByRole('combobox', { name: 'Percentage base' })).toBeNull();
    expect(savedDiagram().appearance.values).toBe(false);
  });
});

describe('finishing and reviewing unbalanced flows in the actual application', () => {
  it('prefills the remainder without changing data, then adds it as one undoable action', async () => {
    const user = userEvent.setup();
    const original = template('budget');
    mountDiagram(original);
    await user.click(screen.getByRole('button', { name: 'Delete Total income to A little fun' }));
    const beforeAdding = savedDiagram();
    expect(analyze(beforeAdding.flows).balances.map(node => node.name)).toEqual(['Total income']);
    await user.click(screen.getAllByRole('button', { name: /^Add remaining flow from Total income/ })[0]);

    const from = screen.getByRole('combobox', { name: 'From node' }) as HTMLInputElement;
    const to = screen.getByRole('combobox', { name: 'To node' }) as HTMLInputElement;
    expect(from.value).toBe('Total income');
    expect(to.value).toBe('');
    expect((screen.getByRole('textbox', { name: 'Amount' }) as HTMLInputElement).value).toBe('400');
    await waitFor(() => expect(document.activeElement).toBe(to));
    expect(savedDiagram()).toEqual(beforeAdding);

    await user.type(to, 'Emergency fund');
    expect(savedDiagram()).toEqual(beforeAdding);
    await user.click(screen.getByRole('button', { name: 'Add flow' }));
    expect(savedDiagram().flows.at(-1)).toMatchObject({ from: 'Total income', to: 'Emergency fund', amount: 400 });
    expect(analyze(savedDiagram().flows).balances).toEqual([]);
    expect(screen.queryByRole('combobox', { name: 'To node' })).toBeNull();
    await user.click(screen.getByRole('button', { name: 'Undo' }));
    expect(savedDiagram()).toEqual(beforeAdding);
    expect(screen.getAllByRole('button', { name: /^Add remaining flow from Total income/ }).length).toBeGreaterThan(0);
  });

  it('can cancel the suggested remainder without adding or modifying a flow', async () => {
    const user = userEvent.setup();
    const doc = template('budget');
    doc.flows = doc.flows.filter(flow => flow.to !== 'A little fun');
    mountDiagram(doc);
    await user.click(screen.getAllByRole('button', { name: /^Add remaining flow from Total income/ })[0]);
    await user.type(screen.getByRole('combobox', { name: 'To node' }), 'Maybe later');
    await user.click(screen.getByRole('button', { name: 'Cancel new flow' }));
    expect(savedDiagram()).toEqual(doc);
    expect(screen.queryByRole('combobox', { name: 'To node' })).toBeNull();
    expect(screen.getByRole('button', { name: 'Undo' }).hasAttribute('disabled')).toBe(true);
  });

  it('reviews an excess by revealing and focusing connected rows without adding data', async () => {
    const user = userEvent.setup();
    const doc = template('budget');
    doc.flows = doc.flows.map(flow => flow.to === 'Housing' ? { ...flow, amount: 2000 } : flow);
    doc.flows.push({ id: 'separate-flow', from: 'Gift', to: 'Charity', amount: 50 });
    const { container } = mountDiagram(doc);
    await user.click(screen.getByRole('tab', { name: 'Appearance' }));
    await user.click(screen.getByRole('button', { name: 'Hide editor' }));
    await user.click(screen.getAllByRole('button', { name: /^Review flows for Total income/ })[0]);
    expect(screen.getByRole('tab', { name: /^Flows/ }).getAttribute('aria-selected')).toBe('true');
    expect(screen.getByRole('button', { name: 'Hide editor' }).getAttribute('aria-expanded')).toBe('true');
    const relevantRows = Array.from(container.querySelectorAll('.flow-row-wrap.selected'));
    expect(relevantRows).toHaveLength(8);
    expect(relevantRows.every(row => Array.from(row.querySelectorAll<HTMLInputElement>('[role=\"combobox\"]')).some(input => input.value === 'Total income'))).toBe(true);
    expect(screen.getByRole('combobox', { name: 'From Gift to Charity' }).closest('.flow-row-wrap')?.classList.contains('selected')).toBe(false);
    const amount = screen.getByRole('textbox', { name: 'Amount for Total income to Housing' });
    await waitFor(() => expect(document.activeElement).toBe(amount));
    expect(screen.queryByRole('combobox', { name: 'To node' })).toBeNull();
    expect(savedDiagram()).toEqual(doc);
    expect(screen.getByRole('button', { name: 'Undo' }).hasAttribute('disabled')).toBe(true);
  });
});
