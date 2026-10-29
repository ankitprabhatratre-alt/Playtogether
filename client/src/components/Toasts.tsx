import { createContext, useCallback, useContext, useMemo, useRef, useState, type ReactNode } from 'react';

type Level = 'info' | 'warn' | 'error' | 'success';
interface Toast {
  id: number;
  message: string;
  level: Level;
}
interface ToastApi {
  push(message: string, level?: Level): void;
}

const ToastContext = createContext<ToastApi>({ push: () => {} });
export const useToasts = () => useContext(ToastContext);

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const seq = useRef(0);
  const push = useCallback((message: string, level: Level = 'info') => {
    const id = ++seq.current;
    setToasts((t) => [...t.filter((x) => x.message !== message), { id, message, level }].slice(-4));
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), level === 'error' ? 4500 : 3000);
  }, []);
  const api = useMemo(() => ({ push }), [push]);
  return (
    <ToastContext.Provider value={api}>
      {children}
      <div className="toasts" role="status" aria-live="polite">
        {toasts.map((t) => (
          <div key={t.id} className={`toast toast-${t.level}`}>
            {t.message}
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}
