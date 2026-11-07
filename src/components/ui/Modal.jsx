// src/components/ui/Modal.jsx
import { useEffect } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';

export default function Modal({ title, onClose, children, wide = false }) {
  useEffect(() => {
    const handler = (e) => {
      if (e.key === 'Escape') onClose();
    };
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    window.addEventListener('keydown', handler);
    return () => {
      document.body.style.overflow = prevOverflow;
      window.removeEventListener('keydown', handler);
    };
  }, [onClose]);

  if (typeof document === 'undefined') return null;

  return createPortal(
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center p-4"
      role="presentation"
    >
      {/* Full-viewport dim + blur — sits above the entire app shell */}
      <div
        className="absolute inset-0 bg-slate-950/50 backdrop-blur-md"
        onClick={onClose}
        aria-hidden="true"
      />

      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="modal-title"
        className={`relative z-[1] max-h-[90vh] w-full overflow-y-auto rounded-2xl border border-slate-200/80 bg-white p-6 shadow-[0_24px_64px_rgba(15,23,42,0.28)] ${
          wide ? 'max-w-2xl' : 'max-w-[460px]'
        }`}
      >
        <h2 id="modal-title" className="pr-8 font-display text-lg font-bold tracking-tight text-ink">
          {title}
        </h2>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close"
          className="absolute right-3 top-3 flex h-8 w-8 cursor-pointer items-center justify-center rounded-lg text-slate-400 transition hover:bg-slate-100 hover:text-ink"
        >
          <X size={18} />
        </button>
        <div className="mt-4">{children}</div>
      </div>
    </div>,
    document.body
  );
}
