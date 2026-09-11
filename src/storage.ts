import { parseDocument, template } from "./model";
import type { Diagram } from "./model";

export const STORAGE_KEY = "sankey-studio-v1";
const RECOVERY_KEY = `${STORAGE_KEY}-recovery`;

export type Library = {
    activeId: string;
    docs: Diagram[];
    recovery?: string;
    blockSave?: boolean;
};

export function loadLibrary(): Library {
    try {
        const raw = localStorage.getItem(STORAGE_KEY);
        if (!raw) return { activeId: "", docs: [] };

        const saved = JSON.parse(raw);
        if (!Array.isArray(saved?.docs))
            throw new Error("Invalid saved library");
        if (!saved.docs.length) return { activeId: "", docs: [] };

        const docs: Diagram[] = [];
        let damaged = false;
        for (const entry of saved.docs) {
            try {
                docs.push(parseDocument(entry));
            } catch {
                damaged = true;
            }
        }
        if (damaged) localStorage.setItem(RECOVERY_KEY, raw);
        if (!docs.length) throw new Error("No readable diagrams");

        return {
            docs,
            activeId: docs.some((doc) => doc.id === saved.activeId)
                ? saved.activeId
                : docs[0].id,
            recovery: damaged
                ? "Some saved diagrams could not be opened. Your original data is preserved in browser storage."
                : undefined,
        };
    } catch {
        let blockSave = false;
        try {
            const raw = localStorage.getItem(STORAGE_KEY);
            if (raw) localStorage.setItem(RECOVERY_KEY, raw);
        } catch {
            blockSave = true;
        }
        const doc = template("budget");
        return {
            activeId: doc.id,
            docs: [doc],
            blockSave,
            recovery:
                "Saved diagrams could not be opened. Export your work to keep a copy.",
        };
    }
}

export function saveLibrary(library: Library): void {
    if (library.blockSave)
        throw new Error("Saved diagrams could not be backed up. Export your work to keep a copy.");
    if (!library.docs.length) {
        localStorage.removeItem(STORAGE_KEY);
        return;
    }
    localStorage.setItem(
        STORAGE_KEY,
        JSON.stringify({ activeId: library.activeId, docs: library.docs }),
    );
}

export function removeDiagram(library: Library, id: string): Library {
    const index = library.docs.findIndex((doc) => doc.id === id);
    if (index < 0) return library;

    const docs = library.docs.filter((doc) => doc.id !== id);
    return {
        ...library,
        docs,
        activeId: !docs.length
            ? ""
            : library.activeId === id
              ? docs[Math.min(index, docs.length - 1)].id
              : library.activeId,
    };
}

export function clearLocalData(): void {
    localStorage.removeItem(RECOVERY_KEY);
    localStorage.removeItem(STORAGE_KEY);
}
