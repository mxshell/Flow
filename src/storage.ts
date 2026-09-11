import { parseDocument, template, uid } from "./model";
import type { Diagram } from "./model";

// Keep the original keys so existing diagrams and recovery copies remain available in Flow.
export const STORAGE_KEY = "sankey-studio-v1";
const RECOVERY_KEY = `${STORAGE_KEY}-recovery`;

export type Library = {
    activeId: string;
    docs: Diagram[];
    recovery?: string;
    blockSave?: boolean;
};

function preserveRecovery(raw: string): boolean {
    try {
        const previous = localStorage.getItem(RECOVERY_KEY);
        // Keep an older recovery copy and the current main copy until the user
        // can export their work, rather than replacing either damaged library.
        if (previous !== null && previous !== raw) return false;
        if (previous === null) localStorage.setItem(RECOVERY_KEY, raw);
        return true;
    } catch {
        return false;
    }
}

export function loadLibrary(): Library {
    let raw: string | null = null;
    try {
        raw = localStorage.getItem(STORAGE_KEY);
        if (!raw) return { activeId: "", docs: [] };

        const saved = JSON.parse(raw);
        if (!Array.isArray(saved?.docs))
            throw new Error("Invalid saved library");
        if (!saved.docs.length) return { activeId: "", docs: [] };

        const docs: Diagram[] = [];
        const ids = new Set<string>();
        let damaged = false;
        for (const entry of saved.docs) {
            try {
                const doc = parseDocument(entry);
                if (ids.has(doc.id)) doc.id = uid();
                ids.add(doc.id);
                docs.push(doc);
            } catch {
                damaged = true;
            }
        }
        if (!docs.length) throw new Error("No readable diagrams");
        const blockSave = damaged && !preserveRecovery(raw);

        return {
            docs,
            activeId: docs.some((doc) => doc.id === saved.activeId)
                ? saved.activeId
                : docs[0].id,
            recovery: damaged
                ? blockSave
                    ? "Some saved diagrams could not be opened or backed up. Export your work to keep a copy."
                    : "Some saved diagrams could not be opened. Your original data is preserved in browser storage."
                : undefined,
            ...(blockSave ? { blockSave: true } : {}),
        };
    } catch {
        const blockSave = raw === null || !preserveRecovery(raw);
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
