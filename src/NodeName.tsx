import { useEffect, useId, useRef, useState } from 'react';
import { Check, Pencil, X } from 'lucide-react';
import type { NodeRenameResult } from './model';
import { shortenLabel } from './text';
import './NodeName.css';

type LabelPosition = {
  x: number;
  y: number;
  width: number;
  anchor: 'start' | 'middle' | 'end';
  canvasWidth: number;
  canvasHeight: number;
};

type Props = LabelPosition & {
  name: string;
  onRename: (nextName: string, allowMerge?: boolean) => NodeRenameResult;
  onEditingChange?: (editing: boolean) => void;
};

/** Keep the in-place editor visible for labels against any edge of the chart. */
export function nodeEditorPosition(position: LabelPosition, desiredHeight: number) {
  const insetX = Math.min(12, position.canvasWidth / 4);
  const insetY = Math.min(8, position.canvasHeight / 4);
  const width = Math.min(Math.max(268, position.width + 36), position.canvasWidth - insetX * 2);
  const height = Math.min(desiredHeight, position.canvasHeight - insetY * 2);
  const left = position.anchor === 'start' ? position.x - 6
    : position.anchor === 'end' ? position.x - width + 6 : position.x - width / 2;
  return {
    x: Math.max(insetX, Math.min(position.canvasWidth - width - insetX, left)),
    y: Math.max(insetY, Math.min(position.canvasHeight - height - insetY, position.y - 26)),
    width,
    height,
  };
}

