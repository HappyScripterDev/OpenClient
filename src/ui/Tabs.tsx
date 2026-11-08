import type { ReactNode } from "react";
import { classNames } from "../lib/format";

export interface SegmentOption<T extends string> {
  value: T;
  label: string;
  icon?: ReactNode;
}

export interface SegmentedProps<T extends string> {
  value: T;
  options: SegmentOption<T>[];
  onChange: (value: T) => void;
  ariaLabel: string;
}

export function Segmented<T extends string>({
  value,
  options,
  onChange,
  ariaLabel,
}: SegmentedProps<T>) {
  return (
    <div className="segmented" role="tablist" aria-label={ariaLabel}>
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          role="tab"
          aria-selected={option.value === value}
          className={classNames("segment", option.value === value && "is-active")}
          onClick={() => onChange(option.value)}
        >
          {option.icon}
          {option.label}
        </button>
      ))}
    </div>
  );
}

export interface TabItem<T extends string> {
  value: T;
  label: string;
  count?: number;
  icon?: ReactNode;
}

export interface TabsProps<T extends string> {
  value: T;
  items: TabItem<T>[];
  onChange: (value: T) => void;
  ariaLabel: string;
}

export function Tabs<T extends string>({ value, items, onChange, ariaLabel }: TabsProps<T>) {
  return (
    <div className="tabs" role="tablist" aria-label={ariaLabel}>
      {items.map((item) => (
        <button
          key={item.value}
          type="button"
          role="tab"
          aria-selected={item.value === value}
          className={classNames("tab", item.value === value && "is-active")}
          onClick={() => onChange(item.value)}
        >
          {item.icon}
          {item.label}
          {item.count !== undefined ? <span className="tab-count">{item.count}</span> : null}
        </button>
      ))}
    </div>
  );
}
