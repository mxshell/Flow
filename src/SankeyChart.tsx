import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { sankeyLinkHorizontal } from "d3-sankey";
import { columnTitle, formatAmount } from "./model";
import type { Diagram } from "./model";
import { buildLayout } from "./layout";
import ColumnTitle from "./ColumnTitle";
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
    zoom,
}: {
    doc: Diagram;
    selected: string | null;
    onSelect: (name: string | null) => void;
    onRenameColumn: (depth: number, title: string) => void;
    zoom: number;
}) {
    const svgRef = useRef<SVGSVGElement>(null);
    const [availableWidth, setAvailableWidth] = useState(1000);
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
            availableWidth,
        ],
    );
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
    }, [result, hover, doc.numberFormat, doc.currency, doc.appearance.labels, doc.appearance.values]);
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
            percent: hoveredLink.value / (s.value || 1),
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
            {graph.nodes.map((n) => {
                const first = n.depth === 0,
                    last = (n.sourceLinks?.length ?? 0) === 0;
                const x = first
                    ? n.x0! - 12
                    : last
                      ? n.x1! + 12
                      : n.x0! + (n.x1! - n.x0!) / 2;
                const y =
                    first || last
                        ? (n.y0! + n.y1!) / 2 - (doc.appearance.values ? 5 : -5)
                        : n.y0! - (doc.appearance.values ? 29 : 12);
                const name = shortenLabel(n.name, 22);
                const labelWidth = first ? x - 12 : last ? width - x - 12
                    : Math.min(260, (width - 350) / Math.max(1, maxDepth) - 24);
                return (
                    <g
                        key={n.name}
                        className="sankey-node"
                        role="button"
                        tabIndex={0}
                        aria-label={`${n.name}, ${formatAmount(n.value ?? 0, doc)}. Highlight connected flows.`}
                        aria-pressed={selected === n.name}
                        onClick={() =>
                            onSelect(selected === n.name ? null : n.name)
                        }
                        onKeyDown={(e) => {
                            if (e.key === "Enter" || e.key === " ") {
                                e.preventDefault();
                                onSelect(selected === n.name ? null : n.name);
                            }
                        }}
                    >
                        <title>
                            {n.name}: {formatAmount(n.value ?? 0, doc)}
                        </title>
                        <rect
                            x={n.x0}
                            y={n.y0}
                            width={n.x1! - n.x0!}
                            height={Math.max(2, n.y1! - n.y0!)}
                            fill={n.color}
                            rx="3"
                            stroke={selected === n.name ? "#253359" : "none"}
                            strokeWidth="2"
                        />
                        {doc.appearance.labels && (
                            <text
                                x={x}
                                y={y}
                                textAnchor={
                                    first ? "end" : last ? "start" : "middle"
                                }
                                fill="#3a435c"
                                fontSize="15"
                                fontWeight="550"
                                data-max-width={labelWidth}
                            >
                                {name}
                            </text>
                        )}
                        {doc.appearance.values && (
                            <text
                                x={x}
                                y={doc.appearance.labels ? y + 20 : y + 9}
                                textAnchor={
                                    first ? "end" : last ? "start" : "middle"
                                }
                                fill="#727c92"
                                fontSize="14"
                                fontWeight="450"
                                data-max-width={labelWidth}
                            >
                                {formatAmount(
                                    n.value ?? 0,
                                    doc,
                                    (n.depth ?? 0) > 0 && maxDepth > 3,
                                )}
                            </text>
                        )}
                    </g>
                );
            })}
            {tooltip && (
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
                        {Math.round(tooltip.percent * 100)}% of source
                    </text>
                </g>
            )}
        </svg>
    );
}