export default function NodeName({ name, x, y, width, anchor, canvasWidth, canvasHeight, onRename, onEditingChange }: Props) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(name);
  const [issue, setIssue] = useState<{ message: string; mergeRequired: boolean } | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const buttonRef = useRef<SVGGElement>(null);
  const editingRef = useRef(false);
  const composingRef = useRef(false);
  const pendingBlurRef = useRef(false);
  const draftRef = useRef(name);
  const issueId = useId();

  useEffect(() => {
    if (editing) {
      inputRef.current?.focus();
      inputRef.current?.select();
    }
  }, [editing]);

  function begin() {
    if (editingRef.current) return;
    editingRef.current = true;
    composingRef.current = false;
    pendingBlurRef.current = false;
    draftRef.current = name;
    setDraft(name);
    setIssue(null);
    setEditing(true);
    onEditingChange?.(true);
  }

  function restoreFocus(nextName: string) {
    const svg = buttonRef.current?.ownerSVGElement;
    // Renaming changes the parent's node key. Find the replacement after React
    // commits, instead of trying to focus the editor that has just unmounted.
    requestAnimationFrame(() => {
      if (!svg?.isConnected) return;
      const next = Array.from(svg.querySelectorAll<SVGGElement>('[data-node-name]'))
        .find(button => button.dataset.nodeName === nextName);
      next?.focus();
    });
  }

  function close(restore: boolean, nextName = name) {
    if (!editingRef.current) return;
    editingRef.current = false;
    composingRef.current = false;
    pendingBlurRef.current = false;
    if (restore) restoreFocus(nextName);
    setEditing(false);
    setIssue(null);
    onEditingChange?.(false);
  }

  function save(allowMerge = false, restore = true) {
    if (!editingRef.current || composingRef.current) return;
    const result = onRename(draftRef.current, allowMerge);
    if (result.ok) {
      close(restore, result.name);
      return;
    }
    setIssue({ message: result.error, mergeRequired: Boolean(result.mergeRequired) });
    // A failed blur must not hide the problem or leave a partly applied rename.
    queueMicrotask(() => inputRef.current?.focus());
  }

  const labelWidth = Math.max(1, width);
  const left = anchor === 'start' ? x : anchor === 'end' ? x - labelWidth : x - labelWidth / 2;
  const pencilX = anchor === 'end' ? left + 2 : left + labelWidth - 13;
  const textWidth = Math.max(1, labelWidth - (anchor === 'middle' ? 36 : 20));
  const position = nodeEditorPosition(
    { x, y, width, anchor, canvasWidth, canvasHeight },
    issue?.mergeRequired ? 212 : issue ? 162 : 56,
  );

  return <g className="node-name" onClick={e => e.stopPropagation()}>
    <g ref={buttonRef} className="node-name-button" role="button" data-node-name={name}
      tabIndex={editing ? -1 : 0} aria-label={`Rename node: ${name}`} aria-hidden={editing || undefined}
      onClick={begin} onKeyDown={e => {
        if (e.nativeEvent.isComposing || e.keyCode === 229) { e.stopPropagation(); return; }
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault(); e.stopPropagation(); begin();
        }
      }}>
      <title data-export-omit="true">Click to rename {name}</title>
      <rect className="node-name-hit" data-export-omit="true" x={left - 4} y={y - 19}
        width={labelWidth + 8} height={27} rx={5} fill="transparent" stroke="transparent" />
      <text className="node-name-text" data-max-width={textWidth} x={x} y={y} textAnchor={anchor}
        fill="#3a435c" fontSize={15} fontWeight={550} opacity={editing ? 0 : 1}>{shortenLabel(name, 22)}</text>
      <Pencil className="node-name-pencil" data-export-omit="true" x={pencilX} y={y - 11}
        size={11} aria-hidden="true" opacity={editing ? 0 : undefined} />
    </g>
    {editing && <foreignObject className="node-name-foreign" data-export-omit="true" {...position}>
      <div className="node-name-editor" onClick={e => e.stopPropagation()}
        onBlur={e => {
          if (e.relatedTarget instanceof Node && e.currentTarget.contains(e.relatedTarget)) return;
          if (composingRef.current) { pendingBlurRef.current = true; return; }
          // An existing name always needs the explicit Merge nodes action.
          if (issue?.mergeRequired) { queueMicrotask(() => inputRef.current?.focus()); return; }
          save(false, false);
        }}
        onKeyDown={e => {
          e.stopPropagation();
          if (composingRef.current || e.nativeEvent.isComposing || e.keyCode === 229) return;
          if (e.key === 'Escape') { e.preventDefault(); close(true); }
          else if (e.key === 'Enter' && e.target === inputRef.current) { e.preventDefault(); save(); }
        }}>
        <div className="node-name-input-row">
          <input ref={inputRef} className="node-name-input" aria-label={`Name for node: ${name}`}
            value={draft} maxLength={60} aria-invalid={Boolean(issue) || undefined}
            aria-describedby={issue ? issueId : undefined}
            onChange={e => { draftRef.current = e.target.value; setDraft(e.target.value); setIssue(null); }}
            onCompositionStart={() => { composingRef.current = true; }}
            onCompositionEnd={e => {
              composingRef.current = false;
              draftRef.current = e.currentTarget.value;
              setDraft(e.currentTarget.value);
              if (pendingBlurRef.current) { pendingBlurRef.current = false; save(false, false); }
            }} />
          <button type="button" className="node-name-save" aria-label="Save node name" title="Save name"
            onClick={() => save()}><Check size={15} /></button>
          <button type="button" className="node-name-cancel" aria-label="Cancel node rename" title="Cancel"
            onClick={() => close(true)}><X size={15} /></button>
        </div>
        {issue && <>
          <p className="node-name-issue" id={issueId} role="alert">
            {issue.mergeRequired ? <>“{draft.trim()}” already exists. Merge their connected flows?</> : issue.message}
          </p>
          {issue.mergeRequired && <div className="node-name-merge-actions">
            <button type="button" className="node-name-merge" onClick={() => save(true)}>Merge nodes</button>
            <button type="button" className="node-name-keep" onClick={() => {
              setIssue(null); inputRef.current?.focus(); inputRef.current?.select();
            }}>Keep editing</button>
          </div>}
        </>}
      </div>
    </foreignObject>}
  </g>;
}
