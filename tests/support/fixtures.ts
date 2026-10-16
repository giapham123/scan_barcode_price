import { Product, type ProductData } from '@/domain/Product';

export const COLA: ProductData = { barcode: '5449000000996', name: 'Cola 330ml', price: 1.25, currency: 'USD', unit: 'can' };
export const WATER: ProductData = { barcode: '8934588012112', name: 'Mineral Water 500ml', price: 0.59, currency: 'USD', unit: 'bottle' };
export const GUM: ProductData = { barcode: '96385074', name: 'Chewing Gum', price: 0.75, currency: 'USD', unit: 'pack' };
export const TOWELS: ProductData = { barcode: '036000291452', name: 'Paper Towels', price: 3.49, currency: 'USD', unit: 'roll' };
export const RICE_VND: ProductData = { barcode: '8936123456788', name: 'Rice 5kg', price: 90000, currency: 'VND', unit: 'bag' };

export const product = (data: ProductData, changes: Partial<ProductData> = {}) => new Product({ ...data, ...changes });

/** A fetch stand-in that answers from a routing function and records every call. */
export function fakeFetch(route: (url: string, init: RequestInit) => Response | Promise<Response>) {
  const calls: { url: string; init: RequestInit }[] = [];
  const fn = (async (input: RequestInfo | URL, init: RequestInit = {}) => {
    const url = String(input);
    calls.push({ url, init });
    return route(url, init);
  }) as typeof fetch;
  return { fetch: fn, calls };
}
