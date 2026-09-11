const segmenter = new Intl.Segmenter('en', { granularity: 'grapheme' });

/** Shorten display labels without splitting emoji, accents, or surrogate pairs. */
export function shortenLabel(text: string, limit: number) {
    const parts = Array.from(segmenter.segment(text), part => part.segment);
    return parts.length > limit ? `${parts.slice(0, limit - 2).join('')}…` : text;
}
