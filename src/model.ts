export type Flow = { id: string; from: string; to: string; amount: number };
export type Appearance = { palette: 'original' | 'ocean' | 'sunset'; labels: boolean; values: boolean; valueDisplay: 'values' | 'percentages' | 'both'; percentageBase: string | null; opacity: number; nodeWidth: number };
export const currencies = [
  { code: 'USD', name: 'US dollar' },
  { code: 'SGD', name: 'Singapore dollar' },
  { code: 'EUR', name: 'Euro' },
  { code: 'GBP', name: 'British pound' },
  { code: 'JPY', name: 'Japanese yen' },
  { code: 'CNY', name: 'Chinese yuan' },
  { code: 'AUD', name: 'Australian dollar' },
  { code: 'CAD', name: 'Canadian dollar' },
  { code: 'CHF', name: 'Swiss franc' },
  { code: 'HKD', name: 'Hong Kong dollar' },
  { code: 'INR', name: 'Indian rupee' },
  { code: 'MYR', name: 'Malaysian ringgit' },
  { code: 'IDR', name: 'Indonesian rupiah' },
  { code: 'NZD', name: 'New Zealand dollar' },
] as const;
export type Currency = typeof currencies[number]['code'];
export type NumberFormat = 'currency' | 'decimal' | 'integer';
export type NumberSettings = { numberFormat: NumberFormat; currency: Currency };
export type Diagram = NumberSettings & { version: 2; id: string; title: string; columnTitles: string[]; kind: 'budget' | 'business' | 'jobs' | 'custom'; flows: Flow[]; appearance: Appearance };
export const COLUMN_TITLE_MAX_LENGTH = 60;
export function defaultColumnTitles(kind: Diagram['kind']): string[] {
  switch (kind) {
    case 'budget': return ['Income', 'Total', 'Allocation'];
    case 'business': return ['Sources', 'Revenue', 'Gross margin', 'Operations', 'Net result'];
    case 'jobs': return ['Applications', 'Screening', 'Interviews', 'Interview results', 'Offer decisions'];
    default: return [];
  }
}
const cleanColumnTitle = (title: string) => title.replace(/\s+/g, ' ').trim().slice(0, COLUMN_TITLE_MAX_LENGTH);
export function columnTitle(doc: Pick<Diagram, 'kind' | 'columnTitles'>, depth: number) {
  return doc.columnTitles?.[depth]?.trim() || defaultColumnTitles(doc.kind)[depth] || `Column ${depth + 1}`;
}
export function renameColumn(doc: Diagram, depth: number, title: string): Diagram {
  if (!Number.isInteger(depth) || depth < 0 || depth > 300) return doc;
  const columnTitles = [...(doc.columnTitles ?? defaultColumnTitles(doc.kind))];
  columnTitles[depth] = cleanColumnTitle(title);
  return { ...doc, columnTitles };
}
export const defaultNumberSettings: NumberSettings = { numberFormat: 'currency', currency: 'USD' };
export const appearance: Appearance = { palette: 'original', labels: true, values: true, valueDisplay: 'values', percentageBase: null, opacity: 0.34, nodeWidth: 13 };
export const uid = () => crypto.randomUUID();
const rows = (data: [string, string, number][]): Flow[] => data.map(([from, to, amount]) => ({ id: uid(), from, to, amount }));
export function template(kind: 'budget' | 'business' | 'jobs'): Diagram {
  const examples: Record<typeof kind, { title: string; numberFormat: NumberFormat; flows: [string, string, number][] }> = {
    budget: { title: 'My monthly budget', numberFormat: 'currency', flows: [
      ['Salary', 'Total income', 5200], ['Freelance', 'Total income', 800],
      ['Total income', 'Housing', 1800], ['Total income', 'Living expenses', 1200],
      ['Total income', 'Savings', 1500], ['Total income', 'Food & dining', 700],
      ['Total income', 'Transport', 400], ['Total income', 'A little fun', 400],
    ] },
    business: { title: 'Company profit & loss', numberFormat: 'currency', flows: [
      ['Product sales', 'Revenue', 840000], ['Services', 'Revenue', 360000],
      ['Revenue', 'Cost of sales', 420000], ['Revenue', 'Gross profit', 780000],
      ['Gross profit', 'Operating costs', 480000], ['Gross profit', 'Operating profit', 300000],
      ['Operating profit', 'Taxes', 60000], ['Operating profit', 'Net profit', 240000],
    ] },
    jobs: { title: 'My job search', numberFormat: 'integer', flows: [
      ['Applications', 'No response', 50], ['Applications', 'Not shortlisted', 25], ['Applications', 'Shortlisted', 25],
      ['Shortlisted', 'Interviews', 20], ['Shortlisted', 'Withdrawn', 5],
      ['Interviews', 'Not selected', 12], ['Interviews', 'Offers', 8],
      ['Offers', 'Declined', 5], ['Offers', 'Accepted', 3],
    ] },
  };
  return { version: 2, id: uid(), kind, currency: 'USD', columnTitles: defaultColumnTitles(kind), ...examples[kind], flows: rows(examples[kind].flows), appearance: { ...appearance } };
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
  const balances = [...nodes.values()].filter(n => n.incoming > 0 && n.outgoing > 0 && balanceDifference(n) !== 0);
  return { nodes: [...nodes.values()], links: [...edges.values()], errors: [...new Set(errors)], balances, total: [...nodes.values()].filter(n => n.incoming === 0).reduce((s, n) => s + n.outgoing, 0) };
}

