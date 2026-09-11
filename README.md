# Sankey

A private, client-side workspace for creating interactive Sankey diagrams. Built with React 19, TypeScript, Vite 8, and the D3 Sankey layout engine. No server, account, API key, analytics, or external runtime requests are required for the app itself. Fonts are bundled locally.

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
- Node selection highlights related flows; hover a ribbon for its share of the source.
- Undo/redo, zoom, focus mode, color palettes, labels, amounts, and flow opacity controls.
- Currency, Decimal, and Whole number display formats, with a separate currency selector.
- Consistent column headings on every diagram. Click a heading or its pencil to rename it in place; Enter or clicking away saves, and Escape cancels.
- PNG and SVG image export, plus JSON export/import for editable backups.
- Cycle prevention and balance warnings; larger graphs expand in a scrollable canvas.
- Keyboard navigation, responsive layouts, and reduced-motion support.

Click a diagram title to rename it. Use the same exact node name to join flows; names are case-sensitive. An individual flow amount must be positive and at most 1 quadrillion. Each diagram supports up to 300 flows. Total flow counts sources only, so intermediate steps are not counted twice.

Column titles are saved by position from left to right and included in JSON, SVG, and PNG exports. Examples start with descriptive titles; new columns use “Column 1”, “Column 2”, and so on. Clearing a title restores its suggested name. Titles support undo/redo and remain saved when a column temporarily disappears.

**Format** controls display only: currency formatting follows the selected currency’s decimal places, Decimal preserves fractional values, and Whole number rounds labels to integers. Original amounts remain editable and unchanged; selecting a different currency does not perform an exchange-rate conversion. Existing version 1 diagrams migrate automatically, including job-search diagrams to Whole number. New JSON exports use version 2.

## Privacy and backups

Diagram data stays in `localStorage` on the current browser and origin. Open tabs on the same origin receive saved changes; data does not synchronize between devices. Clearing browser/site data removes diagrams; use **Export → Editable diagram** for a portable backup. If saved data is malformed, readable diagrams are recovered and the original data is retained in the `sankey-studio-v1-recovery` storage key. If a different recovery copy already exists or a backup cannot be saved, the original storage is left untouched and automatic saving is paused. An unavailable storage warning means you must export to keep your work.

## Validation and static deployment

For automated builds, use `pnpm install --frozen-lockfile` to install the exact versions in `pnpm-lock.yaml`.

```sh
pnpm test
pnpm build
pnpm preview
```

The production build is emitted to `dist/` and can be served by any static hosting provider.

Tests cover template conservation, source totals, cycles, duplicate links, invalid input, import validation, stable saved IDs, recovery failures, searchable selector navigation, Unicode labels and headings, tiny flow values, large and deep layouts, and PNG size limits. The production build checks TypeScript types.
