export type Flow = { id: string; from: string; to: string; amount: number };
export type Appearance = { palette: 'original' | 'ocean' | 'sunset'; labels: boolean; values: boolean; opacity: number; nodeWidth: number };
export type Diagram = { version: 1; id: string; title: string; unit: string; kind: 'budget' | 'business' | 'jobs' | 'custom'; flows: Flow[]; appearance: Appearance };
export const appearance: Appearance = { palette: 'original', labels: true, values: true, opacity: 0.34, nodeWidth: 13 };
export const uid = () => crypto.randomUUID();
const rows = (data: [string, string, number][]): Flow[] => data.map(([from, to, amount]) => ({ id: uid(), from, to, amount }));
export function template(kind: 'budget' | 'business' | 'jobs'): Diagram {
  const examples = {
    budget: { title: 'My monthly budget', unit: 'USD', flows: rows([
      ['Salary', 'Total income', 5200], ['Freelance', 'Total income', 800],
      ['Total income', 'Housing', 1800], ['Total income', 'Living expenses', 1200],
      ['Total income', 'Savings', 1500], ['Total income', 'Food & dining', 700],
      ['Total income', 'Transport', 400], ['Total income', 'A little fun', 400],
    ]) },
    business: { title: 'Company profit & loss', unit: 'USD', flows: rows([
      ['Product sales', 'Revenue', 840000], ['Services', 'Revenue', 360000],
      ['Revenue', 'Cost of sales', 420000], ['Revenue', 'Gross profit', 780000],
      ['Gross profit', 'Operating costs', 480000], ['Gross profit', 'Operating profit', 300000],
      ['Operating profit', 'Taxes', 60000], ['Operating profit', 'Net profit', 240000],
    ]) },
    jobs: { title: 'My job search', unit: 'applications', flows: rows([
      ['Applications', 'No response', 50], ['Applications', 'Not shortlisted', 25], ['Applications', 'Shortlisted', 25],
      ['Shortlisted', 'Interviews', 20], ['Shortlisted', 'Withdrawn', 5],
      ['Interviews', 'Not selected', 12], ['Interviews', 'Offers', 8],
      ['Offers', 'Declined', 5], ['Offers', 'Accepted', 3],
    ]) },
  };
  return { version: 1, id: uid(), kind, ...examples[kind], appearance: { ...appearance } };
}

export function analyze(flows: Flow[]) {
  const nodes = new Map<string, { name: string; incoming: number; outgoing: number }>();
  const edges = new Map<string, { source: string; target: string; value: number; ids: string[] }>();
  const errors: string[] = [];
  for (const f of flows) {
    const from = f.from.trim(), to = f.to.trim();
    if (!from || !to) { errors.push('Give every flow a From and To name.'); continue; }
    if (from.length > 60 || to.length > 60) { errors.push('Keep names to 60 characters or fewer.'); continue; }
    if (!Number.isFinite(f.amount) || f.amount <= 0 || f.amount > 1e15) { errors.push('Enter an amount greater than 0 and no larger than 1 quadrillion.'); continue; }
    if (from === to) { errors.push('A flow needs two different names.'); continue; }
    for (const name of [from, to]) if (!nodes.has(name)) nodes.set(name, { name, incoming: 0, outgoing: 0 });
    nodes.get(from)!.outgoing += f.amount;
    nodes.get(to)!.incoming += f.amount;
    const key = JSON.stringify([from, to]);
    const edge = edges.get(key);
    if (edge) { edge.value += f.amount; edge.ids.push(f.id); }
    else edges.set(key, { source: from, target: to, value: f.amount, ids: [f.id] });
  }
  const visiting = new Set<string>(), visited = new Set<string>();
  const adjacency = new Map<string, string[]>();
  for (const e of edges.values()) adjacency.set(e.source, [...(adjacency.get(e.source) ?? []), e.target]);
  function cycle(name: string): boolean {
    if (visiting.has(name)) return true;
    if (visited.has(name)) return false;
    visiting.add(name);
    for (const next of adjacency.get(name) ?? []) if (cycle(next)) return true;
    visiting.delete(name); visited.add(name); return false;
  }
  if ([...nodes.keys()].some(cycle)) errors.push('This connection creates a loop. Flows must move forward, without returning to an earlier step.');
  const balances = [...nodes.values()].filter(n => n.incoming > 0 && n.outgoing > 0 && Math.abs(n.incoming - n.outgoing) > 1e-9 * Math.max(1, n.incoming, n.outgoing));
  return { nodes: [...nodes.values()], links: [...edges.values()], errors: [...new Set(errors)], balances, total: [...nodes.values()].filter(n => n.incoming === 0).reduce((s, n) => s + n.outgoing, 0) };
}

