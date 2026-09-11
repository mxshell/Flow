import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const robots = readFileSync(new URL('../public/robots.txt', import.meta.url), 'utf8');
const sitemap = readFileSync(new URL('../public/sitemap.xml', import.meta.url), 'utf8');
const canonical = 'https://flow.mxshell.dev/';
const title = html.match(/<title>([^<]+)<\/title>/)?.[1];
const metadata = [...html.matchAll(/<meta\b[^>]*>/g)].map(([tag]) =>
    Object.fromEntries([...tag.matchAll(/([\w:-]+)="([^"]*)"/g)].map(([, name, value]) => [name, value])),
);
const meta = (name: string) => metadata.find(tag => tag.name === name || tag.property === name)?.content;
const schema = JSON.parse(html.match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/)?.[1] ?? '{}');

describe('public search and sharing metadata', () => {
    it('describes the app consistently before JavaScript runs', () => {
        expect(title).toBe('Flow — Free Online Sankey Diagram Maker');
        expect(meta('application-name')).toBe('Flow');
        expect(meta('og:site_name')).toBe('Flow');
        expect(meta('og:title')).toBe(title);
        expect(meta('twitter:title')).toBe(title);
        const description = meta('description');
        expect(description).toContain('Sankey diagrams');
        expect(description).toContain('No account needed');
        expect(meta('og:description')).toBe(description);
        expect(meta('twitter:description')).toBe(description);
        expect(html).toMatch(/<html lang="en">/);
    });

    it('uses one absolute canonical URL across search, sharing, and structured data', () => {
        const links = [...html.matchAll(/<link\b[^>]*rel="canonical"[^>]*href="([^"]+)"[^>]*>/g)];
        expect(links.map(match => match[1])).toEqual([canonical]);
        expect(meta('og:url')).toBe(canonical);
        expect(schema['@context']).toBe('https://schema.org');
        expect(schema['@graph']).toHaveLength(2);
        for (const entry of schema['@graph']) {
            expect(entry.name).toBe('Flow');
            expect(entry.url).toBe(canonical);
            expect(entry['@id']).toMatch(/^https:\/\/flow\.mxshell\.dev\/#(?:website|app)$/);
        }
    });

    it('declares a large PNG sharing card with matching absolute image URLs', () => {
        const image = `${canonical}social-preview.png`;
        expect(meta('og:type')).toBe('website');
        expect(meta('twitter:card')).toBe('summary_large_image');
        expect(meta('og:image')).toBe(image);
        expect(meta('twitter:image')).toBe(image);
        expect(meta('og:image:type')).toBe('image/png');
        expect(meta('og:image:width')).toBe('1200');
        expect(meta('og:image:height')).toBe('630');
        expect(meta('og:image:alt')).toBeTruthy();
        expect(meta('twitter:image:alt')).toBe(meta('og:image:alt'));
    });

    it('describes actual app capabilities without invented review data', () => {
        const site = schema['@graph'].find((entry: { '@type': string }) => entry['@type'] === 'WebSite');
        const app = schema['@graph'].find((entry: { '@type': string }) => entry['@type'] === 'WebApplication');
        expect(site).toBeDefined();
        expect(app.description).toBe(meta('description'));
        expect(app.applicationCategory).toBe('BusinessApplication');
        expect(app.isAccessibleForFree).toBe(true);
        expect(Number(app.offers.price)).toBe(0);
        expect(app.browserRequirements).toContain('JavaScript');
        expect(app.image).toBe(meta('og:image'));
        expect(app.featureList.join(' ')).toMatch(/PNG.*SVG.*JSON/);
        expect(app).not.toHaveProperty('aggregateRating');
        expect(app).not.toHaveProperty('review');
    });

    it('lets crawlers access the app and points to its actual single-page sitemap', () => {
        expect(robots).toMatch(/^User-agent: \*$/m);
        expect(robots).toMatch(/^Allow: \/$/m);
        expect(robots).not.toMatch(/^Disallow:\s*\S/m);
        expect(robots).toContain(`Sitemap: ${canonical}sitemap.xml`);
        expect(meta('robots') ?? '').not.toMatch(/noindex|nofollow/);
        expect(sitemap).toContain('xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"');
        expect([...sitemap.matchAll(/<loc>([^<]+)<\/loc>/g)].map(match => match[1])).toEqual([canonical]);
        expect(sitemap).not.toContain('<lastmod>');
    });

    it('keeps the prerender insertion point and a useful JavaScript-disabled notice', () => {
        expect(html.match(/<!--app-html-->/g)).toHaveLength(1);
        expect(html).toContain('<div id="root"><!--app-html--></div>');
        expect(html).toMatch(/<noscript>[\s\S]*Enable JavaScript[\s\S]*<\/noscript>/);
    });
});
