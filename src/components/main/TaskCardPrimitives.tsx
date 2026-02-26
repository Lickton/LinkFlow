import { forwardRef } from 'react';
import type { ButtonHTMLAttributes, HTMLAttributes, LabelHTMLAttributes, ReactNode } from 'react';

interface TaskShellProps {
  children: ReactNode;
  className?: string;
  elevated?: boolean;
}

export const TaskShell = forwardRef<HTMLDivElement, TaskShellProps>(function TaskShell(
  { children, className = '', elevated = false },
  ref,
) {
  return (
    <div
      ref={ref}
      className={`rounded-2xl bg-white ring-1 ring-slate-200/80 ${
        elevated
          ? 'shadow-[0_14px_34px_rgba(15,23,42,0.10),0_2px_6px_rgba(15,23,42,0.06)]'
          : 'shadow-[0_6px_18px_rgba(15,23,42,0.05)]'
      } ${className}`}
    >
      {children}
    </div>
  );
});

interface TaskRoundCheckboxProps {
  checked: boolean;
  onChange: () => void;
  className?: string;
}

export function TaskRoundCheckbox({ checked, onChange, className = '' }: TaskRoundCheckboxProps) {
  return (
    <input
      type="checkbox"
      checked={checked}
      onChange={onChange}
      className={`h-[18px] w-[18px] shrink-0 appearance-none rounded-full border-2 border-slate-400/80 bg-transparent transition focus:outline-none focus:ring-2 focus:ring-slate-300/50 checked:border-slate-700 checked:bg-slate-700 ${className}`}
    />
  );
}

interface TaskNotesPanelProps {
  label?: string | null;
  children: ReactNode;
  className?: string;
}

export function TaskNotesPanel({ label = '备注', children, className = '' }: TaskNotesPanelProps) {
  return (
    <div className={`px-0 py-0 ${className}`}>
      {label ? <p className="mb-1.5 text-xs font-medium tracking-[0.02em] text-slate-400">{label}</p> : null}
      {children}
    </div>
  );
}

interface TaskMetaRowProps {
  children: ReactNode;
  className?: string;
}

export function TaskMetaRow({ children, className = '' }: TaskMetaRowProps) {
  return (
    <div className={`flex flex-wrap items-center gap-2 text-xs font-medium text-slate-400 ${className}`}>
      {children}
    </div>
  );
}

interface TaskEditorBodyProps {
  toolbar: ReactNode;
  notes: ReactNode;
  afterNotes?: ReactNode;
  className?: string;
}

export function TaskEditorBody({ toolbar, notes, afterNotes, className = '' }: TaskEditorBodyProps) {
  return (
    <div className={`mt-3 ${className}`}>
      <div className="border-t border-slate-200/80 pt-3">{toolbar}</div>
      <div className="mt-3">{notes}</div>
      {afterNotes ? <div className="mt-3">{afterNotes}</div> : null}
    </div>
  );
}

interface TaskEditorSurfaceProps {
  checkbox: ReactNode;
  title: ReactNode;
  rightAction: ReactNode;
  body: ReactNode;
  className?: string;
  elevated?: boolean;
}

export const TaskEditorSurface = forwardRef<HTMLDivElement, TaskEditorSurfaceProps>(function TaskEditorSurface(
  { checkbox, title, rightAction, body, className = '', elevated = false },
  ref,
) {
  return (
    <TaskShell ref={ref} elevated={elevated} className={`p-4 ${className}`}>
      <div className="flex items-start gap-3">
        <div className="mt-1 shrink-0">{checkbox}</div>
        <div className="min-w-0 flex-1">
          {title}
          {body}
        </div>
        <div className="flex shrink-0 items-center gap-2 pl-2">{rightAction}</div>
      </div>
    </TaskShell>
  );
});

interface TaskToolbarPillProps {
  icon?: ReactNode;
  label?: ReactNode;
  active?: boolean;
  highlight?: boolean;
  children?: ReactNode;
  className?: string;
  onClick?: () => void;
  type?: 'button' | 'div';
}

