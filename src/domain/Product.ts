/** Plain, JSON-safe shape of a product (API bodies, server → client props, the JSON file). */
export interface ProductData {
  barcode: string;
  name: string;
  /** Price in the currency's major unit, e.g. 1.99 USD or 15000 VND. */
  price: number;
  /** ISO 4217 code, e.g. "USD", "VND". */
  currency: string;
  /** e.g. "can", "kg". */
  unit?: string;
  /** Photo of the real product. */
  imageUrl?: string | null;
  /** ISO date of the last change. */
  updatedAt?: string | null;
}

/**
 * Product value object. Immutable once created.
 * Shared by the browser and the server, so validation is identical on both sides.
 */
export class Product implements Required<ProductData> {
  readonly barcode: string;
  readonly name: string;
  readonly price: number;
  readonly currency: string;
  readonly unit: string;
  readonly imageUrl: string | null;
  readonly updatedAt: string | null;

  /** @throws {TypeError} when a field is invalid */
  constructor({ barcode, name, price, currency, unit = '', imageUrl = null, updatedAt = null }: ProductData) {
    if (!barcode) throw new TypeError('Product.barcode is required');
    if (!name?.trim()) throw new TypeError('Product name is required');
    if (!Number.isFinite(price) || price < 0) throw new TypeError(`Product price is invalid: ${price}`);
    if (!/^[A-Z]{3}$/.test(currency ?? '')) throw new TypeError(`Product currency is invalid: ${currency}`);

    this.barcode = String(barcode);
    this.name = name.trim();
    this.price = price;
    this.currency = currency;
    this.unit = unit?.trim() ?? '';
    this.imageUrl = imageUrl || null;
    this.updatedAt = updatedAt || null;
    Object.freeze(this);
  }

  /** Build a Product from untrusted plain data (JSON file, API response...). */
  static fromJSON(data: Record<string, unknown> | ProductData): Product {
    const d = data as Record<string, unknown>;
    return new Product({
      barcode: d.barcode as string,
      name: d.name as string,
      price: Number(d.price),
      currency: d.currency as string,
      unit: d.unit as string | undefined,
      imageUrl: d.imageUrl as string | null | undefined,
      updatedAt: d.updatedAt as string | null | undefined,
    });
  }

  /** Copy with some fields changed. */
  with(changes: Partial<ProductData>): Product {
    return new Product({ ...this.toJSON(), ...changes });
  }

  toJSON(): Required<ProductData> {
    const { barcode, name, price, currency, unit, imageUrl, updatedAt } = this;
    return { barcode, name, price, currency, unit, imageUrl, updatedAt };
  }
}
