import type { ButtonHTMLAttributes, ReactNode } from "react";
import { classNames } from "../lib/format";

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: "primary" | "secondary" | "ghost" | "outline" | "danger" | "glass";
  size?: "xs" | "sm" | "md" | "lg";
  loading?: boolean;
  icon?: ReactNode;
  block?: boolean;
}

export function Button({
  variant = "secondary",
  size = "md",
  loading = false,
  icon,
  block = false,
  className,
  children,
  disabled,
  ...rest
}: ButtonProps) {
  return (
    <button
      type="button"
      className={classNames(
        "btn",
        `btn-${variant}`,
        size !== "md" && `btn-${size}`,
        block && "btn-block",
        className,
      )}
      disabled={disabled || loading}
      {...rest}
    >
      {loading ? <span className="spinner" aria-hidden /> : icon}
      {children}
    </button>
  );
}

export interface IconButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  label: string;
  size?: "sm" | "md";
  children: ReactNode;
}

export function IconButton({
  label,
  size = "md",
  className,
  children,
  ...rest
}: IconButtonProps) {
  return (
    <button
      type="button"
      className={classNames("icon-btn", size === "sm" && "icon-btn-sm", className)}
      aria-label={label}
      title={label}
      {...rest}
    >
      {children}
    </button>
  );
}
