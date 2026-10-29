import { useEffect, useRef, useState, type ReactNode } from 'react';
import { initials } from '../lib/util';

export function Spinner({ label }: { label?: string }) {
  return (
    <span className="spinner-wrap" role="status">
      <span className="spinner" aria-hidden="true" />
      {label && <span>{label}</span>}
    </span>
  );
}

export function Avatar({ name, color, size = 40, online = true }: { name: string; color: string; size?: number; online?: boolean }) {
  return (
    <span className={`avatar ${online ? '' : 'avatar-offline'}`} style={{ width: size, height: size, background: color, fontSize: size * 0.4 }} aria-hidden="true">
      {initials(name)}
    </span>
  );
}

export function Logo({ small }: { small?: boolean }) {
  return (
    <span className={`logo ${small ? 'logo-small' : ''}`}>
      <svg viewBox="0 0 64 64" width={small ? 28 : 40} height={small ? 28 : 40} aria-hidden="true">
        <defs>
          <linearGradient id="lg" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" stopColor="#7c5cff" />
            <stop offset="1" stopColor="#ff5c8a" />
          </linearGradient>
        </defs>
        <rect width="64" height="64" rx="16" fill="url(#lg)" />
        <circle cx="23" cy="27" r="7" fill="#fff" />
        <circle cx="41" cy="27" r="7" fill="#fff" />
        <path d="M18 42c4 6 24 6 28 0" stroke="#fff" strokeWidth="5" fill="none" strokeLinecap="round" />
      </svg>
      <span className="logo-text">
        Play<span>Together</span>
      </span>
    </span>
  );
}

export function ConfirmButton({
  children,
  confirmText,
  onConfirm,
  className = 'btn btn-ghost',
}: {
  children: ReactNode;
  confirmText: string;
  onConfirm: () => void;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    if (open) ref.current?.showModal?.();
    else ref.current?.close?.();
  }, [open]);
  return (
    <>
      <button type="button" className={className} onClick={() => setOpen(true)}>
        {children}
      </button>
      <dialog ref={ref} className="dialog" onClose={() => setOpen(false)} onCancel={() => setOpen(false)}>
        <p>{confirmText}</p>
        <div className="row gap end">
          <button type="button" className="btn btn-ghost" onClick={() => setOpen(false)}>
            Cancel
          </button>
          <button
            type="button"
            className="btn btn-danger"
            onClick={() => {
              setOpen(false);
              onConfirm();
            }}
          >
            Confirm
          </button>
        </div>
      </dialog>
    </>
  );
}

export function EmptyState({ icon, title, children }: { icon: string; title: string; children?: ReactNode }) {
  return (
    <div className="empty">
      <div className="empty-icon" aria-hidden="true">
        {icon}
      </div>
      <h3>{title}</h3>
      {children && <div className="muted">{children}</div>}
    </div>
  );
}
