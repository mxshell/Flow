import { useEffect, useId, useMemo, useRef, useState } from 'react';
import type { FormEvent, ReactNode } from 'react';
import { ArrowDownToLine, ArrowRight, ArrowUpRight, BriefcaseBusiness, Check, CheckCheck, ChevronDown, CircleHelp, Copy, FileJson, FolderOpen, LayoutTemplate, ListFilter, LockKeyhole, Maximize2, Minus, Pencil, Plus, Redo2, RotateCcw, SlidersHorizontal, Undo2, Upload, Wallet, X, Building2, Image, PanelLeftClose, PanelLeftOpen, AlertCircle } from 'lucide-react';
import SankeyChart from './SankeyChart';
import { analyze, appearance, formatAmount, nodeColor, palettes, parseDocument, template, uid } from './model';
import type { Diagram, Flow } from './model';

const STORAGE_KEY = 'sankey-studio-v1';
type Library = { activeId: string; docs: Diagram[]; recovery?: string; blockSave?: boolean };
export function loadLibrary(): Library {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const saved = JSON.parse(raw);
      if (Array.isArray(saved.docs) && saved.docs.length) {
        const docs: Diagram[] = [];
        let damaged = false;
        for (const entry of saved.docs) { try { docs.push(parseDocument(entry)); } catch { damaged = true; } }
        if (damaged) localStorage.setItem(`${STORAGE_KEY}-recovery`, raw);
        if (docs.length) return { docs, activeId: docs.some((d: Diagram) => d.id === saved.activeId) ? saved.activeId : docs[0].id, recovery: damaged ? 'Some saved diagrams could not be opened. Your original data is preserved in browser storage.' : undefined };
        throw new Error('No readable diagrams');
      }
    }
  } catch {
    let blockSave = false;
    try { const raw = localStorage.getItem(STORAGE_KEY); if (raw) localStorage.setItem(`${STORAGE_KEY}-recovery`, raw); } catch { blockSave = true; }
    const doc = template('budget');
    return { activeId: doc.id, docs: [doc], blockSave, recovery: 'Saved diagrams could not be opened. Export your work to keep a copy.' };
  }
  const doc = template('budget');
  return { activeId: doc.id, docs: [doc] };
}

const examples = [
  { kind: 'budget' as const, icon: Wallet, title: 'Personal budget', description: 'Income, spending & savings', className: 'budget' },
  { kind: 'business' as const, icon: Building2, title: 'Company finances', description: 'Revenue, expenses & profit', className: 'business' },
  { kind: 'jobs' as const, icon: BriefcaseBusiness, title: 'Job search', description: 'Applications to offers', className: 'jobs' },
];

function MiniFlow({ kind }: { kind: string }) {
  const colors = kind === 'business' ? ['#72a49e', '#a4c6bc', '#ceded5'] : kind === 'jobs' ? ['#cca17f', '#ddc0a5', '#ebd6c6'] : ['#8b92db', '#b5b9e8', '#d6d9f3'];
  return <svg viewBox="0 0 180 55" aria-hidden="true"><path d="M4 9C48 9 38 23 87 23S127 6 175 6" fill="none" stroke={colors[0]} strokeWidth="10" /><path d="M4 38C44 38 43 25 87 25S130 26 175 26" fill="none" stroke={colors[1]} strokeWidth="13" /><path d="M87 30C129 30 126 46 175 46" fill="none" stroke={colors[2]} strokeWidth="9" /><path d="M3 3v44M87 14v23M177 0v13M177 17v18M177 39v14" stroke={colors[0]} strokeWidth="4" /></svg>;
}

