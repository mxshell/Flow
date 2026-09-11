import { afterEach, describe, expect, it, vi } from 'vitest';
import { loadLibrary } from './App';
import { template } from './model';

afterEach(() => vi.unstubAllGlobals());
function storage(initial: string) {
  const values = new Map([['sankey-studio-v1', initial]]);
  vi.stubGlobal('localStorage', { getItem: (key: string) => values.get(key) ?? null, setItem: (key: string, value: string) => values.set(key, value) });
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
    vi.stubGlobal('localStorage', { getItem: () => '{broken', setItem: () => { throw new Error('quota'); } });
    expect(loadLibrary().blockSave).toBe(true);
  });
});
