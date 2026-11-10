import { dismissToast, useToasts } from "../lib/toast";
import type { ToastKind } from "../lib/toast";

const ICON: Record<ToastKind, string> = {
  success: "✓",
  error: "!",
  warning: "!",
  info: "i",
};

export function Toasts() {
  const toasts = useToasts();

  return (
    <div className="toasts" role="status" aria-live="polite">
      {toasts.map((toast) => (
        <div key={toast.id} className="toast" data-kind={toast.kind}>
          <span className="toast-icon" aria-hidden="true">
            {ICON[toast.kind]}
          </span>
          <div>
            <strong>{toast.title}</strong>
            {toast.detail && <span>{toast.detail}</span>}
          </div>
          <button
            type="button"
            className="toast-close"
            aria-label="Dismiss notification"
            onClick={() => dismissToast(toast.id)}
          >
            {"×"}
          </button>
        </div>
      ))}
    </div>
  );
}