export type NodeRenameResult = { ok: true; diagram: Diagram; name: string } | { ok: false; error: string; mergeRequired?: boolean };

/** Rename every connection together, preserving row identities and undoable source data. */
export function renameNode(doc: Diagram, oldName: string, newName: string, allowMerge = false): NodeRenameResult {
  const previous = oldName.trim(), name = newName.trim();
  if (!name) return { ok: false, error: 'Enter a name for this node.' };
  if (name.length > 60) return { ok: false, error: 'Keep names to 60 characters or fewer.' };
  const names = new Set(doc.flows.flatMap(flow => [flow.from.trim(), flow.to.trim()]));
  if (!names.has(previous)) return { ok: false, error: 'This node no longer exists.' };
  if (previous === name) return { ok: true, diagram: doc, name };
  const flows = doc.flows.map(flow => {
    const from = flow.from.trim() === previous ? name : flow.from;
    const to = flow.to.trim() === previous ? name : flow.to;
    return from === flow.from && to === flow.to ? flow : { ...flow, from, to };
  });
  if (flows.some(flow => flow.from.trim() === flow.to.trim())) {
    return { ok: false, error: `Renaming to “${name}” would connect a node to itself. Choose another name.` };
  }
  const result = analyze(flows);
  if (result.errors.length) return { ok: false, error: result.errors[0] };
  if (names.has(name) && !allowMerge) {
    return { ok: false, error: `“${name}” already exists. Merge the nodes to combine their connections.`, mergeRequired: true };
  }
  return { ok: true, name, diagram: {
    ...doc,
    flows,
    appearance: doc.appearance.percentageBase === previous
      ? { ...doc.appearance, percentageBase: name }
      : doc.appearance,
  } };
}

/** Keep actions and warnings consistent, including very small fractional flows. */
export function balanceDifference(node: { incoming: number; outgoing: number }): number {
  const difference = node.incoming - node.outgoing;
  return Math.abs(difference) <= 1e-9 * Math.max(node.incoming, node.outgoing) ? 0 : difference;
}

/** A named node uses received flow, or sent flow when it is a source. */
export function getPercentageReference(doc: Diagram, analysis = analyze(doc.flows)): { name: string; value: number } {
  const node = analysis.nodes.find(item => item.name === doc.appearance.percentageBase);
  return node
    ? { name: node.name, value: node.incoming > 0 ? node.incoming : node.outgoing }
    : { name: 'Total inflow', value: analysis.total };
}

const percentageFormatter = new Intl.NumberFormat('en-US', { maximumFractionDigits: 1 });
export function formatPercentage(value: number, base: number): string {
  if (!Number.isFinite(value) || value < 0 || !Number.isFinite(base) || base <= 0) return '—';
  if (value === 0) return '0%';
  // Use logarithms only for enormous ratios so even finite inputs whose division
  // would overflow have a bounded, meaningful label instead of Infinity%.
  const logPercent = Math.log10(value) - Math.log10(base) + 2;
  if (logPercent >= 9) {
    let exponent = Math.floor(logPercent);
    let coefficient = Math.round(10 ** (logPercent - exponent) * 10) / 10;
    if (coefficient === 10) { coefficient = 1; exponent += 1; }
    return `${coefficient}e+${exponent}%`;
  }
  const percent = value / base * 100;
  return percent < 0.1 ? '<0.1%' : `${percentageFormatter.format(percent)}%`;
}

