/** Errors the server layer can raise. Route handlers turn them into HTTP statuses (see http.ts). */

export class HttpError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = 'HttpError';
  }
}

export class ProductNotFoundError extends Error {
  constructor(barcode: string) {
    super(`Product ${barcode} not found`);
    this.name = 'ProductNotFoundError';
  }
}

export class ProductValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ProductValidationError';
  }
}

/** Create-only save, but a product with that barcode already exists. */
export class ProductConflictError extends Error {
  constructor(barcode: string) {
    super(`Product ${barcode} already exists`);
    this.name = 'ProductConflictError';
  }
}
