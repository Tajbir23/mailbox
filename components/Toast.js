"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";

const ToastCtx = createContext(null);

export function useToast() {
  const ctx = useContext(ToastCtx);
  if (!ctx) throw new Error("useToast must be used inside <ToastProvider>");
  return ctx;
}

const ICONS = {
  success: (
    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" /></svg>
  ),
  error: (
    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M12 9v2m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" /></svg>
  ),
  info: (
    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
  ),
};

const TONE = {
  success: { bar: "bg-emerald-500", icon: "bg-emerald-50 text-emerald-600" },
  error: { bar: "bg-red-500", icon: "bg-red-50 text-red-600" },
  info: { bar: "bg-brand-500", icon: "bg-brand-50 text-brand-600" },
};

function ToastItem({ toast, onClose }) {
  useEffect(() => {
    if (toast.duration === 0) return;
    const t = setTimeout(() => onClose(toast.id), toast.duration ?? 4000);
    return () => clearTimeout(t);
  }, [toast.id, toast.duration, onClose]);

  const tone = TONE[toast.type] || TONE.info;
  return (
    <div
      role={toast.type === "error" ? "alert" : "status"}
      className="pointer-events-auto w-[min(92vw,360px)] card shadow-soft-lg overflow-hidden animate-slide-up"
    >
      <div className="flex">
        <div className={`w-1 shrink-0 ${tone.bar}`} />
        <div className="flex items-start gap-3 px-4 py-3 flex-1 min-w-0">
          <div className={`w-7 h-7 rounded-lg flex items-center justify-center shrink-0 ${tone.icon}`}>
            {ICONS[toast.type] || ICONS.info}
          </div>
          <div className="min-w-0 flex-1">
            {toast.title && (
              <p className="text-sm font-semibold text-surface-800 truncate">{toast.title}</p>
            )}
            <p className={`text-sm text-surface-600 break-words ${toast.title ? "mt-0.5" : ""}`}>
              {toast.message}
            </p>
          </div>
          <button
            onClick={() => onClose(toast.id)}
            className="shrink-0 p-1 -mr-1 rounded-lg text-surface-300 hover:text-surface-600 hover:bg-surface-100 transition"
            title="Dismiss"
          >
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
          </button>
        </div>
      </div>
    </div>
  );
}

function ConfirmDialog({ data, onResolve }) {
  const cancelRef = useRef(null);
  const confirmRef = useRef(null);
  const [value, setValue] = useState(data.defaultValue ?? "");

  // Esc to dismiss. Enter is handled by the focused button's native click —
  // adding a window-level Enter handler here would race with the cancel
  // button (default focus) and could accidentally confirm destructive actions.
  useEffect(() => {
    const cancelValue = data.kind === "prompt" ? null : false;
    const onKey = (e) => {
      if (e.key === "Escape") onResolve(cancelValue);
    };
    window.addEventListener("keydown", onKey);
    // Default focus: input for prompt, cancel button for confirm (safer).
    (data.kind === "prompt" ? confirmRef.current : cancelRef.current)?.focus();
    return () => window.removeEventListener("keydown", onKey);
  }, [data.kind, onResolve]);

  const handleConfirm = () => {
    if (data.kind === "prompt") {
      onResolve(value);
    } else {
      onResolve(true);
    }
  };

  const danger = data.danger;
  const confirmClass = danger
    ? "bg-red-600 hover:bg-red-700 active:bg-red-800 text-white"
    : "bg-brand-600 hover:bg-brand-700 active:bg-brand-800 text-white";

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 animate-fade-in">
      <div
        className="absolute inset-0 bg-black/40 backdrop-blur-sm"
        onClick={() => onResolve(data.kind === "prompt" ? null : false)}
      />
      <div className="relative card w-[min(92vw,420px)] overflow-hidden animate-scale-in">
        <div className="px-5 py-4 border-b border-surface-100 flex items-start gap-3">
          <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${danger ? "bg-red-50 text-red-600" : "bg-brand-50 text-brand-600"}`}>
            {danger ? (
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" /></svg>
            ) : (
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
            )}
          </div>
          <div className="min-w-0 flex-1">
            {data.title && (
              <h3 className="text-base font-semibold text-surface-900">{data.title}</h3>
            )}
            {data.message && (
              <p className="text-sm text-surface-600 mt-0.5 break-words">{data.message}</p>
            )}
          </div>
        </div>

        {data.kind === "prompt" && (
          <div className="px-5 py-4">
            <input
              ref={confirmRef}
              type="text"
              value={value}
              onChange={(e) => setValue(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  handleConfirm();
                }
              }}
              placeholder={data.placeholder || ""}
              className="input-field text-sm"
              autoFocus
            />
          </div>
        )}

        <div className="px-5 py-3 bg-surface-50/60 border-t border-surface-100 flex items-center justify-end gap-2">
          <button
            ref={cancelRef}
            onClick={() => onResolve(data.kind === "prompt" ? null : false)}
            className="btn-ghost text-sm py-2 px-4"
          >
            {data.cancelText || "Cancel"}
          </button>
          <button
            onClick={handleConfirm}
            className={`inline-flex items-center justify-center gap-2 px-4 py-2 text-sm font-medium rounded-xl transition-all duration-200 shadow-sm hover:shadow-md active:scale-[0.98] focus:outline-none focus:ring-2 focus:ring-offset-2 ${confirmClass} ${danger ? "focus:ring-red-500" : "focus:ring-brand-500"}`}
          >
            {data.confirmText || "Confirm"}
          </button>
        </div>
      </div>
    </div>
  );
}

export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([]);
  const [dialog, setDialog] = useState(null);
  const idRef = useRef(0);

  const dismiss = useCallback((id) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const push = useCallback((type, message, opts = {}) => {
    const id = ++idRef.current;
    setToasts((prev) => [
      ...prev,
      { id, type, message: typeof message === "string" ? message : String(message ?? ""), ...opts },
    ]);
    return id;
  }, []);

  const api = useMemo(() => {
    const open = (kind, data) =>
      new Promise((resolve) => {
        setDialog({
          kind,
          ...data,
          _resolve: (val) => {
            setDialog(null);
            resolve(val);
          },
        });
      });

    return {
      success: (message, opts) => push("success", message, opts),
      error: (message, opts) => push("error", message, opts),
      info: (message, opts) => push("info", message, opts),
      dismiss,
      // confirm({ title, message, confirmText, cancelText, danger }) → Promise<boolean>
      confirm: (data) => open("confirm", data || {}),
      // prompt({ title, message, defaultValue, placeholder, ... }) → Promise<string|null>
      prompt: (data) => open("prompt", data || {}),
    };
  }, [push, dismiss]);

  return (
    <ToastCtx.Provider value={api}>
      {children}
      <div className="fixed top-4 right-4 z-[90] flex flex-col gap-2 pointer-events-none">
        {toasts.map((t) => (
          <ToastItem key={t.id} toast={t} onClose={dismiss} />
        ))}
      </div>
      {dialog && <ConfirmDialog data={dialog} onResolve={dialog._resolve} />}
    </ToastCtx.Provider>
  );
}
