import { useEffect } from 'react';

export interface ToastData {
  id: string;
  message: string;
  onUndo?: () => void;
}

export default function Toast({ toast, onDismiss }: { toast: ToastData; onDismiss: (id: string) => void }) {
  useEffect(() => {
    const t = window.setTimeout(() => onDismiss(toast.id), 5000);
    return () => window.clearTimeout(t);
  }, [toast.id, onDismiss]);

  return (
    <div className="toast">
      <span>{toast.message}</span>
      {toast.onUndo && (
        <button
          className="toast-undo"
          onClick={() => {
            toast.onUndo?.();
            onDismiss(toast.id);
          }}
        >
          Undo
        </button>
      )}
    </div>
  );
}