export function TaskToolbarPill({
  icon,
  label,
  active = false,
  highlight = false,
  children,
  className = '',
  onClick,
  type = 'button',
}: TaskToolbarPillProps) {
  const classes = `inline-flex h-9 items-center gap-1.5 rounded-2xl border px-3 text-xs font-semibold transition-all duration-150 ${
    highlight
      ? 'border-slate-300/80 bg-slate-100 text-slate-700 hover:bg-slate-200'
      : active
        ? 'border-blue-200 bg-blue-50 text-linkflow-accent'
        : 'border-slate-300/80 bg-white text-slate-500 hover:bg-slate-100 hover:text-slate-700'
  } ${className}`;

  if (type === 'div') {
    return (
      <div className={classes}>
        {icon}
        {label ? <span>{label}</span> : null}
        {children}
      </div>
    );
  }

  return (
    <button type="button" onClick={onClick} className={classes}>
      {icon}
      {label ? <span>{label}</span> : null}
      {children}
    </button>
  );
}

interface TaskControlPopoverProps {
  children: ReactNode;
  className?: string;
}

export function TaskControlPopover({ children, className = '' }: TaskControlPopoverProps) {
  return (
    <div
      className={`absolute left-0 top-full z-[120] mt-2 rounded-xl bg-white p-3 ring-1 ring-slate-200/80 shadow-[0_10px_24px_rgba(15,23,42,0.10)] ${className}`}
    >
      {children}
    </div>
  );
}

interface TaskAttributeTagProps {
  icon?: ReactNode;
  label?: ReactNode;
  active?: boolean;
  muted?: boolean;
  highlight?: boolean;
  children?: ReactNode;
  className?: string;
  onClick?: () => void;
  type?: 'button' | 'div';
}

export function TaskAttributeTag({
  icon,
  label,
  active = false,
  muted = false,
  highlight = false,
  children,
  className = '',
  onClick,
  type = 'button',
}: TaskAttributeTagProps) {
  const classes = `inline-flex h-7 items-center gap-1.5 rounded-full border px-2.5 text-xs font-medium transition ${
    highlight
      ? 'border-slate-300 bg-slate-100 text-slate-700 hover:bg-slate-200'
      : active
        ? 'border-slate-300 bg-slate-100 text-slate-700'
        : muted
          ? 'border-slate-200 bg-transparent text-slate-400 hover:border-slate-300 hover:text-slate-600'
          : 'border-slate-300 bg-slate-50 text-slate-600 hover:bg-slate-100'
  } ${className}`;

  if (type === 'div') {
    return (
      <div className={classes}>
        {icon}
        {label ? <span>{label}</span> : null}
        {children}
      </div>
    );
  }

  return (
    <button type="button" onClick={onClick} className={classes}>
      {icon}
      {label ? <span>{label}</span> : null}
      {children}
    </button>
  );
}

interface TaskControlInputProps {
  className?: string;
  children?: ReactNode;
}

export function TaskControlInput({ className = '', children }: TaskControlInputProps) {
  return (
    <span
      className={`inline-flex h-7 items-center rounded-lg border border-slate-200 bg-white px-2 text-xs font-medium text-slate-700 shadow-[0_1px_0_rgba(15,23,42,0.02)] ${className}`}
    >
      {children}
    </span>
  );
}

const TASK_INLINE_TOOLBAR_CHIP_BASE_CLASS =
  'inline-flex h-[26px] items-center gap-1.5 rounded-md bg-gray-100/70 px-2 py-[2px] text-[12px] font-medium text-slate-600 transition-colors';

interface TaskInlineToolbarChipProps extends HTMLAttributes<HTMLDivElement> {
  children: ReactNode;
}

export function TaskInlineToolbarChip({ children, className = '', ...props }: TaskInlineToolbarChipProps) {
  return (
    <div className={`${TASK_INLINE_TOOLBAR_CHIP_BASE_CLASS} ${className}`} {...props}>
      {children}
    </div>
  );
}

interface TaskInlineToolbarLabelChipProps extends LabelHTMLAttributes<HTMLLabelElement> {
  children: ReactNode;
}

export function TaskInlineToolbarLabelChip({
  children,
  className = '',
  ...props
}: TaskInlineToolbarLabelChipProps) {
  return (
    <label className={`${TASK_INLINE_TOOLBAR_CHIP_BASE_CLASS} ${className}`} {...props}>
      {children}
    </label>
  );
}

interface TaskInlineToolbarButtonChipProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  children: ReactNode;
}

export function TaskInlineToolbarButtonChip({
  children,
  className = '',
  type = 'button',
  ...props
}: TaskInlineToolbarButtonChipProps) {
  return (
    <button
      type={type}
      className={`${TASK_INLINE_TOOLBAR_CHIP_BASE_CLASS} hover:bg-gray-200/70 ${className}`}
      {...props}
    >
      {children}
    </button>
  );
}
