import { fromMinor, toMinor } from './Money';
import type { Product } from './Product';

/**
 * Shopping cart as an immutable value + reducer (used with React's useReducer).
 * Every change is an action, so the whole cart behaviour lives in one pure,
 * easy-to-test function, and React re-renders exactly when the cart changes.
 */

export interface CartItem {
  product: Product;
  quantity: number;
}

/** Most recently added product first. */
export type CartState = readonly CartItem[];

export const EMPTY_CART: CartState = Object.freeze([]);

export type CartAction =
  | { type: 'add'; product: Product; quantity?: number }
  /** New details (price, photo) for a product already in the cart; keeps quantity and position. */
  | { type: 'updateProduct'; product: Product }
  | { type: 'increment'; barcode: string }
  | { type: 'decrement'; barcode: string }
  | { type: 'remove'; barcode: string }
  | { type: 'clear' };

export function cartReducer(state: CartState, action: CartAction): CartState {
  switch (action.type) {
    case 'add': {
      const quantity = action.quantity ?? 1;
      assertQuantity(quantity);
      const existing = state.find((item) => item.product.barcode === action.product.barcode);
      // A re-added product moves to the top.
      return [
        { product: action.product, quantity: (existing?.quantity ?? 0) + quantity },
        ...state.filter((item) => item !== existing),
      ];
    }
    case 'updateProduct':
      return mapItem(state, action.product.barcode, (item) => ({ ...item, product: action.product }));
    case 'increment':
      return mapItem(state, action.barcode, (item) => ({ ...item, quantity: item.quantity + 1 }));
    case 'decrement':
      return mapItem(state, action.barcode, (item) => (item.quantity > 1 ? { ...item, quantity: item.quantity - 1 } : null));
    case 'remove':
      return mapItem(state, action.barcode, () => null);
    case 'clear':
      return state.length ? EMPTY_CART : state;
  }
}

export interface CartLine extends CartItem {
  /** price × quantity, in the product's currency */
  lineTotal: number;
}

export interface CartSummary {
  lines: CartLine[];
  /** Sum of all quantities. */
  itemCount: number;
  /** One entry per currency, sorted by currency code. */
  totals: { currency: string; amount: number }[];
}

/** Line totals and grand totals, added up in minor units so they are exact. */
export function summarizeCart(state: CartState): CartSummary {
  const totalsMinor = new Map<string, number>();
  const lines = state.map(({ product, quantity }) => {
    const lineMinor = toMinor(product.price, product.currency) * quantity;
    totalsMinor.set(product.currency, (totalsMinor.get(product.currency) ?? 0) + lineMinor);
    return { product, quantity, lineTotal: fromMinor(lineMinor, product.currency) };
  });

  return {
    lines,
    itemCount: lines.reduce((sum, line) => sum + line.quantity, 0),
    totals: [...totalsMinor]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([currency, minor]) => ({ currency, amount: fromMinor(minor, currency) })),
  };
}

/** Apply `fn` to one item; returning null removes it. Unknown barcode = no change. */
function mapItem(state: CartState, barcode: string, fn: (item: CartItem) => CartItem | null): CartState {
  const target = state.find((item) => item.product.barcode === barcode);
  if (!target) return state;
  const next = fn(target);
  return next ? state.map((item) => (item === target ? next : item)) : state.filter((item) => item !== target);
}

function assertQuantity(quantity: number): void {
  if (!Number.isInteger(quantity) || quantity < 1) throw new RangeError(`Invalid quantity: ${quantity}`);
}
