import type { InputHTMLAttributes, ReactNode } from "react";
import { Search, X } from "lucide-react";
import { classNames } from "../lib/format";

export interface FieldProps {
  label?: string;
  hint?: string;
  error?: string;
  optional?: boolean;
  children: ReactNode;
  className?: string;
}

export function Field({ label, hint, error, optional, children, className }: FieldProps) {
  return (
    <label className={classNames("field", className)}>
      {label ? (
        <span className="field-label">
          {label}
          {optional ? <span className="optional">Optional</span> : null}
        </span>
      ) : null}
      {children}
      {error ? <span className="field-error">{error}</span> : hint ? <span className="field-hint">{hint}</span> : null}
    </label>
  );
}

export interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  mono?: boolean;
}

export function Input({ className, mono, ...rest }: InputProps) {
  return (
    <input
      className={classNames("input", mono && "input-mono", className)}
      {...rest}
    />
  );
}

export interface SearchInputProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  autoFocus?: boolean;
  dataGlobalSearch?: boolean;
  ariaLabel?: string;
}

export function SearchInput({
  value,
  onChange,
  placeholder = "Search",
  autoFocus,
  dataGlobalSearch,
  ariaLabel,
}: SearchInputProps) {
  return (
    <div className="search-field">
      <Search size={16} />
      <input
        className="input"
        type="search"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        autoFocus={autoFocus}
        aria-label={ariaLabel ?? placeholder}
        data-global-search={dataGlobalSearch ? "" : undefined}
      />
      {value ? (
        <button
          type="button"
          className="icon-btn search-clear"
          onClick={() => onChange("")}
          aria-label="Clear search"
        >
          <X size={14} />
        </button>
      ) : null}
    </div>
  );
}
