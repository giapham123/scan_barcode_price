'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import type { CameraScanner } from '@/lib/client/scanners/CameraScanner';
import { ScannerFactory } from '@/lib/client/scanners/ScannerFactory';
import { config } from '@/lib/config';

export type CameraState =
  | { status: 'off' }
  | { status: 'starting' }
  | { status: 'on'; engine: string }
  | { status: 'unsupported' }
  | { status: 'error'; message: string };

/**
 * Camera scanning for one <video> element: start/stop toggle + state for the UI.
 * The best engine for this browser is picked on first start (ScannerFactory).
 * The camera is always released when the component unmounts.
 */
export function useCameraScanner(onCode: (code: string) => void) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const scannerRef = useRef<CameraScanner | null>(null);
  const onCodeRef = useRef(onCode);
  const [state, setState] = useState<CameraState>({ status: 'off' });

  useEffect(() => {
    onCodeRef.current = onCode;
  });

  useEffect(() => () => void scannerRef.current?.stop(), []);

  const toggle = useCallback(async () => {
    if (scannerRef.current?.isRunning) {
      await scannerRef.current.stop();
      setState({ status: 'off' });
      return;
    }

    scannerRef.current ??= ScannerFactory.createCameraScanner({ video: videoRef.current!, cooldownMs: config.scanCooldownMs });
    const scanner = scannerRef.current;
    if (!scanner) {
      setState({ status: 'unsupported' });
      return;
    }

    setState({ status: 'starting' });
    try {
      await scanner.start((code) => onCodeRef.current(code));
      setState({ status: 'on', engine: scanner.name });
    } catch (err) {
      await scanner.stop().catch(() => {});
      setState({ status: 'error', message: describeCameraError(err) });
    }
  }, []);

  return { videoRef, state, toggle };
}

function describeCameraError(err: unknown): string {
  switch ((err as { name?: string })?.name) {
    case 'NotAllowedError':
      return 'permission denied. Allow camera access in the browser settings.';
    case 'NotFoundError':
      return 'no camera found on this device.';
    case 'NotReadableError':
      return 'the camera is in use by another application.';
    default:
      return (err as Error)?.message ?? String(err);
  }
}
