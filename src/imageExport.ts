// Keep large/deep diagrams within common browser canvas memory limits.
export function pngDimensions(width: number, height: number) {
    if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) {
        throw new Error('The diagram has invalid image dimensions.');
    }
    const scale = Math.min(2.4, 8192 / width, 8192 / height, Math.sqrt(16_000_000 / width / height));
    return { width: Math.max(1, Math.floor(width * scale)), height: Math.max(1, Math.floor(height * scale)) };
}

export function exportSvg(source: SVGSVGElement, title: string, opacity: number) {
    const svg = source.cloneNode(true) as SVGSVGElement;
    svg.querySelector('.chart-tooltip')?.remove();
    svg.querySelectorAll('[data-export-omit], .column-title-button > title, .node-name-button > title').forEach(element => element.remove());
    svg.querySelectorAll('.column-title-text, .node-name-text').forEach(element => element.setAttribute('opacity', '1'));
    svg.querySelectorAll('.sankey-node rect').forEach(element => element.setAttribute('stroke', 'none'));
    svg.querySelectorAll('.sankey-link').forEach(element => element.setAttribute('opacity', String(opacity)));
    svg.querySelectorAll('[tabindex], [aria-pressed], [aria-hidden], [role="button"]').forEach(element => {
        element.removeAttribute('tabindex');
        element.removeAttribute('aria-pressed');
        element.removeAttribute('aria-hidden');
        element.removeAttribute('role');
    });
    const { width, height } = source.viewBox.baseVal;
    svg.setAttribute('width', String(width));
    svg.setAttribute('height', String(height));
    svg.setAttribute('role', 'img');
    svg.setAttribute('aria-label', title);
    // Preserve measured widths when the exported image uses its portable font.
    // Otherwise a wider fallback glyph could cross the label lane's boundary.
    const labelKey = (element: SVGTextElement) => JSON.stringify([element.textContent, element.getAttribute('x'), element.getAttribute('y')]);
    const sourceLabels = new Map(Array.from(source.querySelectorAll<SVGTextElement>('text[data-max-width]'))
        .map(element => [labelKey(element), element]));
    svg.querySelectorAll<SVGTextElement>('text[data-max-width]').forEach(element => {
        const measured = sourceLabels.get(labelKey(element))?.getComputedTextLength?.();
        if (measured && Number.isFinite(measured)) {
            element.setAttribute('textLength', String(Math.min(measured, Number(element.dataset.maxWidth))));
            element.setAttribute('lengthAdjust', 'spacingAndGlyphs');
        }
    });
    svg.style.fontFamily = 'Arial, sans-serif';
    svg.style.minWidth = '';
    svg.style.minHeight = '';
    const background = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
    background.setAttribute('width', String(width));
    background.setAttribute('height', String(height));
    background.setAttribute('fill', 'white');
    svg.prepend(background);
    return svg;
}
