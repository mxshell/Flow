import { useMemo, useState } from 'react';
import { sankeyLinkHorizontal } from 'd3-sankey';
import { formatAmount } from './model';
import type { Diagram } from './model';
import { buildLayout } from './layout';
import type { ChartNode as Node, ChartLink as Link, NodeData as N, LinkData as L } from './layout';

export default function SankeyChart({ doc, selected, onSelect }: { doc: Diagram; selected: string | null; onSelect: (name: string | null) => void }) {
  const [hover, setHover] = useState<{ label: string; value: number; percent: number; x: number; y: number } | null>(null);
  const result = useMemo(() => buildLayout(doc), [doc.flows, doc.appearance.nodeWidth, doc.appearance.palette]);
  const path = sankeyLinkHorizontal<N, L>();
  if (!result) return <div className="chart-empty"><div className="empty-flow-icon">↗</div><h3>Your first flow starts here</h3><p>Add a source, a destination, and an amount.<br />Your diagram will appear as you build.</p></div>;
  const { graph, width, height, maxDepth } = result;
  const connected = (link: Link) => !selected || (link.source as Node).name === selected || (link.target as Node).name === selected;
  const showLink = (link: Link) => {
    const s = link.source as Node, t = link.target as Node;
    setHover({ label: `${s.name} → ${t.name}`, value: link.value, percent: link.value / (s.value || 1), x: ((s.x1! + t.x0!) / 2), y: Math.max(25, (link.y0! + link.y1!) / 2 - 45) });
  };
  return <svg id="sankey-diagram" viewBox={`0 0 ${width} ${height}`} xmlns="http://www.w3.org/2000/svg" aria-label={`${doc.title}, interactive Sankey diagram. ${graph.nodes.length} nodes and ${graph.links.length} connections.`} role="group" style={{ fontFamily: "'DM Sans Variable', sans-serif", minWidth: width > 1000 ? width : undefined, minHeight: height > 555 ? height : undefined }}>
    <title>{doc.title}</title><desc>{doc.flows.map(f => `${f.from} to ${f.to}: ${formatAmount(f.amount, doc.unit)}`).join('. ')}</desc>
    <defs>{graph.links.map((l, i) => <linearGradient key={i} id={`flow-gradient-${i}`} gradientUnits="userSpaceOnUse" x1={(l.source as Node).x1} x2={(l.target as Node).x0}><stop offset="0%" stopColor={(l.source as Node).color} /><stop offset="100%" stopColor={(l.target as Node).color} /></linearGradient>)}</defs>
    {doc.kind === 'budget' && maxDepth === 2 && ['INCOME', 'TOTAL', 'ALLOCATION'].map((label, i) => <text key={label} x={i === 0 ? 155 : i === 1 ? 480 : 805} y={25} fill="#8a91a3" fontSize="10.5" letterSpacing="1.5" fontWeight="600" textAnchor="middle">{label}</text>)}
    <g fill="none">{graph.links.map((l, i) => <path key={i} d={path(l) ?? ''} stroke={`url(#flow-gradient-${i})`} strokeWidth={Math.max(1, l.width ?? 1)} opacity={connected(l) ? doc.appearance.opacity : 0.07} className="sankey-link" onMouseEnter={() => showLink(l)} onMouseLeave={() => setHover(null)} onClick={() => onSelect(selected === (l.source as Node).name ? null : (l.source as Node).name)}><title>{(l.source as Node).name} → {(l.target as Node).name}: {formatAmount(l.value, doc.unit)}</title></path>)}</g>
    {graph.nodes.map(n => {
      const first = n.depth === 0, last = (n.sourceLinks?.length ?? 0) === 0;
      const x = first ? n.x0! - 12 : last ? n.x1! + 12 : n.x0! + (n.x1! - n.x0!) / 2;
      const y = first || last ? (n.y0! + n.y1!) / 2 - (doc.appearance.values ? 5 : -5) : n.y0! - (doc.appearance.values ? 29 : 12);
      const name = n.name.length > 22 ? `${n.name.slice(0, 20)}…` : n.name;
      return <g key={n.name} className="sankey-node" role="button" tabIndex={0} aria-label={`${n.name}, ${formatAmount(n.value ?? 0, doc.unit)}. Highlight connected flows.`} aria-pressed={selected === n.name} onClick={() => onSelect(selected === n.name ? null : n.name)} onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onSelect(selected === n.name ? null : n.name); } }}>
        <title>{n.name}: {formatAmount(n.value ?? 0, doc.unit)}</title>
        <rect x={n.x0} y={n.y0} width={n.x1! - n.x0!} height={Math.max(2, n.y1! - n.y0!)} fill={n.color} rx="3" stroke={selected === n.name ? '#253359' : 'none'} strokeWidth="2" />
        {doc.appearance.labels && <text x={x} y={y} textAnchor={first ? 'end' : last ? 'start' : 'middle'} fill="#3a435c" fontSize="15" fontWeight="550">{name}</text>}
        {doc.appearance.values && <text x={x} y={doc.appearance.labels ? y + 20 : y + 9} textAnchor={first ? 'end' : last ? 'start' : 'middle'} fill="#727c92" fontSize="14" fontWeight="450">{formatAmount(n.value ?? 0, doc.unit, (n.depth ?? 0) > 0 && maxDepth > 3)}</text>}
      </g>;
    })}
    {hover && <g className="chart-tooltip" pointerEvents="none" transform={`translate(${Math.min(width - 265, Math.max(15, hover.x - 115))},${hover.y})`}><rect width="250" height="60" rx="9" fill="#25304b" /><text x="13" y="23" fill="white" fontSize="12">{hover.label.length > 34 ? `${hover.label.slice(0, 32)}…` : hover.label}</text><text x="13" y="44" fill="#d8deee" fontSize="12">{formatAmount(hover.value, doc.unit)} · {Math.round(hover.percent * 100)}% of source</text></g>}
  </svg>;
}
