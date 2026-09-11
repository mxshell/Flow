import { afterEach, describe, expect, it, vi } from 'vitest';
import { clearLocalData, loadLibrary, removeDiagram, saveLibrary } from './storage';
import { template } from './model';

afterEach(() => vi.unstubAllGlobals());
function storage(initial?: string) {
  const values = new Map<string, string>(initial === undefined ? [] : [['sankey-studio-v1', initial]]);
  vi.stubGlobal('localStorage', {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => values.set(key, value),
    removeItem: (key: string) => { values.delete(key); },
  });
  return values;
}
describe('saved diagram recovery', () => {
  it('opens existing job-search diagrams as whole numbers and preserves their values', () => {
    const current = template('jobs');
    const { numberFormat: _format, currency: _currency, ...fields } = current;
    const legacy = { ...fields, version: 1, unit: 'applications' };
    storage(JSON.stringify({ activeId: legacy.id, docs: [legacy] }));
    const recovered = loadLibrary();
    expect(recovered.docs[0].numberFormat).toBe('integer');
    expect(recovered.docs[0].flows.map(f => f.amount)).toEqual(legacy.flows.map(f => f.amount));
    expect(recovered.recovery).toBeUndefined();
  });
  it('preserves all diagrams, including the active 101st document', () => {
    const docs = Array.from({ length: 101 }, () => template('budget'));
    storage(JSON.stringify({ activeId: docs[100].id, docs }));
    const recovered = loadLibrary();
    expect(recovered.docs).toHaveLength(101);
    expect(recovered.activeId).toBe(docs[100].id);
  });
  it('recovers readable diagrams and keeps an exact backup of damaged storage', () => {
    const doc = template('jobs');
    const original = JSON.stringify({ activeId: doc.id, docs: [doc, { version: 98 }] });
    const values = storage(original), recovered = loadLibrary();
    expect(recovered.docs).toHaveLength(1);
    expect(recovered.docs[0].id).toBe(doc.id);
    expect(values.get('sankey-studio-v1-recovery')).toBe(original);
    expect(recovered.recovery).toBeTruthy();
  });
  it('does not allow autosave to overwrite data when its backup fails', () => {
    const setItem = vi.fn(() => { throw new Error('quota'); });
    const removeItem = vi.fn();
    vi.stubGlobal('localStorage', { getItem: () => '{broken', setItem, removeItem });
    const recovered = loadLibrary();
    expect(recovered.blockSave).toBe(true);
    setItem.mockClear();
    expect(() => saveLibrary(recovered)).toThrow('could not be backed up');
    expect(() => saveLibrary({ ...recovered, activeId: '', docs: [] })).toThrow('could not be backed up');
    expect(setItem).not.toHaveBeenCalled();
    expect(removeItem).not.toHaveBeenCalled();
  });
  it.each(['{broken', JSON.stringify({ docs: [{ version: 98 }] }), JSON.stringify({ docs: 'invalid' })])('preserves unreadable data and opens a usable fallback', (original) => {
    const values = storage(original);
    const recovered = loadLibrary();
    expect(values.get('sankey-studio-v1-recovery')).toBe(original);
    expect(recovered.docs).toHaveLength(1);
    expect(recovered.activeId).toBe(recovered.docs[0].id);
    expect(recovered.recovery).toBeTruthy();
    expect(recovered.blockSave).toBe(false);
  });
});

