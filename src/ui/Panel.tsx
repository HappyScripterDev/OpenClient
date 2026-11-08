import type { HTMLAttributes, ReactNode } from "react";
import { classNames } from "../lib/format";

export interface PanelProps extends HTMLAttributes<HTMLDivElement> {
  variant?: "glass" | "fill";
}

export function Panel({ variant = "glass", className, ...rest }: PanelProps) {
  return (
    <div
      className={classNames("panel", variant === "fill" && "panel-fill", className)}
      {...rest}
    />
  );
}

export interface SectionHeaderProps {
  title: string;
  description?: string;
  actions?: ReactNode;
  id?: string;
}

export function SectionHeader({ title, description, actions, id }: SectionHeaderProps) {
  return (
    <div className="section-header">
      <div>
        <h2 className="section-heading" id={id}>
          {title}
        </h2>
        {description ? <p className="section-desc">{description}</p> : null}
      </div>
      {actions ? <div className="section-actions">{actions}</div> : null}
    </div>
  );
}

export interface BadgeProps {
  variant?: "default" | "accent" | "success" | "warning" | "danger" | "muted";
  children: ReactNode;
  className?: string;
}

export function Badge({ variant = "default", children, className }: BadgeProps) {
  return (
    <span
      className={classNames(
        "badge",
        variant !== "default" && `badge-${variant}`,
        className,
      )}
    >
      {children}
    </span>
  );
}

export function StatusDot({
  state,
  pulse = false,
  label,
}: {
  state: "online" | "offline" | "degraded" | "unknown";
  pulse?: boolean;
  label?: string;
}) {
  return (
    <span
      className={classNames("status-dot", state, pulse && "pulse")}
      role="img"
      aria-label={label ?? state}
      title={label ?? state}
    />
  );
}
