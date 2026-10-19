import { describe, expect, test } from 'vitest';
import { Barcode, computeGs1CheckDigit, InvalidBarcodeError, type BarcodeFormat } from '@/domain/Barcode';
import { cartReducer, EMPTY_CART, summarizeCart, type CartAction, type CartState } from '@/domain/Cart';
import { internalSequenceOf, isInternalBarcode, makeInternalBarcode, MAX_SEQUENCE } from '@/domain/InternalBarcode';
import { examplePrice, fromMinor, parsePrice, toMinor } from '@/domain/Money';
import { Product } from '@/domain/Product';
import { COLA, GUM, product, RICE_VND, WATER } from './support/fixtures';

const run = (...actions: CartAction[]): CartState => actions.reduce(cartReducer, EMPTY_CART);

describe('Barcode', () => {
  test('computes GS1 check digits', () => {
    expect(computeGs1CheckDigit('544900000099')).toBe(6);
    expect(computeGs1CheckDigit('9638507')).toBe(4);
    expect(computeGs1CheckDigit('03600029145')).toBe(2);
  });

  test('parses valid codes, detects the format and trims whitespace', () => {
    expect(Barcode.parse('5449000000996').format).toBe('EAN-13');
    expect(Barcode.parse('036000291452').format).toBe('UPC-A');
    expect(Barcode.parse(' 96385074\n').value).toBe('96385074');
  });

  test('rejects bad input with a reason', () => {
    const reason = (raw: unknown) => {
      try {
        Barcode.parse(raw);
      } catch (err) {
        expect(err).toBeInstanceOf(InvalidBarcodeError);
        return (err as InvalidBarcodeError).reason;
      }
    };
    expect(reason('')).toBe('empty value');
    expect(reason(null)).toBe('empty value');
    expect(reason('12345')).toBe('unsupported format');
    expect(reason('54490000009AB')).toBe('unsupported format');
    expect(reason('5449000000997')).toBe('wrong check digit');
    expect(Barcode.isValid('5449000000997')).toBe(false);
  });

  test('accepts a custom format registry', () => {
    const anyFour: BarcodeFormat = { name: 'SHOP-4', matches: (v) => /^\d{4}$/.test(v), isValid: () => true };
    expect(Barcode.parse('1234', [anyFour]).format).toBe('SHOP-4');
  });

  test('barcodes are immutable and comparable', () => {
    const a = Barcode.parse('5449000000996');
    expect(Object.isFrozen(a)).toBe(true);
    expect(a.equals(Barcode.parse(' 5449000000996 '))).toBe(true);
    expect(String(a)).toBe('5449000000996');
  });
});

describe('Product', () => {
  test('validates its fields', () => {
    expect(() => new Product({ ...COLA, name: ' ' })).toThrow(TypeError);
    expect(() => new Product({ ...COLA, price: -1 })).toThrow(TypeError);
    expect(() => new Product({ ...COLA, price: NaN })).toThrow(TypeError);
    expect(() => new Product({ ...COLA, currency: 'usd' })).toThrow(TypeError);
  });

  test('with() returns a changed copy; toJSON / fromJSON round-trip', () => {
    const cola = product(COLA);
    const cheaper = cola.with({ price: 0.99 });
    expect(cola.price).toBe(1.25);
    expect(cheaper.price).toBe(0.99);
    expect(Product.fromJSON(JSON.parse(JSON.stringify(cheaper))).toJSON()).toEqual(cheaper.toJSON());
  });
});

describe('Money', () => {
  test('converts using each currency’s decimals', () => {
    expect(toMinor(1.25, 'USD')).toBe(125);
    expect(toMinor(15000, 'VND')).toBe(15000);
    expect(toMinor(1.234, 'KWD')).toBe(1234);
    expect(fromMinor(125, 'USD')).toBe(1.25);
  });
});

describe('parsePrice (what people type)', () => {
  test('VND has no decimals: dots, commas and spaces are thousands separators', () => {
    for (const typed of ['15000', '15.000', '15,000', '15 000', ' 15.000 ']) expect(parsePrice(typed, 'VND')).toBe(15000);
    expect(parsePrice('1.250.000', 'VND')).toBe(1250000);
    expect(parsePrice('0', 'VND')).toBe(0);
  });

  test('USD: the last separator is the decimal point', () => {
    expect(parsePrice('1.25', 'USD')).toBe(1.25);
    expect(parsePrice('1,25', 'USD')).toBe(1.25);
    expect(parsePrice('1,234.50', 'USD')).toBe(1234.5);
    expect(parsePrice('1.234,50', 'USD')).toBe(1234.5);
    expect(parsePrice('3', 'USD')).toBe(3);
  });

  test('rejects anything that is not a price', () => {
    for (const typed of ['', 'abc', '-5', '12a', '.5', '1e5']) expect(parsePrice(typed, 'VND')).toBeNull();
  });

  test('example hint fits the currency', () => {
    expect(examplePrice('VND')).toBe('15000');
    expect(examplePrice('USD')).toBe('1.25');
  });
});

