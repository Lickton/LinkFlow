import { X } from 'lucide-react';
import type { ButtonHTMLAttributes, HTMLAttributes, ReactNode } from 'react';
import { createPortal } from 'react-dom';

interface ModalPortalProps {
  children: ReactNode;
}

interface ModalHeaderProps {
  title: ReactNode;
  onClose: () => void;
}

interface ModalFooterProps extends HTMLAttributes<HTMLDivElement> {
  children: ReactNode;
}

interface ModalButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  children: ReactNode;
}

export function ModalPortal({ children }: ModalPortalProps) {
  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4">{children}</div>,
    document.body,
  );
}

export function ModalHeader({ title, onClose }: ModalHeaderProps) {
  return (
    <div className="mb-4 flex items-center justify-between">
      <h3 className="text-lg font-semibold text-gray-800">{title}</h3>
      <button
        type="button"
        onClick={onClose}
        className="rounded-md p-1 text-gray-400 transition hover:bg-gray-100 hover:text-gray-500"
      >
        <X size={16} />
      </button>
    </div>
  );
}

export function ModalFooter({ children, className = '', ...props }: ModalFooterProps) {
  return (
    <div className={`mt-5 flex items-center justify-end gap-2 ${className}`} {...props}>
      {children}
    </div>
  );
}

export function ModalSecondaryButton({ children, type = 'button', className = '', ...props }: ModalButtonProps) {
  return (
    <button
      type={type}
      className={`rounded-lg px-3 py-2 text-sm text-gray-500 transition hover:bg-gray-100 ${className}`}
      {...props}
    >
      {children}
    </button>
  );
}

export function ModalPrimaryButton({ children, type = 'button', className = '', ...props }: ModalButtonProps) {
  return (
    <button
      type={type}
      className={`rounded-lg bg-linkflow-accent px-3 py-2 text-sm text-white transition enabled:hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50 ${className}`}
      {...props}
    >
      {children}
    </button>
  );
}