function Modal({ title, onClose, children, wide = false }: { title: string; onClose: () => void; children: ReactNode; wide?: boolean }) {
  const ref = useRef<HTMLDialogElement>(null);
  const headingId = useId();
  useEffect(() => { const dialog = ref.current; dialog?.showModal(); return () => { dialog?.close(); }; }, []);
  return <dialog ref={ref} aria-labelledby={headingId} className={`modal ${wide ? 'modal-wide' : ''}`} onCancel={onClose} onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
    <div className="modal-heading"><h2 id={headingId}>{title}</h2><button className="icon-button" onClick={onClose} aria-label="Close dialog"><X size={19} /></button></div>{children}
  </dialog>;
}

function FlowRow({ flow, color, onChange, onDelete, selected }: { flow: Flow; color: string; onChange: (flow: Flow) => string | null; onDelete: () => void; selected: boolean }) {
  const [draft, setDraft] = useState({ from: flow.from, to: flow.to, amount: String(flow.amount) });
  const [error, setError] = useState('');
  const rowRef = useRef<HTMLDivElement>(null);
  useEffect(() => { if (rowRef.current?.contains(document.activeElement)) return; setDraft({ from: flow.from, to: flow.to, amount: String(flow.amount) }); setError(''); }, [flow]);
  function edit(field: 'from' | 'to' | 'amount', value: string) {
    const next = { ...draft, [field]: value };
    setDraft(next);
    const message = onChange({ ...flow, from: next.from.trim(), to: next.to.trim(), amount: Number(next.amount.replaceAll(',', '')) });
    setError(message ?? '');
  }
  function commit() {
    if (draft.from === flow.from && draft.to === flow.to && draft.amount === String(flow.amount)) return;
    const next = { ...flow, from: draft.from.trim(), to: draft.to.trim(), amount: Number(draft.amount.replaceAll(',', '')) };
    const message = onChange(next);
    setError(message ?? '');
  }
  return <div ref={rowRef} className={`flow-row-wrap ${selected ? 'selected' : ''} ${error ? 'invalid' : ''}`}>
    <div className="flow-row">
      <span className="flow-dot" style={{ background: color }} />
      <input aria-label={`From ${flow.from} to ${flow.to}`} value={draft.from} maxLength={60} onChange={e => edit('from', e.target.value)} onBlur={commit} onKeyDown={e => { if (e.key === 'Enter') e.currentTarget.blur(); }} list="node-names" />
      <ArrowRight className="row-arrow" size={12} />
      <input aria-label={`To for ${flow.from} to ${flow.to}`} value={draft.to} maxLength={60} onChange={e => edit('to', e.target.value)} onBlur={commit} onKeyDown={e => { if (e.key === 'Enter') e.currentTarget.blur(); }} list="node-names" />
      <input className="amount-input" aria-label={`Amount for ${flow.from} to ${flow.to}`} value={draft.amount} inputMode="decimal" onChange={e => edit('amount', e.target.value)} onBlur={commit} onKeyDown={e => { if (e.key === 'Enter') e.currentTarget.blur(); }} />
      <button className="row-delete" aria-label={`Delete ${flow.from} to ${flow.to}`} title="Delete flow" onClick={onDelete}><X size={13} /></button>
    </div>
    {error && <p className="row-error" role="alert">Not saved: {error}</p>}
  </div>;
}

