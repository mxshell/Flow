import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { sankeyLinkHorizontal } from "d3-sankey";
import { balanceDifference, columnTitle, formatAmount, formatPercentage, getPercentageReference } from "./model";
import type { Diagram, NodeRenameResult } from "./model";
import { buildLayout } from "./layout";
import ColumnTitle from "./ColumnTitle";
import NodeName from "./NodeName";
import { shortenLabel } from "./text";
import type {
    ChartNode as Node,
    ChartLink as Link,
    NodeData as N,
    LinkData as L,
} from "./layout";

export default function SankeyChart({
    doc,
    selected,
    onSelect,
    onRenameColumn,
    onRenameNode,
    onBalanceAction,
    zoom,
}: {
    doc: Diagram;
    selected: string | null;
    onSelect: (name: string | null) => void;
    onRenameColumn: (depth: number, title: string) => void;
    onRenameNode?: (oldName: string, newName: string, allowMerge?: boolean) => NodeRenameResult;
    onBalanceAction?: (name: string) => void;
    zoom: number;
}) {
    const svgRef = useRef<SVGSVGElement>(null);
    const [availableWidth, setAvailableWidth] = useState(1000);
    const [editingNode, setEditingNode] = useState<string | null>(null);
    const hasFlows = doc.flows.length > 0;
    useEffect(() => {
        const container = svgRef.current?.parentElement;
        if (!container) return;
        // Observe the viewport, not the zoomed content, so zoom still magnifies the chart.
        const viewport = container.parentElement;
        if (!viewport) return;
        const observer = new ResizeObserver(([entry]) => {
            if (entry.contentRect.width > 0)
                setAvailableWidth(Math.round(entry.contentRect.width));
        });
        observer.observe(viewport);
        return () => observer.disconnect();
    }, [hasFlows]);
    const [hover, setHover] = useState<{
        source: string;
        target: string;
    } | null>(null);
    const result = useMemo(
        () => buildLayout(doc, availableWidth),
        [
            doc.flows,
            doc.appearance.nodeWidth,
            doc.appearance.palette,
            doc.appearance.values,
            doc.appearance.valueDisplay,
            availableWidth,
        ],
    );
    const percentageReference = useMemo(() => getPercentageReference(doc), [doc.flows, doc.appearance.percentageBase]);
    const displayMode = doc.appearance.valueDisplay ?? "values";
    const showPercentages = doc.appearance.values && displayMode !== "values";
    useLayoutEffect(() => {
        const svg = svgRef.current;
        if (!svg) return;
        let mounted = true;
        function fitLabels() {
            if (!mounted) return;
            svg!.querySelectorAll<SVGTextElement>("text[data-max-width]").forEach(text => {
                text.removeAttribute("textLength");
                text.removeAttribute("lengthAdjust");
                const maxWidth = Number(text.dataset.maxWidth);
                if (text.getComputedTextLength() > maxWidth) {
                    text.setAttribute("textLength", String(maxWidth));
                    text.setAttribute("lengthAdjust", "spacingAndGlyphs");
                }
            });
        }
        fitLabels();
        void document.fonts.ready.then(fitLabels);
        document.fonts.addEventListener("loadingdone", fitLabels);
        return () => {
            mounted = false;
            document.fonts.removeEventListener("loadingdone", fitLabels);
        };
    }, [result, hover, doc.numberFormat, doc.currency, doc.appearance.labels, doc.appearance.values, displayMode, percentageReference]);
    const path = sankeyLinkHorizontal<N, L>();
    if (!result)
        return (
            <div className="chart-empty">
                <div className="empty-flow-icon">↗</div>
                <h3>Your first flow starts here</h3>
                <p>
                    Add a source, a destination, and an amount.
                    <br />
                    Your diagram will appear as you build.
                </p>
            </div>
        );
    const { graph, width, height, maxDepth, headings } = result;
    const scale = zoom / 100;
    const connected = (link: Link) =>
        !selected ||
        (link.source as Node).name === selected ||
        (link.target as Node).name === selected;
    const hoveredLink = hover && graph.links.find(link =>
        (link.source as Node).name === hover.source && (link.target as Node).name === hover.target);
    const tooltip = hoveredLink ? (() => {
        const s = hoveredLink.source as Node, t = hoveredLink.target as Node;
        return {
            label: `${s.name} → ${t.name}`,
            value: hoveredLink.value,
            percentage: formatPercentage(hoveredLink.value, showPercentages ? percentageReference.value : s.outgoing),
            baseName: showPercentages ? percentageReference.name : s.name,
            x: (s.x1! + t.x0!) / 2,
            y: Math.max(25, (hoveredLink.y0! + hoveredLink.y1!) / 2 - 45),
        };
    })() : null;
    return (
        <svg
            ref={svgRef}
            id="sankey-diagram"
            viewBox={`0 0 ${width} ${height}`}
            xmlns="http://www.w3.org/2000/svg"
            aria-label={`${doc.title}, interactive Sankey diagram. ${graph.nodes.length} nodes and ${graph.links.length} connections.`}
            role="group"
            style={{
                fontFamily: "'DM Sans Variable', sans-serif",
                minWidth: width > availableWidth ? width * scale : undefined,
                minHeight: height > 590 ? height * scale : undefined,
            }}
        >
            <title>{doc.title}</title>
            <desc>
                {doc.flows
                    .map(
                        (f) =>
                            `${f.from} to ${f.to}: ${formatAmount(f.amount, doc)}`,
                    )
                    .join(". ")}
            </desc>
            <defs>
                {graph.links.map((l, i) => (
                    <linearGradient
                        key={i}
                        id={`flow-gradient-${i}`}
                        gradientUnits="userSpaceOnUse"
                        x1={(l.source as Node).x1}
                        x2={(l.target as Node).x0}
                    >
                        <stop
                            offset="0%"
                            stopColor={(l.source as Node).color}
                        />
                        <stop
                            offset="100%"
                            stopColor={(l.target as Node).color}
                        />
                    </linearGradient>
                ))}
            </defs>
            {headings.map(({ depth, x }, index) => (
                <ColumnTitle
                    key={`${doc.id}:${depth}`}
                    title={columnTitle(doc, depth)}
                    depth={depth}
                    x={x}
                    width={Math.min(260, index < headings.length - 1 ? headings[index + 1].x - x - 24 : index > 0 ? x - headings[index - 1].x - 24 : 260)}
                    onRename={title => onRenameColumn(depth, title)}
                />
            ))}
            <g fill="none">
                {graph.links.map((l, i) => (
                    <path
                        key={i}
                        d={path(l) ?? ""}
                        stroke={`url(#flow-gradient-${i})`}
                        strokeWidth={Math.max(1, l.width ?? 1)}
                        opacity={connected(l) ? doc.appearance.opacity : 0.07}
                        className="sankey-link"
                        onMouseEnter={() => setHover({ source: (l.source as Node).name, target: (l.target as Node).name })}
                        onMouseLeave={() => setHover(null)}
                        onClick={() =>
                            onSelect(
                                selected === (l.source as Node).name
                                    ? null
                                    : (l.source as Node).name,
                            )
                        }
                    >
                        <title>
                            {(l.source as Node).name} →{" "}
                            {(l.target as Node).name}:{" "}
                            {formatAmount(l.value, doc)}
                        </title>
                    </path>
                ))}
            </g>
            {[...graph.nodes].sort((a, b) => Number(a.name === editingNode) - Number(b.name === editingNode)).map((n) => {
                const first = n.depth === 0,
                    last = (n.sourceLinks?.length ?? 0) === 0;
                const x = first ? n.x0! - 12 : last ? n.x1! + 12 : (n.x0! + n.x1!) / 2;
                const anchor = first ? "end" : last ? "start" : "middle";
                const amount = n.incoming > 0 ? n.incoming : n.outgoing;
                const numbers = !doc.appearance.values ? [] : displayMode === "percentages"
                    ? [formatPercentage(amount, percentageReference.value)]
                    : displayMode === "both"
                      ? [formatAmount(amount, doc, (n.depth ?? 0) > 0 && maxDepth > 3), formatPercentage(amount, percentageReference.value)]
                      : [formatAmount(amount, doc, (n.depth ?? 0) > 0 && maxDepth > 3)];
                const difference = n.incoming > 0 && n.outgoing > 0 ? balanceDifference(n) : 0;
                const hasBalanceAction = difference !== 0 && Boolean(onBalanceAction);
                const lineCount = Number(doc.appearance.labels) + numbers.length + Number(hasBalanceAction);
                const y = first || last
                    ? (n.y0! + n.y1!) / 2 + 5 - Math.max(0, lineCount - 1) * 10
                    : n.y0! - 10 - Math.max(0, lineCount - 1) * 20;
                const labelWidth = first ? x - 12 : last ? width - x - 12
                    : Math.min(260, (width - 350) / Math.max(1, maxDepth) - 24);
                const numericY = y + (doc.appearance.labels ? 20 : 0);
                const balanceY = numericY + numbers.length * 20;
                const balanceLabel = `${formatAmount(Math.abs(difference), doc, true)} ${difference > 0 ? "left · Add" : "over · Review"}`;
                return (
                    <g key={n.name} className="sankey-node">
                        <g
                            className="node-select"
                            role="button"
                            tabIndex={0}
                            aria-label={`${n.name}, ${formatAmount(amount, doc)}${showPercentages ? `, ${formatPercentage(amount, percentageReference.value)} of ${percentageReference.name}` : ""}. Highlight connected flows.`}
                            aria-pressed={selected === n.name}
                            onClick={() => onSelect(selected === n.name ? null : n.name)}
                            onKeyDown={(event) => {
                                if (event.key === "Enter" || event.key === " ") {
                                    event.preventDefault();
                                    onSelect(selected === n.name ? null : n.name);
                                }
                            }}
                        >
                            <title>{n.name}: {formatAmount(amount, doc)}</title>
                            <rect
                                x={n.x0} y={n.y0}
                                width={n.x1! - n.x0!}
                                height={Math.max(2, n.y1! - n.y0!)}
                                fill={n.color} rx="3"
                                stroke={selected === n.name ? "#253359" : "none"}
                                strokeWidth="2"
                            />
                        </g>
                        {numbers.map((number, index) => (
                            <text key={index} x={x} y={numericY + index * 20} textAnchor={anchor}
                                fill="#727c92" fontSize="14" fontWeight="450" data-max-width={labelWidth}>
                                {number}
                            </text>
                        ))}
                        {hasBalanceAction && (
                            <g role="button" tabIndex={0} className="node-balance-action" data-export-omit="true"
                                aria-label={`${difference > 0 ? "Add remaining flow from" : "Review flows for"} ${n.name}: ${formatAmount(Math.abs(difference), doc)} ${difference > 0 ? "left to allocate" : "more out than in"}`}
                                onClick={() => onBalanceAction?.(n.name)}
                                onKeyDown={event => {
                                    if (event.key === "Enter" || event.key === " ") {
                                        event.preventDefault();
                                        onBalanceAction?.(n.name);
                                    }
                                }}>
                                <rect x={anchor === "end" ? x - labelWidth : anchor === "middle" ? x - labelWidth / 2 : x}
                                    y={balanceY - 14} width={labelWidth} height={24} fill="transparent" />
                                <text x={x} y={balanceY} textAnchor={anchor} fill="#a16b28" fontSize="12" fontWeight="500" data-max-width={labelWidth}>
                                    {balanceLabel}
                                </text>
                            </g>
                        )}
                        {doc.appearance.labels && (onRenameNode ? (
                            <NodeName
                                name={n.name} x={x} y={y} width={labelWidth} anchor={anchor}
                                canvasWidth={width} canvasHeight={height}
                                onRename={(name, allowMerge) => onRenameNode(n.name, name, allowMerge)}
                                onEditingChange={editing => {
                                    setEditingNode(editing ? n.name : null);
                                    if (editing) setHover(null);
                                }}
                            />
                        ) : (
                            <text x={x} y={y} textAnchor={anchor} fill="#3a435c" fontSize="15" fontWeight="550" data-max-width={labelWidth}>
                                {shortenLabel(n.name, 22)}
                            </text>
                        ))}
                    </g>
                );
            })}
            {showPercentages && (
                <text className="percentage-reference" x={width / 2} y={height - 18} textAnchor="middle"
                    fill="#727c92" fontSize="12" data-max-width={width - 40}>
                    Percentages of {percentageReference.name} ({formatAmount(percentageReference.value, doc)})
                </text>
            )}
            {tooltip && !editingNode && (
                <g
                    className="chart-tooltip"
                    pointerEvents="none"
                    transform={`translate(${Math.min(width - 265, Math.max(15, tooltip.x - 115))},${tooltip.y})`}
                >
                    <rect width="250" height="60" rx="9" fill="#25304b" />
                    <text x="13" y="23" fill="white" fontSize="12" data-max-width="224">
                        {shortenLabel(tooltip.label, 34)}
                    </text>
                    <text x="13" y="44" fill="#d8deee" fontSize="12" data-max-width="224">
                        {formatAmount(tooltip.value, doc)} ·{" "}
                        {tooltip.percentage} of {tooltip.baseName}
                    </text>
                </g>
            )}
        </svg>
    );
}
