import type { PinStore } from './api/ProductApiClient';

const STORAGE_KEY = 'price-scanner:admin-pin';

/**
 * Asks for the admin PIN and remembers it for this browser tab only
 * (sessionStorage), so staff type it once per session.
 */
export class PinPrompt implements PinStore {
  get(): string | null {
    try {
      return sessionStorage.getItem(STORAGE_KEY);
    } catch {
      return null;
    }
  }

  async ask(message: string): Promise<string | null> {
    const pin = window.prompt(message)?.trim();
    if (!pin) return null;
    try {
      sessionStorage.setItem(STORAGE_KEY, pin);
    } catch {
      // Private mode: the PIN just won't be remembered.
    }
    return pin;
  }

  clear(): void {
    try {
      sessionStorage.removeItem(STORAGE_KEY);
    } catch {
      // ignore
    }
  }
}
