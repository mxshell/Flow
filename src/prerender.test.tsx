import { afterEach, describe, expect, it, vi } from 'vitest';
import { renderPublicPage } from './prerender';

afterEach(() => vi.unstubAllGlobals());

describe('public page pre-rendering', () => {
    it('renders the real introduction and examples without browser storage', () => {
        const getItem = vi.fn(() => { throw new Error('Private storage must not be read'); });
        vi.stubGlobal('localStorage', { getItem });
        const html = renderPublicPage();
        expect(getItem).not.toHaveBeenCalled();
        expect(html).toContain('<h1>Create a Sankey diagram</h1>');
        expect(html).toContain('Personal budget');
        expect(html).toContain('Company finances');
        expect(html).toContain('Job search');
        expect(html).toContain('PNG or SVG');
        expect(html).toContain('Private by design');
        expect(html).not.toContain('Company profit &amp; loss');
        expect(html).not.toContain('sankey-diagram');
        expect(html).not.toContain('localStorage');
    });
});
