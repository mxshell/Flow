// @vitest-environment jsdom
import { useState } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderToStaticMarkup } from 'react-dom/server';
import { renameNode, template } from './model';
import type { NodeRenameResult } from './model';
import NodeName, { nodeEditorPosition } from './NodeName';

const position = { x: 143, y: 180, width: 131, anchor: 'end' as const, canvasWidth: 1000, canvasHeight: 590 };

beforeEach(() => {
  vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => setTimeout(() => callback(performance.now()), 0));
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

function editor() {
  const doc = template('budget');
  const onRename = vi.fn((next: string, merge?: boolean): NodeRenameResult => renameNode(doc, 'Salary', next, merge));
  const onEditingChange = vi.fn();
  render(<div><svg><NodeName {...position} name="Salary" onRename={onRename} onEditingChange={onEditingChange} /></svg>
    <button>Outside editor</button></div>);
  return { user: userEvent.setup(), onRename, onEditingChange };
}

async function begin(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByRole('button', { name: 'Rename node: Salary' }));
  return screen.getByRole('textbox', { name: 'Name for node: Salary' });
}

describe('node name editing', () => {
  it.each(['Enter', ' '])('opens from the keyboard with %j and keeps editor keys out of chart shortcuts', key => {
    const doc = template('budget');
    const parentKeyDown = vi.fn();
    render(<div onKeyDown={parentKeyDown}><svg><NodeName {...position} name="Salary"
      onRename={next => renameNode(doc, 'Salary', next)} /></svg></div>);
    fireEvent.keyDown(screen.getByRole('button', { name: 'Rename node: Salary' }), { key });
    const input = screen.getByRole('textbox');
    expect(document.activeElement).toBe(input);
    fireEvent.keyDown(input, { key: 'Escape' });
    expect(screen.queryByRole('textbox')).toBeNull();
    expect(parentKeyDown).not.toHaveBeenCalled();
  });

  it('starts from the visible label, selects the full name, and saves once with Enter', async () => {
    const { user, onRename, onEditingChange } = editor();
    const input = await begin(user) as HTMLInputElement;
    expect(document.activeElement).toBe(input);
    expect(input.selectionStart).toBe(0);
    expect(input.selectionEnd).toBe('Salary'.length);
    await user.clear(input);
    await user.type(input, 'Take-home pay{Enter}');
    expect(onRename).toHaveBeenCalledExactlyOnceWith('Take-home pay', false);
    expect(screen.queryByRole('textbox')).toBeNull();
    expect(onEditingChange.mock.calls).toEqual([[true], [false]]);
  });

  it('cancels a draft with Escape and restores keyboard focus', async () => {
    const { user, onRename } = editor();
    const input = await begin(user);
    await user.clear(input);
    await user.type(input, 'Unfinished{Escape}');
    expect(onRename).not.toHaveBeenCalled();
    expect(screen.queryByRole('textbox')).toBeNull();
    await waitFor(() => expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Rename node: Salary' })));
  });

  it('commits a valid name when focus leaves the editor', async () => {
    const { user, onRename } = editor();
    const input = await begin(user);
    await user.clear(input);
    await user.type(input, 'Monthly salary');
    await user.click(screen.getByRole('button', { name: 'Outside editor' }));
    expect(onRename).toHaveBeenCalledExactlyOnceWith('Monthly salary', false);
    expect(screen.queryByRole('textbox')).toBeNull();
    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Outside editor' }));
  });

  it('does not blur-commit before the explicit save or cancel button acts', async () => {
    const { user, onRename } = editor();
    const input = await begin(user);
    await user.clear(input);
    await user.type(input, 'Wages');
    await user.click(screen.getByRole('button', { name: 'Cancel node rename' }));
    expect(onRename).not.toHaveBeenCalled();
    await begin(user);
    await user.click(screen.getByRole('button', { name: 'Save node name' }));
    expect(onRename).toHaveBeenCalledExactlyOnceWith('Salary', false);
  });

  it('keeps validation errors in the editor and permits correcting the name', async () => {
    const { user, onRename } = editor();
    const input = await begin(user);
    await user.clear(input);
    await user.click(screen.getByRole('button', { name: 'Outside editor' }));
    expect(screen.getByRole('alert').textContent).toMatch(/name/i);
    expect(input.getAttribute('aria-invalid')).toBe('true');
    await waitFor(() => expect(document.activeElement).toBe(input));
    await user.type(input, 'Work income{Enter}');
    expect(onRename).toHaveBeenLastCalledWith('Work income', false);
    expect(screen.queryByRole('textbox')).toBeNull();
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('requires explicit confirmation to merge an existing node, including after blur', async () => {
    const { user, onRename } = editor();
    const input = await begin(user);
    await user.clear(input);
    await user.type(input, 'Freelance{Enter}');
    expect(onRename).toHaveBeenCalledExactlyOnceWith('Freelance', false);
    expect(screen.getByRole('alert').textContent).toContain('Merge their connected flows?');
    await user.click(screen.getByRole('button', { name: 'Outside editor' }));
    expect(onRename).toHaveBeenCalledTimes(1);
    await user.click(screen.getByRole('button', { name: 'Merge nodes' }));
    expect(onRename).toHaveBeenLastCalledWith('Freelance', true);
    expect(onRename).toHaveBeenCalledTimes(2);
    expect(screen.queryByRole('textbox')).toBeNull();
  });

  it('can return from merge confirmation to editing without changing the diagram', async () => {
    const { user, onRename } = editor();
    const input = await begin(user);
    await user.clear(input);
    await user.type(input, 'Freelance{Enter}');
    await user.click(screen.getByRole('button', { name: 'Keep editing' }));
    expect(onRename).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole('button', { name: 'Merge nodes' })).toBeNull();
    expect(document.activeElement).toBe(input);
    await user.clear(input);
    await user.type(input, 'Main income{Enter}');
    expect(onRename).toHaveBeenLastCalledWith('Main income', false);
  });

  it('keeps invalid merges as validation errors without offering a merge action', async () => {
    const { user, onRename } = editor();
    const input = await begin(user);
    await user.clear(input);
    await user.type(input, 'Total income{Enter}');
    expect(onRename).toHaveBeenCalledExactlyOnceWith('Total income', false);
    expect(screen.getByRole('alert').textContent).toMatch(/itself|same|loop|different/i);
    expect(screen.queryByRole('button', { name: 'Merge nodes' })).toBeNull();
    expect(screen.getByRole('textbox')).toBe(input);
  });

  it('ignores Enter and Escape during IME composition and saves the completed name', async () => {
    const { user, onRename } = editor();
    const input = await begin(user);
    fireEvent.compositionStart(input);
    fireEvent.change(input, { target: { value: '給料' } });
    fireEvent.keyDown(input, { key: 'Enter', isComposing: true, keyCode: 229 });
    fireEvent.keyDown(input, { key: 'Escape', isComposing: true, keyCode: 229 });
    expect(onRename).not.toHaveBeenCalled();
    expect(screen.getByRole('textbox')).toBe(input);
    fireEvent.compositionEnd(input, { data: '給料' });
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(onRename).toHaveBeenCalledExactlyOnceWith('給料', false);
    expect(screen.queryByRole('textbox')).toBeNull();
  });

  it('waits for composition to finish before saving a blurred input', async () => {
    const { user, onRename } = editor();
    const input = await begin(user);
    fireEvent.compositionStart(input);
    fireEvent.change(input, { target: { value: '給与' } });
    fireEvent.blur(input, { relatedTarget: screen.getByRole('button', { name: 'Outside editor' }) });
    expect(onRename).not.toHaveBeenCalled();
    fireEvent.compositionEnd(input, { data: '給与' });
    expect(onRename).toHaveBeenCalledExactlyOnceWith('給与', false);
  });

  it('restores focus to the renamed node after the parent replaces its name key', async () => {
    function Chart() {
      const [doc, setDoc] = useState(() => template('budget'));
      const name = doc.flows[0].from;
      return <svg><NodeName key={name} {...position} name={name} onRename={(next, merge) => {
        const result = renameNode(doc, name, next, merge);
        if (result.ok) setDoc(result.diagram);
        return result;
      }} /></svg>;
    }
    render(<Chart />);
    const user = userEvent.setup();
    const input = await begin(user);
    await user.clear(input);
    await user.type(input, 'Earnings{Enter}');
    await waitFor(() => expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Rename node: Earnings' })));
  });
});

describe('node name layout and export', () => {
  it('preserves the full accessible name while shortening complete Unicode graphemes', () => {
    const name = '👩‍💻'.repeat(25);
    const html = renderToStaticMarkup(<svg><NodeName {...position} name={name} onRename={() => ({ ok: false, error: '' })} /></svg>);
    expect(html).toContain(`aria-label="Rename node: ${name}"`);
    expect(html).toContain(`${'👩‍💻'.repeat(20)}…</text>`);
    expect(html).not.toContain('textLength=');
    expect(html).toContain('data-max-width="111"');
    expect(html).toContain('text-anchor="end"');
    expect(html).not.toContain('<foreignObject');
    expect(html.match(/data-export-omit="true"/g)).toHaveLength(3);
  });

  it.each(['start', 'middle', 'end'] as const)('keeps the %s editor inside the chart at either edge', anchor => {
    for (const x of [5, 500, 995]) for (const y of [3, 180, 589]) {
      const box = nodeEditorPosition({ ...position, x, y, anchor }, 212);
      expect(box.x).toBeGreaterThanOrEqual(12);
      expect(box.y).toBeGreaterThanOrEqual(8);
      expect(box.x + box.width).toBeLessThanOrEqual(988);
      expect(box.y + box.height).toBeLessThanOrEqual(582);
      expect(box.width).toBeGreaterThanOrEqual(268);
      expect(box.height).toBe(212);
    }
  });

  it('constrains large labels and gracefully fits smaller canvases', () => {
    const box = nodeEditorPosition({ ...position, width: 4000, canvasWidth: 240, canvasHeight: 160 }, 212);
    expect(box.x).toBe(12);
    expect(box.width).toBe(216);
    expect(box.y).toBe(8);
    expect(box.height).toBe(144);
  });
});
