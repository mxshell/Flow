import { describe, expect, it } from 'vitest';
import { shortenLabel } from './text';

describe('chart label truncation', () => {
    it('preserves short labels verbatim', () => {
        expect(shortenLabel('Savings', 22)).toBe('Savings');
    });
    it.each(['👩🏽‍💻', 'e\u0301', '𠮷'])('keeps complete graphemes for %s', part => {
        expect(shortenLabel(part.repeat(22), 22)).toBe(part.repeat(22));
        expect(shortenLabel(part.repeat(23), 22)).toBe(`${part.repeat(20)}…`);
    });
});
