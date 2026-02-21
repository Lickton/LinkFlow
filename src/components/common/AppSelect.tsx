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
}: AppSelectProps) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const selected = useMemo(() => options.find((option) => option.value === value), [options, value]);

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
        className="inline-flex h-9 w-full items-center justify-between gap-2 rounded-2xl border border-transparent bg-transparent px-3 text-[13px] font-medium text-gray-600 transition-all duration-150 hover:border-gray-200/70 hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-linkflow-accent/15 disabled:cursor-not-allowed disabled:opacity-50"
      >
        <span className="inline-flex min-w-0 items-center gap-2">
          {prefix ? <span className="shrink-0 text-gray-400">{prefix}</span> : null}
          {selected?.icon ? (
            <span className="inline-flex h-5 w-5 items-center justify-center rounded-md bg-gray-100 text-gray-600">
              {selected.icon}
            </span>
          ) : null}
          <span className="truncate text-gray-700">{selected?.label ?? placeholder}</span>
        </span>
        <ChevronDown className="h-4 w-4 shrink-0 text-gray-400" />
      </button>

      {open ? (
        <div
          className={`absolute right-0 top-full z-30 mt-2 min-w-48 rounded-2xl border border-gray-200/70 bg-white p-1 shadow-[0_8px_24px_rgba(0,0,0,0.06)] [scrollbar-width:thin] [&::-webkit-scrollbar]:w-1.5 [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb]:bg-gray-300 ${menuClassName}`}
        >
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
                    isSelected ? 'bg-gray-100 text-gray-800' : 'text-gray-700 hover:bg-gray-50'
                  } ${option.disabled ? 'cursor-not-allowed opacity-50' : ''}`}
                >
                  <span className="inline-flex min-w-0 items-center gap-2">
                    {option.icon ? (
                      <span className="inline-flex h-5 w-5 items-center justify-center rounded-md bg-gray-100 text-gray-600">
                        {option.icon}
                      </span>
                    ) : null}
                    <span className="truncate">{option.label}</span>
                  </span>
                  {isSelected ? <Check className="h-4 w-4 text-gray-500" /> : null}
                </button>
              );
            })}
          </div>
        </div>
      ) : null}
    </div>
  );
}
