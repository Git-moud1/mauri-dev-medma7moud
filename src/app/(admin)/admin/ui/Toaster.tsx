'use client';

import { createContext, useCallback, useContext, useMemo, useRef, useState } from 'react';
import type { ReactNode } from 'react';

/**
 * Toasts.
 *
 * `aria-live="polite"` and never focused: a toast that steals focus interrupts
 * whatever the user was typing, which is the opposite of what feedback is for.
 * Auto-dismiss at 4s, within the 3-5s the guidance calls for, and an explicit
 * close for anyone who wants it gone sooner.
 *
 * An optional action slot carries undo — the media grid uses it, because
 * removing one image should not need a confirmation dialog when it can simply
 * be undone.
 */

export interface Toast {
  id: number;
  tone: 'success' | 'error';
  text: string;
  action?: { label: string; run: () => void };
}

interface ToastContextValue {
  push: (toast: Omit<Toast, 'id'>) => void;
}

const ToastContext = createContext<ToastContextValue | null>(null);

export function useToast(): ToastContextValue {
  const context = useContext(ToastContext);
  if (!context) throw new Error('useToast must be used inside <Toaster>');
  return context;
}

const DISMISS_MS = 4000;

export function Toaster({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const nextId = useRef(0);

  const dismiss = useCallback((id: number) => {
    setToasts((current) => current.filter((toast) => toast.id !== id));
  }, []);

  const push = useCallback(
    (toast: Omit<Toast, 'id'>) => {
      const id = nextId.current++;
      setToasts((current) => [...current, { ...toast, id }]);
      setTimeout(() => {
        dismiss(id);
      }, DISMISS_MS);
    },
    [dismiss],
  );

  const value = useMemo(() => ({ push }), [push]);

  return (
    <ToastContext.Provider value={value}>
      {children}
      <div
        aria-live="polite"
        aria-atomic="false"
        className="pointer-events-none fixed bottom-6 end-6 z-50 flex w-[min(24rem,calc(100vw-3rem))] flex-col gap-2"
      >
        {toasts.map((toast) => (
          <div
            key={toast.id}
            className={`pointer-events-auto flex items-center gap-3 rounded-xl border px-4 py-3 text-sm shadow-lg backdrop-blur ${
              toast.tone === 'success'
                ? 'border-border bg-surface/95 text-fg'
                : 'border-red-500/40 bg-surface/95 text-red-300'
            }`}
          >
            <span className="flex-1">{toast.text}</span>
            {toast.action ? (
              <button
                type="button"
                onClick={() => {
                  toast.action?.run();
                  dismiss(toast.id);
                }}
                className="shrink-0 rounded-lg px-2 py-1 text-xs font-semibold text-gold transition-colors hover:bg-gold/10"
              >
                {toast.action.label}
              </button>
            ) : null}
            <button
              type="button"
              aria-label="Dismiss"
              onClick={() => {
                dismiss(toast.id);
              }}
              className="shrink-0 rounded-lg px-1.5 py-1 text-muted transition-colors hover:text-fg"
            >
              ×
            </button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}
