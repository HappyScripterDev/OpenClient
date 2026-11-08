import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Check, ChevronDown } from "lucide-react";
import { classNames } from "../lib/format";

export interface SelectOption {
  value: string;
  label: string;
  description?: string;
  disabled?: boolean;
}

export interface SelectProps {
  value: string;
  onChange: (value: string) => void;
  options: SelectOption[];
  placeholder?: string;
  ariaLabel?: string;
  disabled?: boolean;
  className?: string;
}

export function Select({
  value,
  onChange,
  options,
  placeholder = "Select",
  ariaLabel,
  disabled = false,
  className,
}: SelectProps) {
  const [open, setOpen] = useState(false);
  const [highlighted, setHighlighted] = useState(0);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const [position, setPosition] = useState({ left: 0, top: 0, width: 0 });
  const selected = options.find((option) => option.value === value);

  useEffect(() => {
    if (!open) return;
    const update = (): void => {
      const rect = triggerRef.current?.getBoundingClientRect();
      if (!rect) return;
      const height = Math.min(320, options.length * 38 + 10);
      const spaceBelow = window.innerHeight - rect.bottom;
      const top =
        spaceBelow >= height + 10 ? rect.bottom + 6 : Math.max(8, rect.top - height - 6);
      setPosition({ left: rect.left, top, width: rect.width });
    };
    update();
    window.addEventListener("resize", update);
    window.addEventListener("scroll", update, true);
    return () => {
      window.removeEventListener("resize", update);
      window.removeEventListener("scroll", update, true);
    };
  }, [open, options.length]);

  useEffect(() => {
    if (!open) return;
    const selectedIndex = options.findIndex((option) => option.value === value);
    setHighlighted(selectedIndex >= 0 ? selectedIndex : 0);
    const onPointerDown = (event: PointerEvent): void => {
      const target = event.target as Node;
      if (
        triggerRef.current?.contains(target) ||
        menuRef.current?.contains(target)
      ) {
        return;
      }
      setOpen(false);
    };
    window.addEventListener("pointerdown", onPointerDown);
    return () => window.removeEventListener("pointerdown", onPointerDown);
  }, [open, options, value]);

  const choose = (option: SelectOption): void => {
    if (option.disabled) return;
    onChange(option.value);
    setOpen(false);
    triggerRef.current?.focus();
  };

  return (
    <div className={classNames("select-wrap", className)}>
      <button
        ref={triggerRef}
        type="button"
        className="select-trigger"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={ariaLabel}
        disabled={disabled}
        onClick={() => setOpen((current) => !current)}
        onKeyDown={(event) => {
          if (event.key === "ArrowDown" || event.key === "ArrowUp") {
            event.preventDefault();
            if (!open) {
              setOpen(true);
              return;
            }
            const direction = event.key === "ArrowDown" ? 1 : -1;
            setHighlighted((current) => {
              let next = current;
              for (let step = 0; step < options.length; step += 1) {
                next = (next + direction + options.length) % options.length;
                if (!options[next]?.disabled) break;
              }
              return next;
            });
          } else if (event.key === "Enter" || event.key === " ") {
            if (open) {
              event.preventDefault();
              const option = options[highlighted];
              if (option) choose(option);
            } else {
              event.preventDefault();
              setOpen(true);
            }
          } else if (event.key === "Escape") {
            setOpen(false);
          }
        }}
      >
        <span className={classNames("select-value", !selected && "select-placeholder")}>
          {selected?.label ?? placeholder}
        </span>
      </button>
      <ChevronDown size={15} className="select-chevron" />
      {open
        ? createPortal(
            <div
              className="select-menu"
              role="listbox"
              aria-label={ariaLabel}
              ref={menuRef}
              style={{
                left: position.left,
                top: position.top,
                width: Math.max(180, position.width),
              }}
            >
              {options.map((option, index) => (
                <button
                  key={option.value}
                  type="button"
                  role="option"
                  aria-selected={option.value === value}
                  disabled={option.disabled}
                  className={classNames(
                    "select-option",
                    option.value === value && "is-selected",
                    index === highlighted && "is-highlighted",
                  )}
                  onMouseEnter={() => setHighlighted(index)}
                  onClick={() => choose(option)}
                >
                  <span>
                    {option.label}
                    {option.description ? (
                      <>
                        <br />
                        <small>{option.description}</small>
                      </>
                    ) : null}
                  </span>
                  {option.value === value ? <Check size={14} /> : null}
                </button>
              ))}
            </div>,
            document.body,
          )
        : null}
    </div>
  );
}
