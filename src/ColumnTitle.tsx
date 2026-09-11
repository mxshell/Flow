import { useEffect, useRef, useState } from 'react';
import { Pencil } from 'lucide-react';
import { COLUMN_TITLE_MAX_LENGTH } from './model';

const segmenter = new Intl.Segmenter('en', { granularity: 'grapheme' });
const graphemes = (text: string) => Array.from(segmenter.segment(text), part => part.segment);
const FONT_SIZE = 10.5;
const LETTER_SPACING = 1.5;

function titleLines(title: string, capacity: number) {
  const lines: string[] = [];
  let remaining = graphemes(title.toUpperCase());
  // Uppercasing can expand a character (for example, ß → SS). Adjust the
  // capacity after conversion and never split a surrogate pair or grapheme.
  capacity = Math.max(1, capacity, Math.ceil(remaining.length / 3));
  while (remaining.length > capacity && lines.length < 2) {
    const space = remaining.lastIndexOf(' ', capacity);
    // Prefer whole words, but keep the complete title inside the three-line band.
    const split = space > 0 && remaining.length - space - 1 <= (2 - lines.length) * capacity ? space : capacity;
    lines.push(remaining.slice(0, split).join('').trim());
    remaining = remaining.slice(split);
    while (remaining[0] === ' ') remaining.shift();
  }
  if (remaining.length) lines.push(remaining.join(''));
  return lines;
}

export default function ColumnTitle({ title, depth, x, width, onRename }: {
  title: string;
  depth: number;
  x: number;
  width: number;
  onRename: (title: string) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(title);
  const inputRef = useRef<HTMLInputElement>(null);
  const buttonRef = useRef<SVGGElement>(null);
  const editingRef = useRef(false);
  const composingRef = useRef(false);
  const restoreFocusRef = useRef(false);
  useEffect(() => {
    if (editing) { inputRef.current?.focus(); inputRef.current?.select(); }
    else if (restoreFocusRef.current) { restoreFocusRef.current = false; buttonRef.current?.focus(); }
  }, [editing]);

  function begin() {
    if (editingRef.current) return;
    editingRef.current = true;
    composingRef.current = false;
    setDraft(title);
    setEditing(true);
  }
  function finish(save: boolean, restoreFocus = false) {
    // Enter/Escape unmount the input and may also trigger blur. Commit only once.
    if (!editingRef.current) return;
    editingRef.current = false;
    if (save) onRename(draft);
    restoreFocusRef.current = restoreFocus;
    setEditing(false);
  }
  const textWidth = Math.max(1, width - 38);
  const lines = titleLines(title, Math.floor(textWidth / 7.2));
  const baseline = lines.length === 1 ? 25 : 18;
  const iconX = Math.min(width / 2 - 16, Math.max(0, ...lines.map(line => graphemes(line).length)) * 3.6 + 8);

  return <g className="column-title" transform={`translate(${x}, 0)`}>
    <g ref={buttonRef} className="column-title-button" role="button" tabIndex={editing ? -1 : 0}
      aria-label={`Rename column ${depth + 1}: ${title}`} aria-hidden={editing || undefined}
      onClick={begin} onKeyDown={e => {
        if (e.nativeEvent.isComposing || e.keyCode === 229) { e.stopPropagation(); return; }
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault(); e.stopPropagation(); begin();
        }
      }}>
      <title>Click to rename column {depth + 1}</title>
      <rect className="column-title-hit" data-export-omit="true" x={-width / 2} y="4" width={width} height="50" rx="5" fill="transparent" stroke="transparent" />
      <text className="column-title-text" opacity={editing ? 0 : 1} fill="#8a91a3" fontSize={FONT_SIZE} letterSpacing={LETTER_SPACING} fontWeight="600" textAnchor="middle">
        {lines.map((line, i) => {
          // Allow wide glyphs and fallback fonts, while leaving short headings
          // at their natural size. The bound applies to SVG exports as well.
          const needsFit = graphemes(line).length * (FONT_SIZE * 1.25 + LETTER_SPACING) > textWidth;
          return <tspan key={i} x="0" y={baseline + i * 13}
            textLength={needsFit ? textWidth : undefined}
            lengthAdjust={needsFit ? 'spacingAndGlyphs' : undefined}>{line}</tspan>;
        })}
      </text>
      <Pencil className="column-title-pencil" data-export-omit="true" x={iconX} y="15" size={11} aria-hidden="true" opacity={editing ? 0 : undefined} />
    </g>
    {editing && <foreignObject data-export-omit="true" x={-width / 2} y="6" width={width} height="46">
      <input ref={inputRef} className="column-title-input" aria-label={`Title for column ${depth + 1}`}
        value={draft} maxLength={COLUMN_TITLE_MAX_LENGTH} onChange={e => setDraft(e.target.value)}
        onCompositionStart={() => { composingRef.current = true; }}
        onCompositionEnd={() => { composingRef.current = false; }}
        onBlur={() => finish(true)} onClick={e => e.stopPropagation()} onKeyDown={e => {
          if (composingRef.current || e.nativeEvent.isComposing || e.keyCode === 229) { e.stopPropagation(); return; }
          if (e.key === 'Enter' || e.key === 'Escape') {
            e.preventDefault(); e.stopPropagation(); finish(e.key === 'Enter', true);
          }
        }} />
    </foreignObject>}
  </g>;
}
