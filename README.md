# Flow

Flow is a private, client-side workspace for creating interactive Sankey diagrams. Built with React 19, TypeScript, Vite 8, and the D3 Sankey layout engine. No server, account, API key, analytics, or external runtime requests are required for the app itself. Fonts are bundled locally.

## Run locally

Requires Node.js 22.12+ (or a newer supported LTS release) and pnpm 10.28.0, pinned in `package.json`.

```sh
pnpm install
pnpm dev
```

## Features

- Editable From → To → Amount connections with live diagram updates.
- Searchable From/To selectors with matching text highlights, keyboard navigation, and a clear option to create a new node. Choosing a name, pressing Enter, or leaving the field commits the edit; Escape cancels an open search.
- Balanced personal budget, company P&L, and job-search examples.
- Multiple diagrams saved automatically in local browser storage.
- Delete saved diagrams from **My diagrams**, or use **Clear all local data** to remove every diagram and recovery copy from this browser. Both actions ask for confirmation.
- Select a node bar to highlight related flows. Click a node name to rename it across every connection; an existing name offers an explicit merge when the combined graph is valid. Rename pencils appear on hover or keyboard focus.
- Show Values, Percentages, or Both on the diagram. Choose Total inflow or a named node as the percentage base; the reference is visible on the chart and included in image exports. Hover a ribbon for its amount and percentage.
- Undo/redo, zoom, focus mode, color palettes, labels, amounts, and flow opacity controls.
- Currency, Decimal, and Whole number display formats, with a separate currency selector.
- Consistent column headings on every diagram. Click a heading or its pencil to rename it in place; Enter or clicking away saves, and Escape cancels.
- PNG and SVG image export, plus JSON export/import for editable backups.
- Cycle prevention and actionable balance feedback. Add remaining flow prepares the source and unallocated amount for confirmation; Review flows takes you to outgoing amounts when a node is overallocated. Larger graphs expand in a scrollable canvas.
- Measured label layout prevents overlapping names, values, percentages, and balance actions. Nodes and their labels move together; the canvas expands only when necessary. Layout updates after editing, resizing, changing display settings, or loading fonts.
- Keyboard navigation, responsive layouts, and reduced-motion support.

Click a diagram title to rename it. Use the same exact node name to join flows; names are case-sensitive. An individual flow amount must be positive and at most 1 quadrillion. Each diagram supports up to 300 flows. Total flow counts sources only, so intermediate steps are not counted twice.

Column titles are saved by position from left to right and included in JSON, SVG, and PNG exports. Examples start with descriptive titles; new columns use “Column 1”, “Column 2”, and so on. Clearing a title restores its suggested name. Titles support undo/redo and remain saved when a column temporarily disappears.

**Format** controls display only: currency formatting follows the selected currency’s decimal places, Decimal preserves fractional values, and Whole number rounds labels to integers. Original amounts remain editable and unchanged; selecting a different currency does not perform an exchange-rate conversion. Existing version 1 diagrams migrate automatically, including job-search diagrams to Whole number. New JSON exports use version 2.

Percentage labels use one shared reference throughout the diagram. Total inflow sums all source amounts. A named reference uses the amount entering that node, or its outgoing amount if it is a source. Each node uses the same rule for its displayed value, so percentages can exceed 100% when a smaller reference is selected. These display settings persist in saved diagrams and editable backups. Renames, added allocations, and display changes support undo/redo.

## Privacy and backups

Diagram data stays in `localStorage` on the current browser and origin. Open tabs on the same origin receive saved changes; data does not synchronize between devices. Clearing browser/site data removes diagrams; use **Export → Editable diagram** for a portable backup. If saved data is malformed, readable diagrams are recovered and the original data is retained in the `sankey-studio-v1-recovery` storage key. If a different recovery copy already exists or a backup cannot be saved, the original storage is left untouched and automatic saving is paused. An unavailable storage warning means you must export to keep your work.

## Validation and static deployment

For automated builds, use `pnpm install --frozen-lockfile` to install the exact versions in `pnpm-lock.yaml`.

```sh
pnpm test
pnpm build
pnpm preview
```

The production build is emitted to `dist/` and can be served by any static hosting provider. `pnpm build` also pre-renders the public workspace into HTML, using the same React component as the app. This happens at build time only: the deployed app still needs no server, and saved diagrams are loaded only in the visitor’s browser.

## Search and sharing

The canonical public URL is **https://flow.mxshell.dev/**. The production output includes:

- A descriptive title and meta description, canonical URL, Open Graph and Twitter card metadata.
- WebSite and WebApplication structured data describing the actual app, without ratings or reviews.
- The public introduction and example choices in `index.html`, readable before JavaScript runs. This follows [Google’s guidance for JavaScript SEO](https://developers.google.com/search/docs/crawling-indexing/javascript/javascript-seo-basics).
- `robots.txt`, a sitemap containing the homepage, and a 1200 × 630 PNG share preview.

Deploy the entire `dist/` directory. Serve `/robots.txt`, `/sitemap.xml`, and `/social-preview.png` as their actual files, and return a proper 404 for unknown paths. Keep JavaScript, CSS, fonts, and images accessible to crawlers. The canonical and sharing metadata always describe Flow; private diagram names and amounts are never included.

After deployment, submit `https://flow.mxshell.dev/sitemap.xml` in Google Search Console and inspect the homepage URL. Indexing and search-result appearance are determined by search engines. A different domain requires updating `index.html`, `public/robots.txt`, and `public/sitemap.xml`; the SEO tests check that their URLs agree.

The share image is a checked-in asset, so building Flow does not require Python. To regenerate it, run `python3 scripts/create-social-preview.py` in an environment with Pillow and Arial or DejaVu Sans installed.

Tests cover template conservation, source totals, cycles, duplicate links, invalid input, import validation, stable saved IDs, recovery failures, searchable selector navigation, Unicode labels and headings, tiny flow values, large and deep layouts, and PNG size limits. Interaction tests also cover in-place rename and merge confirmation, keyboard/IME editing, allocation confirmation and undo, percentage references and persistence, and exporting while an edit is open. The production build checks TypeScript types. SEO tests also check canonical and sitemap consistency, sharing metadata, structured data, and storage-free public rendering.
