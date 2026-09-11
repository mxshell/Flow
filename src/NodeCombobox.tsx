import { useEffect, useId, useLayoutEffect, useMemo, useRef, useState } from 'react';
import type { Ref } from 'react';
import { createPortal } from 'react-dom';
import { Check, ChevronDown, Plus } from 'lucide-react';
import { getNodeOptions, optionScrollTop } from './nodeOptions';

export type NodeChoice = { name: string; color: string };

type Props = {
    value: string;
    onValueChange: (value: string) => void;
    onCommit?: (value: string) => void;
    nodes: NodeChoice[];
    label: string;
    name?: string;
    placeholder?: string;
    required?: boolean;
    inputRef?: Ref<HTMLInputElement>;
    inputId?: string;
};

function Match({ name, query }: { name: string; query: string }) {
    const start = name.toLocaleLowerCase('en').indexOf(query.trim().toLocaleLowerCase('en'));
    if (!query.trim() || start < 0) return <>{name}</>;
    const end = start + query.trim().length;
    return <>{name.slice(0, start)}<mark>{name.slice(start, end)}</mark>{name.slice(end)}</>;
}

export default function NodeCombobox({ value, onValueChange, onCommit, nodes, label, name, placeholder, required, inputRef, inputId }: Props) {
    const id = useId();
    const input = useRef<HTMLInputElement>(null);
    const popup = useRef<HTMLDivElement>(null);
    const list = useRef<HTMLDivElement>(null);
    const valueOnOpen = useRef(value);
    const composing = useRef(false);
    const scrollActiveOption = useRef(false);
    const [open, setOpen] = useState(false);
    const [filtering, setFiltering] = useState(false);
    const [active, setActive] = useState(-1);
    const [position, setPosition] = useState<{ left: number; top: number; width: number; maxHeight: number; transform: string } | null>(null);
    const query = filtering ? value : '';
    const names = useMemo(() => open ? nodes.map(node => node.name) : [], [nodes, open]);
    const colors = useMemo(() => new Map(open ? nodes.map(node => [node.name, node.color]) : []), [nodes, open]);
    const options = useMemo(() => open ? getNodeOptions(names, query) : [], [names, query, open]);
    const activeIndex = active >= 0 && options.length ? Math.min(active, options.length - 1) : -1;
    const existingCount = options.filter(option => option.kind === 'existing').length;

    function openMenu() {
        if (open) return;
        valueOnOpen.current = value;
        setFiltering(false);
        setActive(-1);
        setOpen(true);
    }
    function accept(next: string) {
        const clean = next.trim();
        onValueChange(clean);
        onCommit?.(clean);
        valueOnOpen.current = clean;
        setOpen(false);
        setActive(-1);
    }

    useLayoutEffect(() => {
        if (!open) { setPosition(null); return; }
        function place() {
            if (!input.current) return;
            const rect = input.current.getBoundingClientRect();
            const viewport = window.visualViewport;
            const visibleTop = viewport?.offsetTop ?? 0;
            const visibleLeft = viewport?.offsetLeft ?? 0;
            const width = viewport?.width ?? window.innerWidth;
            const bottom = visibleTop + (viewport?.height ?? window.innerHeight);
            if (rect.bottom < visibleTop || rect.top > bottom) { setOpen(false); return; }
            const desiredHeight = Math.min(364, Math.max(1, options.length) * 46 + 86);
            const below = bottom - rect.bottom - 20;
            const above = rect.top - visibleTop - 20;
            const upwards = below < desiredHeight && above > below;
            const maxHeight = Math.max(64, Math.min(364, upwards ? above : below));
            const panelWidth = Math.min(Math.max(rect.width, 280), width - 24);
            const next = {
                left: Math.max(visibleLeft + 12, Math.min(rect.left, visibleLeft + width - panelWidth - 12)),
                top: upwards ? rect.top - 6 : rect.bottom + 6,
                transform: upwards ? 'translateY(-100%)' : 'none',
                width: panelWidth,
                maxHeight,
            };
            setPosition(previous => previous && Object.entries(next).every(([key, value]) => previous[key as keyof typeof next] === value) ? previous : next);
        }
        place();
        const observer = new ResizeObserver(place);
        if (input.current) observer.observe(input.current);
        observer.observe(document.body);
        function onScroll(event: Event) {
            if (event.target instanceof Node && popup.current?.contains(event.target)) return;
            place();
        }
        window.addEventListener('resize', place);
        window.addEventListener('scroll', onScroll, true);
        window.visualViewport?.addEventListener('resize', place);
        window.visualViewport?.addEventListener('scroll', place);
        return () => {
            observer.disconnect();
            window.removeEventListener('resize', place);
            window.removeEventListener('scroll', onScroll, true);
            window.visualViewport?.removeEventListener('resize', place);
            window.visualViewport?.removeEventListener('scroll', place);
        };
    }, [open, options.length]);

    useEffect(() => {
        if (open && activeIndex >= 0 && scrollActiveOption.current) {
            const container = list.current;
            const option = container?.querySelector<HTMLElement>(`[data-index="${activeIndex}"]`);
            if (!container || !option) return;
            const containerRect = container.getBoundingClientRect();
            const optionRect = option.getBoundingClientRect();
            container.scrollTop = optionScrollTop(container.scrollTop, containerRect.top + container.clientTop, container.clientHeight, optionRect.top, optionRect.height);
        }
    }, [activeIndex, open, query, options.length, position]);

    return <div className={`node-combobox ${open ? 'is-open' : ''}`}>
        <input
            ref={element => {
                input.current = element;
                if (typeof inputRef === 'function') inputRef(element);
                else if (inputRef) inputRef.current = element;
            }}
            role="combobox"
            id={inputId}
            aria-label={label}
            aria-autocomplete="list"
            aria-expanded={open}
            aria-controls={open ? `${id}-list` : undefined}
            aria-activedescendant={open && activeIndex >= 0 ? `${id}-option-${activeIndex}` : undefined}
            autoComplete="off"
            spellCheck={false}
            value={value}
            name={name}
            placeholder={placeholder}
            required={required}
            maxLength={60}
            onFocus={openMenu}
            onClick={openMenu}
            onChange={event => {
                if (!open) valueOnOpen.current = value;
                onValueChange(event.target.value);
                setFiltering(true);
                scrollActiveOption.current = true;
                setActive(0);
                setOpen(true);
            }}
            onCompositionStart={() => { composing.current = true; }}
            onCompositionEnd={() => { composing.current = false; }}
            onBlur={event => {
                if (popup.current?.contains(event.relatedTarget) || event.currentTarget.parentElement?.contains(event.relatedTarget)) return;
                accept(value);
            }}
            onKeyDown={event => {
                if (composing.current || event.nativeEvent.isComposing || event.keyCode === 229) {
                    event.stopPropagation();
                    return;
                }
                if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
                    event.preventDefault();
                    event.stopPropagation();
                    scrollActiveOption.current = true;
                    if (!open) {
                        openMenu();
                        setActive(event.key === 'ArrowDown' ? 0 : getNodeOptions(nodes.map(node => node.name), '').length - 1);
                    } else setActive(index => event.key === 'ArrowDown'
                        ? Math.min(index + 1, options.length - 1)
                        : index < 0 ? options.length - 1 : Math.max(index - 1, 0));
                } else if (event.key === 'Enter') {
                    if (!open && !onCommit) return;
                    event.preventDefault();
                    event.stopPropagation();
                    accept(open && activeIndex >= 0 ? options[activeIndex].name : value);
                } else if (event.key === 'Escape' && open) {
                    event.preventDefault();
                    event.stopPropagation();
                    onValueChange(valueOnOpen.current);
                    setOpen(false);
                    setActive(-1);
                } else if (event.key === 'Tab') {
                    setOpen(false);
                }
            }}
        />
        <button
            className="node-combobox-toggle"
            type="button"
            tabIndex={-1}
            aria-label={`${open ? 'Hide' : 'Show'} options for ${label}`}
            onMouseDown={event => event.preventDefault()}
            onClick={() => {
                input.current?.focus({ preventScroll: true });
                if (open) setOpen(false);
                else openMenu();
            }}
        ><ChevronDown size={13} /></button>
        {open && position && createPortal(
            <div className="node-options" ref={popup} style={position} onMouseDown={event => event.preventDefault()}>
                <div className="node-options-heading" aria-live="polite" aria-atomic="true"><span>{query.trim() ? 'Matching nodes' : 'Choose a node'}</span><span>{existingCount}</span></div>
                <div className="node-options-list" id={`${id}-list`} ref={list} role="listbox" aria-label={`Nodes for ${label}`}>
                    {options.map((option, index) => <button
                        type="button"
                        role="option"
                        tabIndex={-1}
                        key={`${option.kind}:${option.name}`}
                        id={`${id}-option-${index}`}
                        data-index={index}
                        aria-selected={activeIndex === index}
                        className={`node-option ${option.kind === 'create' ? 'node-option-create' : ''} ${activeIndex === index ? 'is-active' : ''}`}
                        onPointerMove={event => {
                            if (event.pointerType === 'mouse') {
                                scrollActiveOption.current = false;
                                setActive(index);
                            }
                        }}
                        onClick={() => {
                            input.current?.focus({ preventScroll: true });
                            accept(option.name);
                        }}
                    >
                        {option.kind === 'create' ? <Plus size={16} /> : <span className="node-option-dot" style={{ background: colors.get(option.name) }} />}
                        <span className="node-option-name">{option.kind === 'create' ? <>Create “{option.name}”</> : <Match name={option.name} query={query} />}</span>
                        {option.kind === 'create' ? <span className="node-option-meta">New node</span> : option.name === valueOnOpen.current && <Check className="node-option-check" size={15} />}
                    </button>)}
                </div>
                {!options.length && <p className="node-options-empty">Type a name to create your first node.</p>}
                <div className="node-options-footer">{!existingCount && query.trim() ? 'No existing nodes match.' : 'Choose an existing node or type a new name.'}</div>
            </div>, document.body,
        )}
    </div>;
}