describe('saved diagram deletion', () => {
  it('removes an inactive diagram without changing the selection or mutating the original library', () => {
    const docs = [template('budget'), template('jobs'), template('business')];
    const original = { docs, activeId: docs[1].id };
    const updated = removeDiagram(original, docs[0].id);
    expect(updated.docs).toEqual([docs[1], docs[2]]);
    expect(updated.activeId).toBe(docs[1].id);
    expect(original.docs).toEqual(docs);
    expect(original.docs).toHaveLength(3);
    expect(updated.docs).not.toBe(original.docs);
  });
  it('selects the next diagram after deleting the active diagram', () => {
    const docs = [template('budget'), template('jobs'), template('business')];
    expect(removeDiagram({ docs, activeId: docs[1].id }, docs[1].id).activeId).toBe(docs[2].id);
  });
  it('selects the previous diagram after deleting the active final diagram', () => {
    const docs = [template('budget'), template('jobs'), template('business')];
    expect(removeDiagram({ docs, activeId: docs[2].id }, docs[2].id).activeId).toBe(docs[1].id);
  });
  it('leaves an empty library after deleting the only diagram and keeps it empty after reload', () => {
    const doc = template('budget');
    const original = { docs: [doc], activeId: doc.id };
    const values = storage(JSON.stringify(original));
    const empty = removeDiagram(original, doc.id);
    expect(empty).toEqual({ docs: [], activeId: '' });
    saveLibrary(empty);
    expect(values.has('sankey-studio-v1')).toBe(false);
    expect(loadLibrary()).toEqual(empty);
    saveLibrary(loadLibrary());
    expect(values.has('sankey-studio-v1')).toBe(false);
  });
  it('ignores a diagram that is no longer in the library', () => {
    const doc = template('budget');
    const library = { docs: [doc], activeId: doc.id };
    expect(removeDiagram(library, 'missing')).toBe(library);
  });
});

describe('library persistence', () => {
  it.each([undefined, JSON.stringify({ docs: [], activeId: 'old-id' })])('opens missing or explicitly empty storage without creating a saved example', (initial) => {
    storage(initial);
    expect(loadLibrary()).toEqual({ docs: [], activeId: '' });
  });
  it('persists diagram changes without saving transient recovery messages', () => {
    const doc = template('jobs');
    const values = storage();
    saveLibrary({ activeId: doc.id, docs: [doc], recovery: 'Recovered some diagrams', blockSave: false });
    expect(JSON.parse(values.get('sankey-studio-v1')!)).toEqual({ activeId: doc.id, docs: [doc] });
    expect(loadLibrary().activeId).toBe(doc.id);
    expect(loadLibrary().docs[0].flows.map(({ from, to, amount }) => ({ from, to, amount })))
      .toEqual(doc.flows.map(({ from, to, amount }) => ({ from, to, amount })));
  });
  it('reports storage write failures to the caller', () => {
    const doc = template('budget');
    vi.stubGlobal('localStorage', { setItem: () => { throw new Error('quota'); } });
    expect(() => saveLibrary({ activeId: doc.id, docs: [doc] })).toThrow('quota');
  });
  it('reports failure to remove an empty library', () => {
    vi.stubGlobal('localStorage', { removeItem: () => { throw new Error('storage unavailable'); } });
    expect(() => saveLibrary({ activeId: '', docs: [] })).toThrow('storage unavailable');
  });
});

describe('clear local data', () => {
  it('removes saved diagrams and recovery data while preserving unrelated storage', () => {
    const doc = template('budget');
    const values = storage(JSON.stringify({ activeId: doc.id, docs: [doc] }));
    values.set('sankey-studio-v1-recovery', 'damaged original');
    values.set('another-app', 'keep me');
    clearLocalData();
    expect([...values]).toEqual([['another-app', 'keep me']]);
    const empty = loadLibrary();
    expect(empty).toEqual({ activeId: '', docs: [] });
    saveLibrary(empty);
    expect([...values]).toEqual([['another-app', 'keep me']]);
  });
  it('keeps the main library if removing its recovery copy fails', () => {
    const removeItem = vi.fn((key: string) => {
      if (key.endsWith('-recovery')) throw new Error('storage unavailable');
    });
    vi.stubGlobal('localStorage', { removeItem });
    expect(() => clearLocalData()).toThrow('storage unavailable');
    expect(removeItem.mock.calls).toEqual([['sankey-studio-v1-recovery']]);
  });
  it('reports failure to remove the main library after removing recovery data', () => {
    const removeItem = vi.fn((key: string) => {
      if (key === 'sankey-studio-v1') throw new Error('storage unavailable');
    });
    vi.stubGlobal('localStorage', { removeItem });
    expect(() => clearLocalData()).toThrow('storage unavailable');
    expect(removeItem.mock.calls).toEqual([['sankey-studio-v1-recovery'], ['sankey-studio-v1']]);
  });
});
