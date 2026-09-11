import { sankey, sankeyLeft } from 'd3-sankey';
import type { SankeyNode, SankeyLink } from 'd3-sankey';
import { analyze, nodeColor } from './model';
import type { Diagram } from './model';

export type NodeData = { name: string; color: string; incoming: number; outgoing: number };
export type LinkData = { ids: string[] };
export type ChartNode = SankeyNode<NodeData, LinkData>;
export type ChartLink = SankeyLink<NodeData, LinkData>;

export function buildLayout(doc: Diagram, availableWidth = 1000) {
  const data = analyze(doc.flows);
  if (!data.links.length || data.errors.length) return null;
  const depths = new Map<string, number>();
  const predecessors = new Map<string, string[]>();
  data.links.forEach(l => predecessors.set(l.target, [...(predecessors.get(l.target) ?? []), l.source]));
  function depth(name: string): number {
    if (depths.has(name)) return depths.get(name)!;
    const value = Math.max(-1, ...(predecessors.get(name) ?? []).map(depth)) + 1;
    depths.set(name, value); return value;
  }
  const columns = new Map<number, number>();
  data.nodes.forEach(n => { const d = depth(n.name); columns.set(d, (columns.get(d) ?? 0) + 1); });
  const maxDepth = Math.max(...depths.values());
  const height = Math.max(590, Math.max(...columns.values()) * 62 + 150);
  const width = Math.max(760, availableWidth, maxDepth * 220 + 340);
  const layout = sankey<NodeData, LinkData>().nodeId(n => n.name).nodeAlign(sankeyLeft).nodeWidth(doc.appearance.nodeWidth).nodePadding(32).nodeSort(null).iterations(48).extent([[155, 100], [width - 195, height - 60]]);
  const graph = layout({ nodes: data.nodes.map((n, i) => ({ ...n, color: nodeColor(n.name, i, doc.appearance.palette) })), links: data.links.map(l => ({ ...l })) });
  const headings = [...new Map(graph.nodes.map(n => [n.depth!, { depth: n.depth!, x: (n.x0! + n.x1!) / 2 }])).values()].sort((a, b) => a.depth - b.depth);
  return { graph, width, height, maxDepth, headings };
}
