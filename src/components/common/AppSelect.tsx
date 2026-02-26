import { Check, ChevronDown } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';

export interface AppSelectOption {
  value: string;
  label: string;
  icon?: string;
  disabled?: boolean;
}

interface AppSelectProps {
  value?: string;
  options: AppSelectOption[];
  onChange: (value: string) => void;
  placeholder?: string;
  prefix?: string;
  className?: string;
  menuClassName?: string;
  disabled?: boolean;
  variant?: 'default' | 'inline-chip';
}

export function AppSelect({
  value,
  options,
  onChange,
  placeholder = '请选择',
  prefix,
  className = '',
  menuClassName = '',
  disabled,
  variant = 'default',
}: AppSelectProps) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const selected = useMemo(() => options.find((option) => option.value === value), [options, value]);
  const triggerClassName =
    variant === 'inline-chip'
      ? 'inline-flex h-[26px] w-full items-center justify-between gap-2 rounded-md bg-gray-100/70 px-2 py-[2px] text-[12px] font-medium text-slate-600 transition-colors hover:bg-gray-200/70 focus:outline-none focus:ring-2 focus:ring-linkflow-accent/15 disabled:cursor-not-allowed disabled:opacity-50'
      : 'inline-flex h-9 w-full items-center justify-between gap-2 rounded-2xl border border-slate-300/80 bg-white px-3 text-[13px] font-semibold text-slate-700 transition-all duration-150 hover:border-slate-400 hover:bg-slate-50 focus:outline-none focus:ring-2 focus:ring-linkflow-accent/15 disabled:cursor-not-allowed disabled:opacity-50';
  const menuBaseClassName =
    variant === 'inline-chip'
      ? 'absolute right-0 top-full z-30 mt-1 min-w-48 rounded-xl border border-slate-300/80 bg-white p-1 shadow-[0_10px_24px_rgba(15,23,42,0.14)] [scrollbar-width:thin] [&::-webkit-scrollbar]:w-1.5 [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb]:bg-slate-400'
      : 'absolute right-0 top-full z-30 mt-2 min-w-48 rounded-2xl border border-slate-300/80 bg-white p-1 shadow-[0_12px_28px_rgba(15,23,42,0.18)] [scrollbar-width:thin] [&::-webkit-scrollbar]:w-1.5 [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb]:bg-slate-400';
  const iconBadgeClassName =
    variant === 'inline-chip'
      ? 'inline-flex h-4 w-4 items-center justify-center rounded bg-slate-200/90 text-[10px] text-slate-600'
      : 'inline-flex h-5 w-5 items-center justify-center rounded-md bg-slate-200 text-slate-700';

  useEffect(() => {
    if (!open) {
      return;
    }

    const onPointerDown = (event: PointerEvent) => {
      if (rootRef.current && !rootRef.current.contains(event.target as Node)) {
        setOpen(false);
      }
    };

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setOpen(false);
      }
    };

    document.addEventListener('pointerdown', onPointerDown);
    window.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('pointerdown', onPointerDown);
      window.removeEventListener('keydown', onKeyDown);
    };
  }, [open]);

  return (
    <div ref={rootRef} className={`relative ${className}`}>
      <button
        type="button"
        disabled={disabled}
        onClick={() => setOpen((prev) => !prev)}
        className={triggerClassName}
      >
        <span className="inline-flex min-w-0 items-center gap-2">
          {prefix ? <span className="shrink-0 text-slate-500">{prefix}</span> : null}
          {selected?.icon ? (
            <span className={iconBadgeClassName}>
              {selected.icon}
            </span>
          ) : null}
          <span className={`truncate ${variant === 'inline-chip' ? 'text-slate-600' : 'text-slate-800'}`}>
            {selected?.label ?? placeholder}
          </span>
        </span>
        <ChevronDown className={`shrink-0 ${variant === 'inline-chip' ? 'h-3.5 w-3.5 text-slate-400' : 'h-4 w-4 text-slate-500'}`} />
      </button>

      {open ? (
        <div className={`${menuBaseClassName} ${menuClassName}`}>
          <div className="max-h-64 overflow-y-auto">
            {options.map((option) => {
              const isSelected = option.value === value;
              return (
                <button
                  key={option.value}
                  type="button"
                  disabled={option.disabled}
                  onClick={() => {
                    onChange(option.value);
                    setOpen(false);
                  }}
                  className={`flex h-9 w-full items-center justify-between gap-2 rounded-xl px-3 text-left text-[13px] font-medium transition focus:outline-none focus:ring-2 focus:ring-linkflow-accent/15 ${
                    isSelected ? 'bg-blue-50 text-linkflow-accent' : 'text-slate-700 hover:bg-slate-100'
                  } ${option.disabled ? 'cursor-not-allowed opacity-50' : ''}`}
                >
                  <span className="inline-flex min-w-0 items-center gap-2">
                    {option.icon ? (
                      <span className="inline-flex h-5 w-5 items-center justify-center rounded-md bg-slate-200 text-slate-700">
                        {option.icon}
                      </span>
                    ) : null}
                    <span className="truncate">{option.label}</span>
                  </span>
                  {isSelected ? <Check className="h-4 w-4 text-linkflow-accent" /> : null}
                </button>
              );
            })}
          </div>
        </div>
      ) : null}
    </div>
  );
}
