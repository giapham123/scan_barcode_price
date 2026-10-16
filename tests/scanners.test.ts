import { describe, expect, test } from 'vitest';
import { CameraScanner } from '@/lib/client/scanners/CameraScanner';
import { KeyboardWedgeScanner } from '@/lib/client/scanners/KeyboardWedgeScanner';
import { ScanDeduplicator } from '@/lib/client/scanners/ScanDeduplicator';

/** Minimal key-event target that lets tests "type" with a fake clock. */
function fakeKeyboard() {
  const listeners = new Set<(e: { key: string; target: unknown }) => void>();
  let now = 0;
  return {
    target: {
      addEventListener: (_: 'keydown', fn: (e: { key: string; target: unknown }) => void) => listeners.add(fn),
      removeEventListener: (_: 'keydown', fn: (e: { key: string; target: unknown }) => void) => listeners.delete(fn),
    },
    now: () => now,
    type(text: string, { gapMs = 10, target = { tagName: 'BODY' } } = {}) {
      for (const key of [...text, 'Enter']) {
        now += gapMs;
        listeners.forEach((fn) => fn({ key, target }));
      }
    },
    get listenerCount() {
      return listeners.size;
    },
  };
}

async function wedge() {
  const kb = fakeKeyboard();
  const scanner = new KeyboardWedgeScanner({ target: kb.target as never, now: kb.now });
  const codes: string[] = [];
  await scanner.start((c) => codes.push(c));
  return { kb, scanner, codes };
}

describe('ScanDeduplicator', () => {
  test('a barcode held in view is counted once', () => {
    let now = 0;
    const dedup = new ScanDeduplicator({ cooldownMs: 1000, now: () => now });
    const accepted: number[] = [];
    for (; now <= 5000; now += 100) if (dedup.accept('A')) accepted.push(now);
    expect(accepted).toEqual([0]);
  });

  test('counted again after being out of view for the cooldown', () => {
    let now = 0;
    const dedup = new ScanDeduplicator({ cooldownMs: 1000, now: () => now });
    expect(dedup.accept('A')).toBe(true);
    now = 900;
    expect(dedup.accept('A')).toBe(false); // refreshes "last seen"
    now = 1800;
    expect(dedup.accept('A')).toBe(false);
    now = 2900;
    expect(dedup.accept('A')).toBe(true);
  });

  test('several barcodes in the same frame are each counted once', () => {
    let now = 0;
    const dedup = new ScanDeduplicator({ cooldownMs: 1000, now: () => now });
    const accepted: string[] = [];
    for (; now < 3000; now += 100) for (const code of ['A', 'B', 'C']) if (dedup.accept(code)) accepted.push(code);
    expect(accepted).toEqual(['A', 'B', 'C']);
  });
});

describe('KeyboardWedgeScanner', () => {
  test('emits a fast burst followed by Enter', async () => {
    const { kb, codes } = await wedge();
    kb.type('5449000000996');
    expect(codes).toEqual(['5449000000996']);
  });

  test('ignores slow human typing, short bursts and keys typed into form fields', async () => {
    const { kb, codes } = await wedge();
    kb.type('5449000000996', { gapMs: 200 });
    kb.type('123');
    kb.type('5449000000996', { target: { tagName: 'INPUT' } });
    expect(codes).toEqual([]);
  });

  test('stop() removes the listener', async () => {
    const { kb, scanner } = await wedge();
    await scanner.stop();
    expect(kb.listenerCount).toBe(0);
  });
});

describe('CameraScanner', () => {
  test('subclasses only implement decoding; the base filters duplicates and ignores codes after stop', async () => {
    class FakeCamera extends CameraScanner {
      readonly name = 'fake';
      protected async startDecoding() {}
      protected async stopDecoding() {}
      emit(code: string) {
        this.report(code);
      }
    }
    const camera = new FakeCamera({ video: {} as HTMLVideoElement, cooldownMs: 10_000 });
    const codes: string[] = [];
    await camera.start((c) => codes.push(c));
    camera.emit('111');
    camera.emit('111');
    camera.emit('222');
    await camera.stop();
    camera.emit('333');
    expect(codes).toEqual(['111', '222']);
  });
});