export function formatAmount(value: number, unit: string, compact = false) {
  const numeric = new Intl.NumberFormat('en-US', { maximumFractionDigits: compact ? 1 : 2, notation: compact ? 'compact' : 'standard' });
  const symbol: Record<string, string> = { USD: '$', SGD: 'S$', EUR: '€', GBP: '£' };
  return `${symbol[unit] ?? ''}${numeric.format(value)}`;
}

export const palettes = {
  original: ['#7c82d9', '#a29ae3', '#698acb', '#dca080', '#69ad9b', '#c68daa', '#66a7b6', '#bfad71', '#8291bc'],
  ocean: ['#387fbd', '#58a3bd', '#496bae', '#6bbdc7', '#417f97', '#8bc3c3', '#789bd4', '#6395a5', '#91b9e7'],
  sunset: ['#ad718d', '#d98e82', '#c080ad', '#e4a96c', '#b79ab9', '#ccbc81', '#b98670', '#dcb58c', '#ce88a4'],
};
export function nodeColor(name: string, index: number, palette: Appearance['palette']) {
  if (palette === 'original') {
    if (/savings|profit|accepted|offers/i.test(name)) return '#69ad9b';
    if (/housing|cost|not selected|not shortlisted/i.test(name)) return '#dca080';
    if (/total income|revenue|applications/i.test(name)) return '#7783d3';
    if (/salary/i.test(name)) return '#7c82d9';
    if (/freelance/i.test(name)) return '#aaa0db';
    if (/living/i.test(name)) return '#829acb';
    if (/food/i.test(name)) return '#c68daa';
    if (/transport/i.test(name)) return '#66a7b6';
    if (/fun/i.test(name)) return '#bfad71';
  }
  return palettes[palette][index % palettes[palette].length];
}

export function parseDocument(raw: unknown): Diagram {
  if (!raw || typeof raw !== 'object') throw new Error('Choose a Sankey JSON file exported from this app.');
  const d = raw as Record<string, unknown>;
  if (d.version !== 1 || typeof d.title !== 'string' || typeof d.unit !== 'string' || !Array.isArray(d.flows) || d.flows.length > 300) throw new Error('This file is not a supported Sankey diagram (maximum 300 flows).');
  const flows = d.flows.map((f: unknown) => {
    if (!f || typeof f !== 'object') throw new Error('Every flow needs From, To, and Amount values.');
    const r = f as Record<string, unknown>;
    if (typeof r.from !== 'string' || typeof r.to !== 'string' || typeof r.amount !== 'number') throw new Error('Every flow needs From, To, and a numeric Amount.');
    return { id: uid(), from: r.from.trim(), to: r.to.trim(), amount: r.amount };
  });
  const result = analyze(flows);
  if (result.errors.length) throw new Error(result.errors[0]);
  const a = (d.appearance ?? {}) as Partial<Appearance>;
  return { version: 1, id: typeof d.id === 'string' ? d.id : uid(), title: d.title.slice(0, 100) || 'Untitled diagram', unit: ['USD', 'SGD', 'EUR', 'GBP', 'applications', 'number'].includes(d.unit) ? d.unit : 'number', kind: ['budget', 'business', 'jobs'].includes(String(d.kind)) ? d.kind as Diagram['kind'] : 'custom', flows,
    appearance: { palette: a.palette && Object.hasOwn(palettes, a.palette) ? a.palette : 'original', labels: typeof a.labels === 'boolean' ? a.labels : true, values: typeof a.values === 'boolean' ? a.values : true, opacity: typeof a.opacity === 'number' && a.opacity >= 0.1 && a.opacity <= 0.8 ? a.opacity : 0.34, nodeWidth: typeof a.nodeWidth === 'number' && a.nodeWidth >= 6 && a.nodeWidth <= 28 ? a.nodeWidth : 13 } };
}
