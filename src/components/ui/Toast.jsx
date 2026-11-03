// src/components/ui/Toast.jsx
import { useState, useEffect } from 'react';

let toastFn = null;

export function showToast(msg) {
  if (toastFn) toastFn(msg);
}

export default function Toast() {
  const [msg, setMsg] = useState('');

  useEffect(() => {
    toastFn = (m) => {
      setMsg(m);
      setTimeout(() => setMsg(''), 3200);
    };
  }, []);

  if (!msg) return null;

  return (
    <div className="pointer-events-none fixed bottom-6 right-6 z-[9999] max-w-sm animate-[agua-fade-up_0.35s_ease-out_both]">
      <div className="flex items-start gap-2.5 rounded-xl border border-slate-200/80 bg-white px-4 py-3 text-[13px] font-medium leading-snug text-ink shadow-[0_12px_32px_rgba(15,23,42,0.1)]">
        <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-blue-500" aria-hidden />
        <span>{msg}</span>
      </div>
    </div>
  );
}
