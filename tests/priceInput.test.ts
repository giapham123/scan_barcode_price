import { describe, expect, test } from 'vitest';
import { priceInputMode, readPriceInput, writePriceInput } from '@/domain/PriceInput';

describe('price input: VND typed in thousands (15 -> 15.000 ₫)', () => {
  const vnd = priceInputMode('VND', true);

  test('shows ".000" after the field and a short example', () => {
    expect(vnd).toMatchObject({ multiplier: 1000, suffix: '.000', example: '15' });
  });

  test('the typed number is in thousands; "," or "." gives the hundreds', () => {
    expect(readPriceInput('15', 'VND', vnd)).toBe(15000);
    expect(readPriceInput('15,5', 'VND', vnd)).toBe(15500);
    expect(readPriceInput('15.5', 'VND', vnd)).toBe(15500);
    expect(readPriceInput('1250', 'VND', vnd)).toBe(1250000);
    expect(readPriceInput(' 7 ', 'VND', vnd)).toBe(7000);
    expect(readPriceInput('', 'VND', vnd)).toBeNull();
    expect(readPriceInput('abc', 'VND', vnd)).toBeNull();
  });

  test('existing prices are shown in thousands when editing', () => {
    expect(writePriceInput(31500, vnd)).toBe('31.5');
    expect(writePriceInput(15000, vnd)).toBe('15');
    expect(readPriceInput(writePriceInput(322500, vnd), 'VND', vnd)).toBe(322500); // round trip
  });
});

describe('price input without the shortcut', () => {
  test('VND typed in full: "15.000" means 15000', () => {
    const mode = priceInputMode('VND', false);
    expect(mode.suffix).toBeNull();
    expect(readPriceInput('15.000', 'VND', mode)).toBe(15000);
    expect(writePriceInput(15000, mode)).toBe('15000');
  });

  test('USD is never typed in thousands', () => {
    const mode = priceInputMode('USD', true);
    expect(mode).toMatchObject({ multiplier: 1, suffix: null, example: '1.25' });
    expect(readPriceInput('1,25', 'USD', mode)).toBe(1.25);
  });
});
