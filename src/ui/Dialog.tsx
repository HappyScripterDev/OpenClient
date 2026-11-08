import { useEffect, useId, useRef, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";
import { classNames } from "../lib/format";
import { IconButton } from "./Button";

export interface DialogProps {
  open: boolean;
  onClose: () => void;
  title: string;
  description?: string;
  children?: ReactNode;
  footer?: ReactNode;
  width?: "narrow" | "normal" | "wide";
  showClose?: boolean;
}

export function Dialog({
  open,
  onClose,
  title,
  description,
  children,
  footer,
  width = "normal",
  showClose = true,
}: DialogProps) {
  const titleId = useId();
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.key === "Escape") {
        event.stopPropagation();
        onClose();
      }
    };
    window.addEventListener("keydown", onKeyDown, true);
    const focusTimer = window.setTimeout(() => {
      const target = panelRef.current?.querySelector<HTMLElement>(
        "input, textarea, button:not([data-dialog-close]), select",
      );
      target?.focus();
    }, 40);
    return () => {
      window.removeEventListener("keydown", onKeyDown, true);
      window.clearTimeout(focusTimer);
    };
  }, [open, onClose]);

  if (!open) return null;

  return createPortal(
    <div
      className="dialog-backdrop"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div
        className={classNames(
          "dialog",
          width === "wide" && "is-wide",
          width === "narrow" && "is-narrow",
        )}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        ref={panelRef}
      >
        <div className="dialog-header">
          <div className="grow">
            <h2 className="dialog-title" id={titleId}>
              {title}
            </h2>
            {description ? <p className="dialog-desc">{description}</p> : null}
          </div>
          {showClose ? (
            <IconButton
              label="Close dialog"
              className="dialog-close"
              data-dialog-close
              onClick={onClose}
            >
              <X size={17} />
            </IconButton>
          ) : null}
        </div>
        {children ? <div className="dialog-body">{children}</div> : null}
        {footer ? <div className="dialog-footer">{footer}</div> : null}
      </div>
    </div>,
    document.body,
  );
}
