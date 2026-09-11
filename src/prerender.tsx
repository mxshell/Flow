import { renderToString } from 'react-dom/server';
import App from './App';

export function renderPublicPage() {
    // Never read or embed device storage in a public build. The browser loads
    // its own saved library when it takes over this same app shell.
    return renderToString(<App initialLibrary={{ activeId: '', docs: [] }} />);
}
