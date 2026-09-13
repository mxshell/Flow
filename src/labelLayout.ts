import { sankey } from 'd3-sankey';
import type { ChartLink, ChartNode, LinkData, NodeData } from './layout';
import type { buildLayout } from './layout';

/** A complete visible label, relative to its node's upper-left corner. */
export type LabelBounds = { left: number; right: number; top: number; bottom: number };

type ChartLayout = NonNullable<ReturnType<typeof buildLayout>>;
type Interval = { start: number; size: number };
const GAP = 8;
const TOP = 64;
const BOTTOM = 60;
const SIDE = 12;

function length(intervals: readonly Interval[]) {
  return intervals.reduce((sum, interval) => sum + interval.size, 0) + Math.max(0, intervals.length - 1) * GAP;
}

/**
 * Ordered, non-overlapping intervals nearest their preferred positions.
 * Subtracting the occupied prefixes turns separation into monotonicity. PAVA
 * solves that least-squares projection in linear time, then the shared bounds
 * clamp the result without breaking its order.
 */
function pack(intervals: readonly Interval[], lower: number, upper: number) {
  const prefixes: number[] = [];
  const blocks: { first: number; last: number; mean: number; count: number }[] = [];
  let prefix = 0;
  intervals.forEach((interval, index) => {
    prefixes.push(prefix);
    blocks.push({ first: index, last: index, mean: interval.start - prefix, count: 1 });
    while (blocks.length > 1 && blocks[blocks.length - 2].mean > blocks[blocks.length - 1].mean) {
      const right = blocks.pop()!;
      const left = blocks.pop()!;
      const count = left.count + right.count;
      blocks.push({ first: left.first, last: right.last, count,
        mean: left.mean * (left.count / count) + right.mean * (right.count / count) });
    }
    prefix += interval.size + GAP;
  });
  const maximum = Math.max(lower, upper - length(intervals));
  const positions: number[] = [];
  blocks.forEach(block => {
    const mean = Math.max(lower, Math.min(maximum, block.mean));
    for (let index = block.first; index <= block.last; index++) positions[index] = mean + prefixes[index];
  });
  return positions;
}

function validBounds(bounds: LabelBounds | undefined): LabelBounds | undefined {
  if (!bounds || ![bounds.left, bounds.right, bounds.top, bounds.bottom].every(Number.isFinite)) return;
  if (bounds.right < bounds.left || bounds.bottom < bounds.top
    || !Number.isFinite(bounds.right - bounds.left) || !Number.isFinite(bounds.bottom - bounds.top)) return;
  return bounds;
}

/**
 * Make space for measured label rectangles without scaling any flow. Each
 * column has a disjoint horizontal envelope; within it, node/label envelopes
 * have disjoint vertical intervals. Together these constraints guarantee that
 * every pair of visible label rectangles is separated. Canvas growth occurs
 * only if the occupied intervals cannot fit inside the original canvas.
 */
export function layoutWithLabels(base: ChartLayout, bounds: ReadonlyMap<string, LabelBounds>): ChartLayout {
  const nodeCopies = new Map<ChartNode, ChartNode>();
  const nodes = base.graph.nodes.map(node => {
    const copy: ChartNode = { ...node, sourceLinks: [], targetLinks: [] };
    nodeCopies.set(node, copy);
    return copy;
  });
  const linkCopies = new Map<ChartLink, ChartLink>();
  const links = base.graph.links.map(link => {
    const copy: ChartLink = { ...link, ids: [...link.ids],
      source: nodeCopies.get(link.source as ChartNode)!, target: nodeCopies.get(link.target as ChartNode)! };
    linkCopies.set(link, copy);
    return copy;
  });
  // Preserve D3's existing stacking order, rather than reconstructing it from
  // graph.links, whose input order can differ from sourceLinks/targetLinks.
  base.graph.nodes.forEach(node => {
    const copy = nodeCopies.get(node)!;
    copy.sourceLinks = (node.sourceLinks ?? []).map(link => linkCopies.get(link)!);
    copy.targetLinks = (node.targetLinks ?? []).map(link => linkCopies.get(link)!);
  });

  const byDepth = new Map<number, ChartNode[]>();
  nodes.forEach(node => {
    const depth = node.depth!;
    const column = byDepth.get(depth) ?? [];
    column.push(node);
    byDepth.set(depth, column);
  });
  const columns = [...byDepth.entries()].sort(([a], [b]) => a - b).map(([depth, members]) => {
    members.sort((a, b) => a.y0! - b.y0!);
    let left = Infinity;
    let right = -Infinity;
    const intervals = members.map(node => {
      const label = validBounds(bounds.get(node.name));
      const top = Math.min(0, label?.top ?? 0);
      const bottom = Math.max(2, node.y1! - node.y0!, label?.bottom ?? 0);
      left = Math.min(left, node.x0! + Math.min(0, label?.left ?? 0));
      right = Math.max(right, node.x1!, node.x0! + (label?.right ?? 0));
      return { start: node.y0! + top, size: bottom - top };
    });
    return { depth, members, intervals, start: left, size: right - left,
      center: (members[0].x0! + members[0].x1!) / 2 };
  });
  // Collision removal must not shorten existing ribbons: a thick curved stroke
  // can pinch or protrude when its two node columns are moved closer together.
  // For start positions L and left offsets O from the bar centers, preserving
  // base pitch P requires L[i+1] - L[i] >= P + O[i+1] - O[i]. Encode that extra
  // constraint in the interval width so the same exact PAVA pass enforces both.
  const horizontalIntervals = columns.map((column, index) => {
    const next = columns[index + 1];
    const minimumSize = next
      ? (next.center - column.center) + (next.start - next.center) - (column.start - column.center) - GAP
      : 0;
    return { start: column.start, size: Math.max(column.size, minimumSize) };
  });
  const requiredHeight = Math.max(0, ...columns.map(column => length(column.intervals)));
  const height = Math.max(base.height, TOP + requiredHeight + BOTTOM);
  const width = Math.max(base.width, SIDE + length(horizontalIntervals) + SIDE);
  // Browser-measured rectangles are small. Reject arithmetic overflow rather
  // than allowing malformed measurements to produce an unusable SVG.
  if (!Number.isFinite(width) || !Number.isFinite(height)) throw new RangeError('Label measurements exceed the supported canvas size.');
  const lefts = pack(horizontalIntervals, SIDE, width - SIDE);
  columns.forEach((column, columnIndex) => {
    const tops = pack(column.intervals, TOP, height - BOTTOM);
    const dx = lefts[columnIndex] - column.start;
    column.members.forEach((node, index) => {
      const dy = tops[index] - column.intervals[index].start;
      node.x0! += dx;
      node.x1! += dx;
      node.y0! += dy;
      node.y1! += dy;
    });
  });
  const graph = { ...base.graph, nodes, links };
  sankey<NodeData, LinkData>().update(graph);
  const headings = columns.map(column => ({ depth: column.depth,
    x: (column.members[0].x0! + column.members[0].x1!) / 2 }));
  return { ...base, graph, width, height, headings };
}
