"use client";

import { useEffect, useRef } from "react";

const SIZE = {
  sm: "w-[min(92vw,420px)]",
  md: "w-[min(92vw,520px)]",
  lg: "w-[min(94vw,720px)]",
};

export default function Modal({
  open,
  onClose,
  title,
  description,
  icon,
  iconClass = "bg-brand-50 text-brand-600",
  size = "md",
  children,
  footer,
  closeOnBackdrop = true,
}) {
  const dialogRef = useRef(null);

  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKey = (e) => {
      if (e.key === "Escape") onClose?.();
    };
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = prev;
      window.removeEventListener("keydown", onKey);
    };
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center p-4 animate-fade-in">
      <div
        className="absolute inset-0 bg-black/40 backdrop-blur-sm"
        onClick={() => closeOnBackdrop && onClose?.()}
      />
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        className={`relative card overflow-hidden flex flex-col max-h-[92vh] animate-scale-in ${SIZE[size] || SIZE.md}`}
      >
        {(title || icon) && (
          <div className="px-5 py-4 border-b border-surface-100 flex items-start gap-3">
            {icon && (
              <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${iconClass}`}>
                {icon}
              </div>
            )}
            <div className="min-w-0 flex-1">
              {title && <h3 className="text-base font-semibold text-surface-900">{title}</h3>}
              {description && <p className="text-sm text-surface-500 mt-0.5 break-words">{description}</p>}
            </div>
            <button
              onClick={() => onClose?.()}
              title="Close"
              className="shrink-0 p-1.5 -mr-1 rounded-lg text-surface-400 hover:text-surface-700 hover:bg-surface-100 transition"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
            </button>
          </div>
        )}

        <div className="px-5 py-4 overflow-y-auto flex-1 min-h-0">{children}</div>

        {footer && (
          <div className="px-5 py-3 bg-surface-50/60 border-t border-surface-100 flex items-center justify-end gap-2">
            {footer}
          </div>
        )}
      </div>
    </div>
  );
}
