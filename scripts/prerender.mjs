import { readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { createServer, isRunnableDevEnvironment } from 'vite';

const root = fileURLToPath(new URL('../', import.meta.url));
// This process runs only during the build; deployed files need no Node server.
const vite = await createServer({
    root,
    appType: 'custom',
    server: { middlewareMode: true, hmr: false, watch: null },
});
try {
    const environment = vite.environments.ssr;
    if (!isRunnableDevEnvironment(environment)) throw new Error('The static render environment is unavailable.');
    const { renderPublicPage } = await environment.runner.import('/src/prerender.tsx');
    const page = renderPublicPage();
    const file = new URL('../dist/index.html', import.meta.url);
    const html = await readFile(file, 'utf8');
    const marker = '<!--app-html-->';
    if (!html.includes(marker)) throw new Error('The public HTML render marker is missing.');
    await writeFile(file, html.replace(marker, () => page));
    console.log('Pre-rendered Flow’s public workspace into dist/index.html.');
} finally {
    await vite.close();
}
