'use client';

import { useEffect, useRef } from 'react';
import { ScannerFactory } from '@/lib/client/scanners/ScannerFactory';

/** Listens for USB / Bluetooth handheld scanners while the component is mounted. */
export function useKeyboardScanner(onCode: (code: string) => void): void {
  const onCodeRef = useRef(onCode);
  useEffect(() => {
    onCodeRef.current = onCode;
  });

  useEffect(() => {
    const scanner = ScannerFactory.createKeyboardScanner();
    void scanner.start((code) => onCodeRef.current(code));
    return () => void scanner.stop();
  }, []);
}
