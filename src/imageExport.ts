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
    svg.querySelectorAll('[data-export-omit], .column-title-button > title').forEach(element => element.remove());
    svg.querySelectorAll('.column-title-text').forEach(element => element.setAttribute('opacity', '1'));
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