const formatters = new Map<string, Intl.NumberFormat>();
export function formatAmount(value: number, settings: NumberSettings, compact = false) {
  const key = `${settings.numberFormat}:${settings.currency}:${compact}`;
  let formatter = formatters.get(key);
  if (!formatter) {
    const options: Intl.NumberFormatOptions = { notation: compact ? 'compact' : 'standard', useGrouping: true };
    if (settings.numberFormat === 'currency') {
      options.style = 'currency';
      options.currency = settings.currency;
      if (compact) { options.minimumFractionDigits = 0; options.maximumFractionDigits = 1; }
    } else if (settings.numberFormat === 'integer') {
      options.maximumFractionDigits = 0;
    } else if (compact) {
      options.maximumFractionDigits = 1;
    } else {
      // Keep small fractional flows visible without exposing floating-point noise.
      options.maximumSignificantDigits = 15;
    }
    formatter = new Intl.NumberFormat('en-US', options);
    formatters.set(key, formatter);
  }
  return formatter.format(value);
}

export function numberFormatLabel(settings: NumberSettings) {
  return settings.numberFormat === 'currency' ? `${settings.currency} · Currency` : settings.numberFormat === 'integer' ? 'Whole number' : 'Decimal';
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
  if (!raw || typeof raw !== 'object') throw new Error('Choose a Flow JSON file exported from this app.');
  const d = raw as Record<string, unknown>;
  if ((d.version !== 1 && d.version !== 2) || typeof d.title !== 'string' || !Array.isArray(d.flows) || d.flows.length > 300) throw new Error('This file is not a supported Flow diagram (maximum 300 flows).');
  if (d.version === 1 && typeof d.unit !== 'string') throw new Error('This older diagram is missing its number format.');
  const isCurrency = (value: unknown): value is Currency => currencies.some(c => c.code === value);
  const numberFormat: NumberFormat = d.version === 1
    ? isCurrency(d.unit) ? 'currency' : d.unit === 'applications' ? 'integer' : 'decimal'
    : typeof d.numberFormat === 'string' && ['currency', 'decimal', 'integer'].includes(d.numberFormat) ? d.numberFormat as NumberFormat : 'decimal';
  const currency: Currency = d.version === 1 && isCurrency(d.unit) ? d.unit : isCurrency(d.currency) ? d.currency : 'USD';
  const flowIds = new Set<string>();
  const flows = d.flows.map((f: unknown) => {
    if (!f || typeof f !== 'object') throw new Error('Every flow needs From, To, and Amount values.');
    const r = f as Record<string, unknown>;
    if (typeof r.from !== 'string' || typeof r.to !== 'string' || typeof r.amount !== 'number') throw new Error('Every flow needs From, To, and a numeric Amount.');
    const id = typeof r.id === 'string' && r.id.trim() && !flowIds.has(r.id) ? r.id : uid();
    flowIds.add(id);
    return { id, from: r.from.trim(), to: r.to.trim(), amount: r.amount };
  });
  const result = analyze(flows);
  if (result.errors.length) throw new Error(result.errors[0]);
  const a = (d.appearance ?? {}) as Partial<Appearance>;
  const kind: Diagram['kind'] = typeof d.kind === 'string' && ['budget', 'business', 'jobs'].includes(d.kind) ? d.kind as Diagram['kind'] : 'custom';
  // Preserve slots and hidden columns so edits survive a temporarily shorter graph.
  const columnTitles = Array.isArray(d.columnTitles)
    ? d.columnTitles.slice(0, 301).map(title => typeof title === 'string' ? cleanColumnTitle(title) : '')
    : defaultColumnTitles(kind);
  return { version: 2, id: typeof d.id === 'string' && d.id.trim() ? d.id : uid(), title: d.title.slice(0, 100) || 'Untitled diagram', columnTitles, numberFormat, currency, kind, flows,
    appearance: { palette: typeof a.palette === 'string' && Object.hasOwn(palettes, a.palette) ? a.palette : 'original', labels: typeof a.labels === 'boolean' ? a.labels : true, values: typeof a.values === 'boolean' ? a.values : true, valueDisplay: ['values', 'percentages', 'both'].includes(a.valueDisplay as string) ? a.valueDisplay! : 'values', percentageBase: typeof a.percentageBase === 'string' && result.nodes.some(node => node.name === a.percentageBase!.trim()) ? a.percentageBase.trim() : null, opacity: typeof a.opacity === 'number' && a.opacity >= 0.1 && a.opacity <= 0.8 ? a.opacity : 0.34, nodeWidth: typeof a.nodeWidth === 'number' && a.nodeWidth >= 6 && a.nodeWidth <= 28 ? a.nodeWidth : 13 } };
}
