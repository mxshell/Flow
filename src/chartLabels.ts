import { balanceDifference, formatAmount, formatPercentage } from './model';
import type { Diagram } from './model';
import type { ChartNode } from './layout';
import type { LabelBounds } from './labelLayout';

export type NodeLabel = {
  x: number; y: number; width: number; anchor: 'start' | 'middle' | 'end';
  amount: number; numbers: string[]; numericY: number; balanceY: number;
  difference: number; hasBalanceAction: boolean; balanceLabel: string;
  bounds: LabelBounds;
};

// Coordinates are relative to the bar, so labels travel with their node when
// the collision solver moves it. Text fitting uses stable widths, independent
// of the canvas size produced by that solver.
export function nodeLabel(doc: Diagram, node: ChartNode, maxDepth: number, width: number, balanceActions: boolean, percentageBase: number): NodeLabel {
  const first = node.depth === 0, last = !node.sourceLinks?.length;
  const x = first ? -12 : last ? node.x1! - node.x0! + 12 : (node.x1! - node.x0!) / 2;
  const anchor = first ? 'end' : last ? 'start' : 'middle';
  const amount = node.incoming > 0 ? node.incoming : node.outgoing;
  const displayMode = doc.appearance.valueDisplay ?? 'values';
  const value = formatAmount(amount, doc, (node.depth ?? 0) > 0 && maxDepth > 3);
  const percentage = formatPercentage(amount, percentageBase);
  const numbers = !doc.appearance.values ? [] : displayMode === 'percentages' ? [percentage]
    : displayMode === 'both' ? [value, percentage] : [value];
  const difference = node.incoming > 0 && node.outgoing > 0 ? balanceDifference(node) : 0;
  const hasBalanceAction = difference !== 0 && balanceActions;
  const lines = Number(doc.appearance.labels) + numbers.length + Number(hasBalanceAction);
  const y = first || last ? (node.y1! - node.y0!) / 2 + 5 - Math.max(0, lines - 1) * 10
    : -10 - Math.max(0, lines - 1) * 20;
  const labelWidth = first ? 127 : last ? 195 - (node.x1! - node.x0!) - 28 : Math.min(260, (width - 350) / Math.max(1, maxDepth) - 24);
  const numericY = y + (doc.appearance.labels ? 20 : 0);
  const balanceY = numericY + numbers.length * 20;
  const left = anchor === 'end' ? x - labelWidth : anchor === 'middle' ? x - labelWidth / 2 : x;
  const barHeight = Math.max(2, node.y1! - node.y0!);
  const bounds = lines ? {
    left: left - 4, right: left + labelWidth + 4,
    top: y - (doc.appearance.labels ? 19 : 16),
    bottom: hasBalanceAction ? balanceY + 10 : numbers.length ? numericY + (numbers.length - 1) * 20 + 5 : y + 8,
  } : { left: 0, right: node.x1! - node.x0!, top: 0, bottom: barHeight };
  return { x, y, width: labelWidth, anchor, amount, numbers, numericY, balanceY, difference, hasBalanceAction,
    balanceLabel: `${formatAmount(Math.abs(difference), doc, true)} ${difference > 0 ? 'left · Add' : 'over · Review'}`, bounds };
}

export function measureNodeLabel(group: SVGGElement, node: ChartNode, fallback: LabelBounds): LabelBounds {
  const boxes: DOMRect[] = [];
  // Exclude rename popovers and hover tooltips: those intentionally overlay the
  // chart. Include hit targets so neighbouring labels remain independently editable.
  for (const element of group.querySelectorAll<SVGGraphicsElement>('text, .node-name-hit, .node-balance-action > rect')) {
    try {
      const box = element.getBBox();
      if ([box.x, box.y, box.width, box.height].every(Number.isFinite) && box.width > 0 && box.height > 0) boxes.push(box);
    } catch { return fallback; }
  }
  if (!boxes.length) return fallback;
  // Quantize outward to avoid relayout loops from subpixel subtraction after a
  // node moves. The tiny tolerance handles round-off at exact grid boundaries.
  const floor = (value: number) => Math.floor((value + 1e-7) * 64) / 64;
  const ceil = (value: number) => Math.ceil((value - 1e-7) * 64) / 64;
  return {
    left: floor(Math.min(...boxes.map(box => box.x)) - node.x0!),
    right: ceil(Math.max(...boxes.map(box => box.x + box.width)) - node.x0!),
    top: floor(Math.min(fallback.top, ...boxes.map(box => box.y - node.y0!))),
    bottom: ceil(Math.max(fallback.bottom, ...boxes.map(box => box.y + box.height - node.y0!))),
  };
}
