import { describe, expect, it } from 'vitest';
import { pngDimensions } from './imageExport';

describe('PNG image sizing', () => {
  it('keeps ordinary diagrams sharp', () => {
    expect(pngDimensions(1000, 590)).toEqual({ width: 2400, height: 1416 });
  });
  it.each([[66000, 590], [1000, 18750], [8192, 8192], [33000, 9400]])('bounds large canvases (%s by %s) without distorting the diagram', (width, height) => {
    const image = pngDimensions(width, height);
    expect(image.width).toBeLessThanOrEqual(8192);
    expect(image.height).toBeLessThanOrEqual(8192);
    expect(image.width * image.height).toBeLessThanOrEqual(16_000_000);
    expect(Math.abs(image.width / image.height - width / height)).toBeLessThan(width / height * 0.015);
  });
  it.each([[0, 590], [760, -1], [Infinity, 590], [760, NaN]])('rejects invalid image dimensions', (width, height) => {
    expect(() => pngDimensions(width, height)).toThrow('invalid image dimensions');
  });
});
