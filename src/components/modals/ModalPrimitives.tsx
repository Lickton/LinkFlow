import { X } from 'lucide-react';
import type { ReactNode } from 'react';
import { createPortal } from 'react-dom';

interface ModalPortalProps {
  children: ReactNode;
}

interface ModalHeaderProps {
  title: ReactNode;
  onClose: () => void;
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
