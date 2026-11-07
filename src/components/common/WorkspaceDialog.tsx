import { useLayoutEffect, useRef, type ReactNode } from 'react';

export function WorkspaceDialog({ children, titleId, onClose, busy = false, className = '' }: {
  children: ReactNode; titleId: string; onClose: () => void; busy?: boolean; className?: string;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  useLayoutEffect(() => {
    const node = dialog.current;
    const trigger = document.activeElement;
    node?.showModal();
    node?.querySelector<HTMLElement>('[data-dialog-focus]')?.focus();
    return () => {
      node?.close();
      if (trigger instanceof HTMLElement && trigger.isConnected) trigger.focus();
    };
  }, []);

  return <dialog ref={dialog} aria-labelledby={titleId} className={`preci-dialog route-dialog no-print ${className}`}
    onCancel={event => { event.preventDefault(); if (!busy) onClose(); }}>{children}</dialog>;
}