export default function App() {
  const [library, setLibrary] = useState<Library>(loadLibrary);
  const doc = library.docs.find(d => d.id === library.activeId)!;
  const [past, setPast] = useState<Diagram[]>([]), [future, setFuture] = useState<Diagram[]>([]);
  const [tab, setTab] = useState<'data' | 'appearance'>('data');
  const [modal, setModal] = useState<'templates' | 'library' | 'help' | null>(null);
  const [menu, setMenu] = useState<'export' | 'more' | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [adding, setAdding] = useState(false), [addError, setAddError] = useState('');
  const [toast, setToast] = useState(library.recovery ?? ''), [storageError, setStorageError] = useState(false);
  const [zoom, setZoom] = useState(100), [focusMode, setFocusMode] = useState(false), [editorOpen, setEditorOpen] = useState(true);
  const [renaming, setRenaming] = useState(false);
  const importRef = useRef<HTMLInputElement>(null);
  const titleRef = useRef<HTMLInputElement>(null);
  const firstAddRef = useRef<HTMLInputElement>(null);
  const analysis = useMemo(() => analyze(doc.flows), [doc.flows]);

  useEffect(() => { try { if (library.blockSave) { setStorageError(true); return; } localStorage.setItem(STORAGE_KEY, JSON.stringify({ activeId: library.activeId, docs: library.docs })); setStorageError(false); } catch { setStorageError(true); } }, [library]);
  useEffect(() => { if (selected && !analysis.nodes.some(n => n.name === selected)) setSelected(null); }, [analysis.nodes, selected]);
  useEffect(() => { if (!toast) return; const t = setTimeout(() => setToast(''), 3500); return () => clearTimeout(t); }, [toast]);
  useEffect(() => { if (adding) firstAddRef.current?.focus(); }, [adding]);
  useEffect(() => { if (renaming) { titleRef.current?.focus(); titleRef.current?.select(); } }, [renaming]);
  useEffect(() => {
    function escape(e: KeyboardEvent) { if (e.key === 'Escape') { setMenu(null); setSelected(null); setFocusMode(false); setAdding(false); } }
    window.addEventListener('keydown', escape); return () => window.removeEventListener('keydown', escape);
  }, []);

  function replace(next: Diagram) { setLibrary(l => ({ ...l, docs: l.docs.map(d => d.id === next.id ? next : d) })); }
  function update(next: Diagram) {
    if (JSON.stringify(next) === JSON.stringify(doc)) return;
    setPast(p => [...p.slice(-49), doc]); setFuture([]); replace(next);
  }
  function undo() { if (!past.length) return; setFuture(f => [doc, ...f]); replace(past[past.length - 1]); setPast(p => p.slice(0, -1)); }
  function redo() { if (!future.length) return; setPast(p => [...p, doc]); replace(future[0]); setFuture(f => f.slice(1)); }
  useEffect(() => {
    function shortcut(e: KeyboardEvent) {
      if ((e.target as HTMLElement).closest('input,textarea,select,[contenteditable]')) return;
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'z') { e.preventDefault(); if (e.shiftKey) redo(); else undo(); }
    }
    window.addEventListener('keydown', shortcut); return () => window.removeEventListener('keydown', shortcut);
  });
  function activate(id: string) { setLibrary(l => ({ ...l, activeId: id })); setPast([]); setFuture([]); setSelected(null); setAdding(false); setModal(null); setZoom(100); setEditorOpen(true); setTab('data'); }
  function addDocument(next: Diagram) { setLibrary(l => ({ ...l, activeId: next.id, docs: [...l.docs, next] })); setPast([]); setFuture([]); setSelected(null); setAdding(false); setModal(null); setZoom(100); setEditorOpen(true); setTab('data'); }
  function newDocument() { addDocument({ version: 1, id: uid(), title: 'Untitled diagram', unit: 'USD', kind: 'custom', flows: [], appearance: { ...appearance } }); setAdding(true); setTab('data'); }
  function changeFlow(next: Flow) {
    const flows = doc.flows.map(f => f.id === next.id ? next : f);
    const error = analyze(flows).errors[0];
    if (error) return error;
    update({ ...doc, flows }); return null;
  }
  function addFlow(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    const next = { id: uid(), from: String(form.get('from')).trim(), to: String(form.get('to')).trim(), amount: Number(String(form.get('amount')).replaceAll(',', '')) };
    const flows = [...doc.flows, next];
    if (flows.length > 300) { setAddError('A diagram can contain up to 300 flows.'); return; }
    const error = analyze(flows).errors[0];
    if (error) { setAddError(error); return; }
    update({ ...doc, flows }); setAdding(false); setAddError(''); setToast('Flow added');
  }
  function download(blob: Blob, extension: string) {
    const url = URL.createObjectURL(blob), link = document.createElement('a');
    link.href = url; link.download = `${doc.title.replace(/[^a-z0-9_-]/gi, '-').toLowerCase() || 'sankey'}.${extension}`; link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000); setMenu(null);
  }
  async function exportFile(type: 'json' | 'svg' | 'png') {
    if (type === 'json') { download(new Blob([JSON.stringify(doc, null, 2)], { type: 'application/json' }), 'json'); setToast('Diagram saved as JSON'); return; }
    const source = document.getElementById('sankey-diagram');
    if (!source) { setToast('Add a flow before exporting an image.'); return; }
    const svg = source.cloneNode(true) as SVGElement;
    svg.querySelector('.chart-tooltip')?.remove();
    svg.querySelectorAll('.sankey-node rect').forEach(n => n.setAttribute('stroke', 'none'));
    svg.querySelectorAll('.sankey-link').forEach(l => l.setAttribute('opacity', String(doc.appearance.opacity)));
    const bounds = (source as unknown as SVGSVGElement).viewBox.baseVal;
    const exportWidth = bounds.width, exportHeight = bounds.height;
    svg.setAttribute('width', String(exportWidth)); svg.setAttribute('height', String(exportHeight)); svg.style.fontFamily = 'Arial, sans-serif';
    svg.style.minWidth = ''; svg.style.minHeight = '';
    const rect = document.createElementNS('http://www.w3.org/2000/svg', 'rect'); rect.setAttribute('width', String(exportWidth)); rect.setAttribute('height', String(exportHeight)); rect.setAttribute('fill', 'white'); svg.prepend(rect);
    const blob = new Blob([new XMLSerializer().serializeToString(svg)], { type: 'image/svg+xml;charset=utf-8' });
    if (type === 'svg') { download(blob, 'svg'); setToast('Diagram exported as SVG'); return; }
    const url = URL.createObjectURL(blob);
    try {
      const img = new window.Image(); img.src = url; await img.decode();
      const canvas = document.createElement('canvas'); const scale = Math.min(2.4, 8192 / exportWidth, 8192 / exportHeight);
      canvas.width = Math.round(exportWidth * scale); canvas.height = Math.round(exportHeight * scale);
      const ctx = canvas.getContext('2d'); if (!ctx) throw new Error('Image export unavailable'); ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      const png = await new Promise<Blob | null>(resolve => canvas.toBlob(resolve, 'image/png'));
      if (!png) throw new Error('Image export unavailable'); download(png, 'png'); setToast('Diagram exported as PNG');
    } catch { setToast('PNG export failed. Try downloading SVG instead.'); } finally { URL.revokeObjectURL(url); }
  }
  async function importFile(file?: File) {
    if (!file) return;
    if (file.size > 2_000_000) { setToast('Choose a JSON file smaller than 2 MB.'); return; }
    try { const next = parseDocument(JSON.parse(await file.text())); addDocument({ ...next, id: uid() }); setToast('Diagram imported'); } catch (e) { setToast(e instanceof Error ? e.message : 'Unable to read this diagram.'); }
    if (importRef.current) importRef.current.value = '';
  }
  const totalLabel = doc.kind === 'budget' ? 'Total income' : doc.kind === 'business' ? 'Total revenue' : doc.kind === 'jobs' ? 'Applications' : 'Total flow';
  const sourceCount = analysis.nodes.filter(n => !n.incoming).length;
  return <div className={`app ${focusMode ? 'focus-mode' : ''}`}>
    <header className="app-header">
      <a href="#" className="brand" onClick={e => e.preventDefault()} aria-label="Sankey workspace"><img src="/favicon.svg" width="33" height="33" alt="" /><span>sankey<span className="brand-period">.</span></span></a>
      <span className="header-divider" /><span className="brand-tagline">See the whole flow.</span>
      <div className="header-actions"><button className="button quiet library-button" onClick={() => setModal('library')}><FolderOpen size={16} /> My diagrams <span className="count-badge">{library.docs.length}</span></button><button className="button secondary" onClick={newDocument}><Plus size={16} /> New diagram</button></div>
    </header>

    <main>
      <section className="page-heading">
        <div><div className="breadcrumb"><span>YOUR WORKSPACE</span><span>/</span><span>SANKEY DIAGRAM</span></div>
          <div className="title-row">{renaming ? <input ref={titleRef} className="title-input" aria-label="Diagram title" defaultValue={doc.title} maxLength={100} onBlur={e => { update({ ...doc, title: e.target.value.trim() || 'Untitled diagram' }); setRenaming(false); }} onKeyDown={e => { if (e.key === 'Enter') e.currentTarget.blur(); if (e.key === 'Escape') { e.currentTarget.value = doc.title; e.currentTarget.blur(); } }} /> : <button className="title-button" onClick={() => setRenaming(true)}><h1>{doc.title}</h1><Pencil size={15} /></button>}</div>
          <div className={`save-status ${storageError ? 'save-error' : ''}`}>{storageError ? <AlertCircle size={13} /> : <CheckCheck size={14} />}{storageError ? 'Device storage unavailable — export JSON to keep your work' : 'All changes saved on this device'}</div>
        </div>
        <div className="page-actions"><button className="button secondary" onClick={() => setModal('templates')}><LayoutTemplate size={16} /> Examples</button>
          <div className="menu-container"><button className="button primary" aria-expanded={menu === 'export'} onClick={() => setMenu(menu === 'export' ? null : 'export')}><ArrowDownToLine size={16} /> Export <ChevronDown size={14} /></button>{menu === 'export' && <><button className="menu-scrim" aria-label="Close export menu" onClick={() => setMenu(null)} /><div className="dropdown export-menu"><div className="dropdown-label">DOWNLOAD DIAGRAM</div><button onClick={() => exportFile('png')}><Image size={17} /><span>PNG image<small>For presentations & sharing</small></span></button><button onClick={() => exportFile('svg')}><ArrowUpRight size={17} /><span>SVG image<small>Sharp at any size</small></span></button><button onClick={() => exportFile('json')}><FileJson size={17} /><span>Editable diagram<small>Open here again later · JSON</small></span></button></div></>}</div>
        </div>
      </section>

      <section className={`workspace ${editorOpen ? '' : 'editor-collapsed'}`}>
        <aside className="editor-panel">
          <div className="editor-tabs" role="tablist" aria-label="Diagram editor" onKeyDown={e => { if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') { e.preventDefault(); const next = tab === 'data' ? 'appearance' : 'data'; setTab(next); document.getElementById(`${next}-tab`)?.focus(); } }}><button role="tab" tabIndex={tab === 'data' ? 0 : -1} id="data-tab" aria-selected={tab === 'data'} aria-controls="editor-content" className={tab === 'data' ? 'active' : ''} onClick={() => setTab('data')}><ListFilter size={16} /> Flows <span>{doc.flows.length}</span></button><button role="tab" tabIndex={tab === 'appearance' ? 0 : -1} id="appearance-tab" aria-selected={tab === 'appearance'} aria-controls="editor-content" className={tab === 'appearance' ? 'active' : ''} onClick={() => setTab('appearance')}><SlidersHorizontal size={15} /> Appearance</button></div>
          <div id="editor-content" role="tabpanel" aria-labelledby={`${tab}-tab`}>
          {tab === 'data' ? <>
            <div className="editor-intro"><h2>{doc.kind === 'jobs' ? 'Follow your progress' : doc.kind === 'custom' ? 'Connect the dots' : 'Follow the money'}<span className="intro-dot">.</span></h2><p>{doc.kind === 'jobs' ? 'Connect each stage of your search.' : doc.kind === 'custom' ? 'Connect a source to a destination.' : 'Connect where it comes from to where it goes.'}</p></div>
            <div className="flow-table"><div className="flow-table-head"><span>FROM</span><span>TO</span><span>{['applications', 'number'].includes(doc.unit) ? 'COUNT' : 'AMOUNT'}</span></div>
              {doc.flows.map(f => <FlowRow key={f.id} flow={f} color={nodeColor(f.to, analysis.nodes.findIndex(n => n.name === f.to), doc.appearance.palette)} onChange={changeFlow} onDelete={() => { update({ ...doc, flows: doc.flows.filter(r => r.id !== f.id) }); setToast('Flow deleted. Use Undo to restore it.'); }} selected={selected === f.from || selected === f.to} />)}
              {!doc.flows.length && <p className="empty-rows">Start with one connection.</p>}
            </div>
            <datalist id="node-names">{analysis.nodes.map(n => <option key={n.name} value={n.name} />)}</datalist>
            {adding ? <form className="add-form" onSubmit={addFlow}><div className="add-form-heading"><strong>New flow</strong><button type="button" className="icon-button" aria-label="Cancel new flow" onClick={() => setAdding(false)}><X size={15} /></button></div><div className="add-fields"><label>From<input ref={firstAddRef} required name="from" placeholder="e.g. Salary" list="node-names" maxLength={60} /></label><ArrowRight size={15} /><label>To<input required name="to" placeholder="e.g. Income" list="node-names" maxLength={60} /></label></div><label className="add-amount-label">{doc.unit === 'applications' ? 'Count' : 'Amount'}<input required name="amount" inputMode="decimal" placeholder="0" autoComplete="off" /></label>{addError && <p className="row-error" role="alert">{addError}</p>}<button className="button primary add-submit" type="submit"><Check size={15} /> Add flow</button></form> : <button className="add-flow-button" onClick={() => { setAdding(true); setAddError(''); }}><Plus size={16} /> Add flow</button>}
            <div className="data-note"><span className="keyboard-key">↵</span> Edit any cell. Your diagram updates live.</div>
            {analysis.balances.length > 0 && <div className="balance-warning"><AlertCircle size={16} /><div><strong>Some amounts don’t balance</strong>{analysis.balances.map(n => <p key={n.name}>{n.name}: {formatAmount(n.incoming, doc.unit)} in, {formatAmount(n.outgoing, doc.unit)} out.</p>)}</div></div>}
          </> : <div className="appearance-panel"><h2>Make it yours<span className="intro-dot">.</span></h2><p className="section-description">A few details. A clearer picture.</p><label className="setting-label">Color palette</label><div className="palette-options">{Object.entries(palettes).map(([name, colors]) => <button key={name} aria-pressed={doc.appearance.palette === name} className={`palette-option ${doc.appearance.palette === name ? 'active' : ''}`} onClick={() => update({ ...doc, appearance: { ...doc.appearance, palette: name as Diagram['appearance']['palette'] } })}><span className="swatches">{colors.slice(0, 6).map(c => <i key={c} style={{ background: c }} />)}</span><span>{name === 'original' ? 'Soft & balanced' : name === 'ocean' ? 'Ocean blues' : 'Warm sunset'}</span>{doc.appearance.palette === name && <Check size={15} />}</button>)}</div><div className="setting-divider" /><label className="switch-row"><span>Show names<small>Label each source and destination</small></span><input type="checkbox" role="switch" checked={doc.appearance.labels} onChange={e => update({ ...doc, appearance: { ...doc.appearance, labels: e.target.checked } })} /></label><label className="switch-row"><span>Show amounts<small>Keep the numbers in view</small></span><input type="checkbox" role="switch" checked={doc.appearance.values} onChange={e => update({ ...doc, appearance: { ...doc.appearance, values: e.target.checked } })} /></label><div className="setting-divider" /><label className="range-label">Flow opacity<span>{Math.round(doc.appearance.opacity * 100)}%</span><input type="range" min="0.1" max="0.8" step="0.01" value={doc.appearance.opacity} onChange={e => update({ ...doc, appearance: { ...doc.appearance, opacity: Number(e.target.value) } })} /></label><label className="range-label">Node width<span>{doc.appearance.nodeWidth} px</span><input type="range" min="6" max="28" value={doc.appearance.nodeWidth} onChange={e => update({ ...doc, appearance: { ...doc.appearance, nodeWidth: Number(e.target.value) } })} /></label><button className="button quiet reset-appearance" onClick={() => update({ ...doc, appearance: { ...appearance } })}><RotateCcw size={14} /> Reset appearance</button></div>}
          </div>
          <div className="editor-bottom"><button className="button quiet" onClick={() => importRef.current?.click()}><Upload size={14} /> Import diagram</button><button className="icon-button" aria-label="Help with Sankey diagrams" onClick={() => setModal('help')}><CircleHelp size={17} /></button></div>
        </aside>

        <div className="diagram-panel">
          <div className="canvas-toolbar"><div className="canvas-toolbar-left"><button className="icon-button panel-toggle" title={editorOpen ? 'Hide editor' : 'Show editor'} aria-label={editorOpen ? 'Hide editor' : 'Show editor'} onClick={() => setEditorOpen(!editorOpen)}>{editorOpen ? <PanelLeftClose size={16} /> : <PanelLeftOpen size={16} />}</button><span className="canvas-title">Diagram</span><span className="live-badge"><i /> Live preview</span></div><div className="canvas-toolbar-right"><label className="unit-label">Unit<select value={doc.unit} aria-label="Diagram unit" onChange={e => update({ ...doc, unit: e.target.value })}><option value="USD">$ USD</option><option value="SGD">S$ SGD</option><option value="EUR">€ EUR</option><option value="GBP">£ GBP</option><option value="applications">Applications</option><option value="number">Number</option></select></label><span className="toolbar-divider" /><button className="icon-button" onClick={undo} disabled={!past.length} aria-label="Undo" title="Undo (⌘Z)"><Undo2 size={16} /></button><button className="icon-button" onClick={redo} disabled={!future.length} aria-label="Redo" title="Redo (⌘⇧Z)"><Redo2 size={16} /></button></div></div>
          <div className="canvas-area"><div className="diagram-scroll"><div className="diagram-zoom" style={{ width: `${zoom}%`, minWidth: zoom === 100 ? undefined : `${zoom}%` }}><SankeyChart doc={doc} selected={selected} onSelect={setSelected} /></div></div>
            <div className="canvas-bottom"><span className="canvas-hint">{selected ? <button onClick={() => setSelected(null)} className="selection-clear"><X size={12} /> Clear selection</button> : <><span className="hint-dot" /> Select a node to follow its flows</>}</span><div className="zoom-controls"><button aria-label="Zoom out" title="Zoom out" disabled={zoom <= 60} onClick={() => setZoom(z => Math.max(60, z - 20))}><Minus size={14} /></button><button className="zoom-value" onClick={() => setZoom(100)} aria-label="Reset zoom">{zoom}%</button><button aria-label="Zoom in" title="Zoom in" disabled={zoom >= 180} onClick={() => setZoom(z => Math.min(180, z + 20))}><Plus size={14} /></button><span /><button aria-label={focusMode ? 'Exit full screen' : 'Expand diagram'} title={focusMode ? 'Exit full screen' : 'Expand diagram'} onClick={() => setFocusMode(!focusMode)}>{focusMode ? <X size={14} /> : <Maximize2 size={14} />}</button></div></div>
          </div>
          <div className="diagram-summary"><div className="summary-total"><span>{totalLabel}</span><strong>{formatAmount(analysis.total, doc.unit)}</strong></div><div className="summary-detail"><span>{sourceCount}</span> {sourceCount === 1 ? 'source' : 'sources'}<i /> <span>{analysis.nodes.filter(n => !n.outgoing).length}</span> destinations<i /><span>{doc.flows.length}</span> flows</div><div className={`balance-status ${analysis.balances.length ? 'unbalanced' : ''}`}>{analysis.balances.length ? <AlertCircle size={14} /> : <Check size={14} />}{analysis.balances.length ? 'Review totals' : doc.flows.length ? 'All flows balanced' : 'Ready for your first flow'}</div></div>
        </div>
      </section>

      <section className="examples-strip"><div className="examples-label"><LayoutTemplate size={19} /><div><h2>A starting point for<br />every kind of flow.</h2><span>Pick an example. Make it yours.</span></div></div>{examples.map(ex => <button key={ex.kind} className={`example-card ${ex.className}`} onClick={() => { addDocument(template(ex.kind)); setToast(`${ex.title} example opened`); }}><div className="example-card-copy"><span><ex.icon size={16} /> {ex.title}</span><p>{ex.description}</p></div><MiniFlow kind={ex.kind} /><ArrowUpRight className="example-arrow" size={15} /></button>)}</section>
      <footer className="page-footer"><span><LockKeyhole size={12} /> Your data stays in your browser.</span><span>A little clarity goes a long way.</span></footer>
    </main>
    <input ref={importRef} hidden type="file" accept=".json,application/json" onChange={e => importFile(e.target.files?.[0])} />
    {toast && <div className="toast" role="status"><Check size={16} /><span>{toast}</span><button aria-label="Dismiss notification" onClick={() => setToast('')}><X size={14} /></button></div>}
    {modal === 'templates' && <Modal title="Start with an example" onClose={() => setModal(null)} wide><p className="modal-description">Real connections, ready to edit. Your current diagram stays saved.</p><div className="template-grid">{examples.map(ex => <button key={ex.kind} className={`template-card ${ex.className}`} onClick={() => addDocument(template(ex.kind))}><MiniFlow kind={ex.kind} /><ex.icon size={21} /><h3>{ex.title}</h3><p>{ex.description}</p><span>Use example <ArrowRight size={14} /></span></button>)}</div><button className="button quiet blank-template" onClick={newDocument}><Plus size={15} /> Or start with a blank diagram</button></Modal>}
    {modal === 'library' && <Modal title="My diagrams" onClose={() => setModal(null)}><p className="modal-description">Saved in this browser. Export a diagram to keep a copy.</p><div className="library-list">{library.docs.map(d => <div key={d.id} className={`library-item ${d.id === doc.id ? 'active' : ''}`}><button onClick={() => activate(d.id)}><span className="library-icon"><ListFilter size={20} /></span><span><strong>{d.title}</strong><small>{d.flows.length} flows · {d.unit}</small></span>{d.id === doc.id && <Check size={17} />}</button><button className="icon-button" aria-label={`Duplicate ${d.title}`} title="Duplicate diagram" onClick={() => { addDocument({ ...structuredClone(d), id: uid(), title: `${d.title} (copy)` }); setToast('Diagram duplicated'); }}><Copy size={15} /></button></div>)}</div><button className="button primary library-new" onClick={newDocument}><Plus size={16} /> New diagram</button></Modal>}
    {modal === 'help' && <Modal title="A flow is a simple connection" onClose={() => setModal(null)}><div className="help-example"><span>Salary</span><ArrowRight size={18} /><span>Income</span><strong>$5,200</strong></div><div className="help-copy"><p><strong>From</strong> is where something starts. <strong>To</strong> is where it goes. <strong>Amount</strong> controls the width of the flow.</p><p>Use the same name to connect flows. Names are case-sensitive. Select a node in the diagram to highlight its connections.</p><p>Keep flows moving forward. If money or applications stop at a step, that step can be a destination.</p><p>Your diagrams save automatically in this browser. Use <strong>Export → Editable diagram</strong> to back up your work or move it to another device.</p></div></Modal>}
  </div>;
}
