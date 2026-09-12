import { useEffect, useRef, type ReactNode } from "react";
import { CloseIcon } from "./Marks";

type Props = { open: boolean; onClose: () => void; title: string; className?: string; children: ReactNode };

export default function Dialog({ open, onClose, title, className = "", children }: Props) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);

  return (
    <dialog
      ref={ref}
      aria-label={title}
      className={`lab-dialog ${className}`}
      onCancel={onClose}
      onClick={(event) => {
        if (event.target !== event.currentTarget) return;
        const box = event.currentTarget.getBoundingClientRect();
        if (event.clientX < box.left || event.clientX > box.right || event.clientY < box.top || event.clientY > box.bottom) onClose();
      }}
    >
      <button className="dialog-close" onClick={onClose} aria-label="Close dialog"><CloseIcon /></button>
      {children}
    </dialog>
  );
}