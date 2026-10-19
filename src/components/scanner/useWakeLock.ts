'use client';

import { useEffect } from 'react';

/**
 * Keeps the phone screen on while `active` (e.g. while the camera is scanning),
 * so it does not dim and lock in the middle of a scanning session.
 * Uses the Screen Wake Lock API where available; does nothing elsewhere.
 * The browser drops the lock when the app goes to the background, so it is
 * requested again when the app becomes visible.
 */
export function useWakeLock(active: boolean): void {
  useEffect(() => {
    if (!active || !('wakeLock' in navigator)) return;
    let lock: WakeLockSentinel | null = null;
    let cancelled = false;

    const request = async () => {
      if (document.visibilityState !== 'visible') return;
      try {
        const sentinel = await navigator.wakeLock.request('screen');
        if (cancelled) void sentinel.release();
        else lock = sentinel;
      } catch {
        // Refused (e.g. battery saver): the screen just behaves normally.
      }
    };
    const onVisible = () => void request();

    void request();
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      cancelled = true;
      document.removeEventListener('visibilitychange', onVisible);
      void lock?.release();
    };
  }, [active]);
}
