import { AlertTriangle, CheckCircle2, Info, X, XCircle } from "lucide-react";
import { appStore, useAppState } from "../lib/store";
import type { ToastVariant } from "../lib/store";

function ToastIcon({ variant }: { variant: ToastVariant }) {
  if (variant === "success") return <CheckCircle2 size={19} />;
  if (variant === "warning") return <AlertTriangle size={19} />;
  if (variant === "error") return <XCircle size={19} />;
  return <Info size={19} />;
}

export function ToastLayer() {
  const { toasts } = useAppState();
  return (
    <div className="toast-layer" aria-live="polite" aria-atomic="false">
      {toasts.map((toast) => (
        <div
          key={toast.id}
          className={`toast is-${toast.variant}${toast.leaving ? " is-leaving" : ""}`}
          role={toast.variant === "error" ? "alert" : "status"}
        >
          <div className="toast-icon">
            <ToastIcon variant={toast.variant} />
          </div>
          <div className="toast-main">
            <div className="toast-title">{toast.title}</div>
            {toast.description ? (
              <div className="toast-desc">{toast.description}</div>
            ) : null}
          </div>
          <button
            type="button"
            className="toast-close"
            aria-label="Dismiss notification"
            onClick={() => appStore.dismissToast(toast.id)}
          >
            <X size={14} />
          </button>
        </div>
      ))}
    </div>
  );
}