describe('Cart', () => {
  const cola = product(COLA);
  const water = product(WATER);

  test('scanning the same product twice increases its quantity', () => {
    const { lines, itemCount } = summarizeCart(run({ type: 'add', product: cola }, { type: 'add', product: cola }));
    expect(lines).toHaveLength(1);
    expect(lines[0].quantity).toBe(2);
    expect(lines[0].lineTotal).toBe(2.5);
    expect(itemCount).toBe(2);
  });

  test('total has no floating-point error (0.1 + 0.2 = 0.3)', () => {
    const a = product(COLA, { price: 0.1 });
    const b = product(WATER, { price: 0.2 });
    expect(summarizeCart(run({ type: 'add', product: a }, { type: 'add', product: b })).totals).toEqual([{ currency: 'USD', amount: 0.3 }]);
  });

  test('mixed currencies are totalled separately, sorted by currency', () => {
    const state = run({ type: 'add', product: product(RICE_VND) }, { type: 'add', product: cola });
    expect(summarizeCart(state).totals).toEqual([
      { currency: 'USD', amount: 1.25 },
      { currency: 'VND', amount: 90000 },
    ]);
  });

  test('newest product is listed first; a re-scanned product moves to the top', () => {
    const gum = product(GUM);
    const state = run({ type: 'add', product: cola }, { type: 'add', product: water }, { type: 'add', product: gum }, { type: 'add', product: cola });
    expect(state.map((i) => i.product.name)).toEqual(['Cola 330ml', 'Chewing Gum', 'Mineral Water 500ml']);
  });

  test('increment / decrement / remove / clear', () => {
    let state = run({ type: 'add', product: cola }, { type: 'add', product: water });
    state = cartReducer(state, { type: 'increment', barcode: cola.barcode });
    expect(state.find((i) => i.product === cola)?.quantity).toBe(2);
    state = cartReducer(state, { type: 'decrement', barcode: cola.barcode });
    state = cartReducer(state, { type: 'decrement', barcode: cola.barcode }); // 1 -> removed
    expect(state.map((i) => i.product.barcode)).toEqual([water.barcode]);
    state = cartReducer(state, { type: 'remove', barcode: water.barcode });
    expect(state).toEqual([]);
    expect(cartReducer(run({ type: 'add', product: cola }), { type: 'clear' })).toBe(EMPTY_CART);
  });

  test('updateProduct changes the price of a line, keeping quantity and position', () => {
    let state = run({ type: 'add', product: cola }, { type: 'add', product: cola }, { type: 'add', product: water });
    state = cartReducer(state, { type: 'updateProduct', product: cola.with({ price: 1.5 }) });
    expect(summarizeCart(state).lines.map((l) => [l.product.name, l.quantity, l.lineTotal])).toEqual([
      ['Mineral Water 500ml', 1, 0.59],
      ['Cola 330ml', 2, 3],
    ]);
  });

  test('unknown barcodes leave the state untouched; invalid quantities are refused', () => {
    const state = run({ type: 'add', product: cola });
    expect(cartReducer(state, { type: 'increment', barcode: 'nope' })).toBe(state);
    expect(cartReducer(state, { type: 'updateProduct', product: water })).toBe(state);
    expect(() => cartReducer(state, { type: 'add', product: cola, quantity: 0 })).toThrow(RangeError);
    expect(() => cartReducer(state, { type: 'add', product: cola, quantity: 1.5 })).toThrow(RangeError);
  });
});

describe('InternalBarcode', () => {
  test('internal barcodes are valid, scannable EAN-13 codes starting with 20', () => {
    for (const n of [1, 2, 42, MAX_SEQUENCE]) {
      const code = makeInternalBarcode(n);
      expect(Barcode.parse(code).format).toBe('EAN-13');
      expect(isInternalBarcode(code)).toBe(true);
      expect(internalSequenceOf(code)).toBe(n);
    }
    expect(makeInternalBarcode(1)).toBe('2000000000015');
  });

  test('manufacturer codes are not internal; bad sequences are refused', () => {
    expect(isInternalBarcode('5449000000996')).toBe(false);
    expect(internalSequenceOf('96385074')).toBeNull();
    expect(() => makeInternalBarcode(0)).toThrow(RangeError);
    expect(() => makeInternalBarcode(MAX_SEQUENCE + 1)).toThrow(RangeError);
    expect(() => makeInternalBarcode(1.5)).toThrow(RangeError);
  });
});
