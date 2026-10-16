'use client';

import { useCameraScanner, type CameraState } from './useCameraScanner';
import styles from './Scanner.module.css';

const LABELS: Record<CameraState['status'], string> = {
  off: 'Start camera',
  starting: 'Starting…',
  on: 'Stop camera',
  unsupported: 'Camera unavailable',
  error: 'Start camera',
};

function statusText(state: CameraState): string {
  switch (state.status) {
    case 'off':
      return 'Camera is off.';
    case 'starting':
      return 'Requesting camera access…';
    case 'on':
      return `Point the camera at a barcode. (${state.engine})`;
    case 'unsupported':
      return 'This browser cannot use the camera. Type the code or use a handheld scanner.';
    case 'error':
      return `Camera error: ${state.message}`;
  }
}

export function CameraPanel({ onCode }: { onCode: (code: string) => void }) {
  const { videoRef, state, toggle } = useCameraScanner(onCode);

  return (
    <section className="card" aria-label="Camera scanner">
      <div className={styles.viewport}>
        {/* playsInline + muted: required for inline video on iPhone */}
        <video ref={videoRef} muted playsInline />
        {state.status === 'on' && <div className={styles.frame} aria-hidden="true" />}
      </div>
      <button
        type="button"
        className="button"
        onClick={() => void toggle()}
        disabled={state.status === 'starting' || state.status === 'unsupported'}
      >
        {LABELS[state.status]}
      </button>
      <p className={styles.cameraStatus} data-error={state.status === 'error' || undefined} aria-live="polite">
        {statusText(state)}
      </p>
    </section>
  );
}
