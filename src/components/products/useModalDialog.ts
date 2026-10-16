'use client';

import { useEffect, useRef } from 'react';

/**
 * Opens a native <dialog> as a modal while the component is mounted.
 * Esc calls `onCancel` instead of closing on its own, so the component stays
 * in charge (e.g. it can refuse while saving).
 *
 * Mark the element to focus first with `data-autofocus` (React's autoFocus runs
 * before the dialog opens, and opening it moves focus to the first field).
 */
export function useModalDialog(onCancel: () => void) {
  const ref = useRef<HTMLDialogElement>(null);
  const onCancelRef = useRef(onCancel);
  useEffect(() => {
    onCancelRef.current = onCancel;
  });

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    const handleCancel = (event: Event) => {
      event.preventDefault();
      onCancelRef.current();
    };
    dialog.addEventListener('cancel', handleCancel);
    dialog.showModal();
    dialog.querySelector<HTMLElement>('[data-autofocus]')?.focus();
    return () => {
      dialog.removeEventListener('cancel', handleCancel);
      dialog.close();
    };
  }, []);

  return ref;
}
