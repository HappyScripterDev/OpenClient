import { classNames } from "../lib/format";

export interface SwitchProps {
  checked: boolean;
  onChange: (checked: boolean) => void;
  label: string;
  disabled?: boolean;
}

export function Switch({ checked, onChange, label, disabled = false }: SwitchProps) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      title={label}
      disabled={disabled}
      className={classNames("switch", checked && "is-on")}
      onClick={() => onChange(!checked)}
    />
  );
}

export interface RangeProps {
  value: number;
  min: number;
  max: number;
  step?: number;
  onChange: (value: number) => void;
  label: string;
  disabled?: boolean;
}

export function Range({
  value,
  min,
  max,
  step = 1,
  onChange,
  label,
  disabled = false,
}: RangeProps) {
  const progress = ((value - min) / (max - min || 1)) * 100;
  return (
    <input
      type="range"
      className="range"
      aria-label={label}
      value={value}
      min={min}
      max={max}
      step={step}
      disabled={disabled}
      style={{ ["--range-progress" as string]: `${progress}%` }}
      onChange={(event) => onChange(Number(event.target.value))}
    />
  );
}
