import { useEffect, useRef } from 'react';
import type { FastOpMeta } from '../../lib/actions';

interface ConfirmActionModalProps {
  meta: FastOpMeta;
  /** Tutup modal tanpa mengeksekusi. */
  onCancel: () => void;
  /** Tutup modal lalu jalankan aksi (alur eksekusi tetap di pemanggil). */
  onConfirm: () => void;
}

/**
 * Modal konfirmasi in-app untuk aksi Fast Ops berdampak nyata —
 * pengganti window.confirm yang tak bisa di-styling (konsisten tema Pro).
 */
export default function ConfirmActionModal({ meta, onCancel, onConfirm }: ConfirmActionModalProps) {
  const cancelRef = useRef<HTMLButtonElement>(null);

  // Fokus awal ke tombol Batal agar Enter tidak langsung mengeksekusi aksi.
  useEffect(() => {
    cancelRef.current?.focus();
  }, []);

  // Escape = batal (tutup modal tanpa eksekusi).
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') onCancel();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onCancel]);

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-space-sm bg-black/50 backdrop-blur-[2px]">
      <div
        role="dialog"
        aria-modal="true"
        aria-label={`Konfirmasi aksi ${meta.title}`}
        className="w-full max-w-lg bg-surface-container-low border border-outline-variant rounded-pro p-space-md flex flex-col gap-space-sm shadow-xl"
      >
        <h2 className="font-headline-sm text-headline-sm text-on-surface font-semibold uppercase tracking-tight">
          Konfirmasi aksi
        </h2>

        <p className="font-code-md text-code-md font-semibold text-primary">{meta.title}</p>

        <pre className="p-space-sm rounded bg-surface-container-lowest text-secondary font-code-md text-code-md whitespace-pre-wrap break-words">
          {meta.command_display}
        </pre>

        <p className="font-label-sm text-label-sm text-error uppercase">
          Aksi ini berdampak nyata pada sistem.
        </p>

        <div className="flex justify-end gap-space-xs pt-space-xs">
          <button
            ref={cancelRef}
            type="button"
            onClick={onCancel}
            className="px-space-sm py-1.5 rounded font-label-sm text-label-sm uppercase bg-surface-container-high text-on-surface hover:bg-surface-container-highest transition-colors"
          >
            Batal
          </button>
          <button
            type="button"
            onClick={onConfirm}
            className="px-space-sm py-1.5 rounded font-label-sm text-label-sm uppercase font-semibold bg-primary-container text-on-primary-container hover:opacity-90 transition-opacity"
          >
            Jalankan
          </button>
        </div>
      </div>
    </div>
  );
}
