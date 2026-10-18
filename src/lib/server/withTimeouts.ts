import { StorageTimeoutError } from './errors';

/**
 * Wraps an object so every async method fails with StorageTimeoutError after
 * `ms` instead of waiting forever (Decorator). A hanging storage call then
 * becomes a readable HTTP 503 instead of the hosting platform's bare 504.
 */
export function withTimeouts<T extends object>(target: T, ms: number, label: string): T {
  return new Proxy(target, {
    get(obj, prop, receiver) {
      const value = Reflect.get(obj, prop, receiver);
      if (typeof value !== 'function') return value;
      return (...args: unknown[]) => {
        const result = value.apply(obj, args);
        if (!(result instanceof Promise)) return result;
        let timer: ReturnType<typeof setTimeout> | undefined;
        const timeout = new Promise<never>((_, reject) => {
          timer = setTimeout(() => reject(new StorageTimeoutError(`${label}.${String(prop)} did not answer within ${ms} ms`)), ms);
        });
        return Promise.race([result, timeout]).finally(() => clearTimeout(timer));
      };
    },
  });
}
