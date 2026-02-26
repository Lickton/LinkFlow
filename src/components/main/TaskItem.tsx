import { Bell, Calendar, Clock3, FileText, Link2, Repeat2, Trash2 } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { AppSelect } from '../common/AppSelect';
import type { List, RepeatType, Task, UrlScheme } from '../../types/models';
import { toRelativeReminder } from '../../utils/schedule';
import { TaskControlPopover, TaskRoundCheckbox } from './TaskCardPrimitives';

interface TaskItemProps {
  task: Task;
  isExpanded: boolean;
  lists: List[];
  actionSchemes: UrlScheme[];
  list?: List;
  showListInfo?: boolean;
  onToggleCompleted: (taskId: string) => void;
  onDeleteTask: (taskId: string) => void;
  onUpdateTask: (taskId: string, patch: Partial<Task>) => void;
  onExecuteAction: (task: Task, actionSchemeId: string) => void;
  onOpenActionPicker: (task: Task) => void;
  onToggleDetail: () => void;
}

type EditDraft = {
  title: string;
  detail: string;
  dueDate: string;
  time: string;
  reminderEnabled: boolean;
  reminderMinutes: number;
  repeatType: RepeatType | 'none';
  repeatDaysOfWeek: number[];
  repeatDaysOfMonth: number[];
};
type RepeatDraftConfig = Pick<EditDraft, 'repeatType' | 'repeatDaysOfWeek' | 'repeatDaysOfMonth'>;

const WEEK_LABELS = ['一', '二', '三', '四', '五', '六', '日'];
const QUICK_MONTH_DAYS = [1, 5, 10, 15, 20, 25, 31];

function draftFromTask(task: Task): EditDraft {
  return {
    title: task.title,
    detail: task.detail ?? '',
    dueDate: task.dueDate ?? '',
    time: task.time ?? '',
    reminderEnabled: task.reminder?.type === 'relative',
    reminderMinutes: task.reminder?.type === 'relative' ? task.reminder.offsetMinutes : 10,
    repeatType: task.repeat?.type ?? 'none',
    repeatDaysOfWeek: task.repeat?.dayOfWeek ?? [],
    repeatDaysOfMonth: task.repeat?.dayOfMonth ?? [],
  };
}

function samePatchValue(a: unknown, b: unknown): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

function getRepeatSummaryLabel(repeatType: RepeatType | 'none', weekDays: number[], monthDays: number[]): string {
  if (repeatType === 'none') {
    return '重复';
  }
  if (repeatType === 'daily') {
    return '每天';
  }
  if (repeatType === 'weekly') {
    return weekDays.length ? weekDays.map((day) => `周${WEEK_LABELS[day]}`).join('/') : '每周';
  }
  return `每月${monthDays.join('/') || '-'}号`;
}

function sanitizeNumericCommaInput(str: string): string {
  return str
    .replace(/[^0-9,]+/g, '')
    .replace(/,+/g, ',')
    .replace(/^,+|,+$/g, '');
}

function sanitizeNumericCommaInputForEditing(str: string): string {
  return str
    .replace(/[^0-9,]+/g, '')
    .replace(/,+/g, ',')
    .replace(/^,+/g, '');
}

function parseCommaInts(str: string): number[] {
  const nums = str
    .split(',')
    .map((part) => part.trim())
    .filter(Boolean)
    .map((part) => Number.parseInt(part, 10))
    .filter((n) => Number.isInteger(n));
  return Array.from(new Set(nums)).sort((a, b) => a - b);
}

function isWeeklyValueAllowed(n: number): boolean {
  return n >= 0 && n <= 7;
}

function validateMonthlyTokens(rawStr: string): { ok: boolean; values: number[] } {
  const sanitized = sanitizeNumericCommaInput(rawStr);
  const tokens = sanitized
    .split(',')
    .map((part) => part.trim())
    .filter(Boolean)
    .map((part) => Number.parseInt(part, 10))
    .filter((n) => Number.isInteger(n));

  const values = Array.from(new Set(tokens.filter((n) => n >= 1 && n <= 31))).sort((a, b) => a - b);
  const hasTokens = tokens.length > 0;
  const allInRange = hasTokens && tokens.every((n) => n >= 1 && n <= 31);
  return { ok: hasTokens && allInRange, values };
}

function getSanitizedCaretPosition(input: string, caret: number, finalSanitize: boolean): number {
  const prefix = input.slice(0, caret);
  const nextPrefix = finalSanitize ? sanitizeNumericCommaInput(prefix) : sanitizeNumericCommaInputForEditing(prefix);
  return nextPrefix.length;
}

function isAllowedNumericCommaKey(event: React.KeyboardEvent<HTMLInputElement>): boolean {
  if (
    event.metaKey ||
    event.ctrlKey ||
    event.altKey ||
    [
      'Backspace',
      'Delete',
      'ArrowLeft',
      'ArrowRight',
      'ArrowUp',
      'ArrowDown',
      'Home',
      'End',
      'Tab',
      'Enter',
      'Escape',
    ].includes(event.key)
  ) {
    return true;
  }
  return /^\d$/.test(event.key) || event.key === ',';
}

function shiftDate(value: string, deltaDays: number): string | null {
  if (!value) {
    return null;
  }
  const date = new Date(`${value}T00:00:00`);
  if (Number.isNaN(date.getTime())) {
    return null;
  }
  date.setDate(date.getDate() + deltaDays);
  return date.toISOString().slice(0, 10);
}

function daysInMonth(year: number, month1to12: number): number {
  return new Date(year, month1to12, 0).getDate();
}

function shiftDateSegment(value: string, segment: 'year' | 'month' | 'day', delta: number): string | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return null;
  }
  let [year, month, day] = value.split('-').map(Number);
  if (!year || !month || !day) {
    return null;
  }

  if (segment === 'day') {
    return shiftDate(value, delta);
  }

  if (segment === 'month') {
    const zeroBased = month - 1 + delta;
    year += Math.floor(zeroBased / 12);
    month = ((zeroBased % 12) + 12) % 12 + 1;
    day = Math.min(day, daysInMonth(year, month));
    return `${String(year).padStart(4, '0')}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
  }

  year += delta;
  day = Math.min(day, daysInMonth(year, month));
  return `${String(year).padStart(4, '0')}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

function shiftTimeSegment(value: string, segment: 'hour' | 'minute', delta: number): string | null {
  if (!/^\d{2}:\d{2}$/.test(value)) {
    return null;
  }
  const [rawH, rawM] = value.split(':').map(Number);
  if (!Number.isInteger(rawH) || !Number.isInteger(rawM)) {
    return null;
  }
  let h = rawH;
  let m = rawM;
  if (segment === 'hour') {
    h = ((h + delta) % 24 + 24) % 24;
  } else {
    m = ((m + delta) % 60 + 60) % 60;
  }
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

function getCaretSegmentForDate(input: HTMLInputElement): 'year' | 'month' | 'day' {
  try {
    const pos = input.selectionStart;
    if (pos == null) {
      return 'day';
    }
    if (pos <= 4) return 'year';
    if (pos <= 7) return 'month';
    return 'day';
  } catch {
    return 'day';
  }
}

function getCaretSegmentForTime(input: HTMLInputElement): 'hour' | 'minute' {
  try {
    const pos = input.selectionStart;
    if (pos == null) {
      return 'minute';
    }
    return pos <= 2 ? 'hour' : 'minute';
  } catch {
    return 'minute';
  }
}

function isAllowedEditorControlKey(event: React.KeyboardEvent<HTMLInputElement>): boolean {
  if (event.metaKey || event.ctrlKey || event.altKey) {
    return true;
  }
  return [
    'Tab',
    'Enter',
    'Escape',
    'Backspace',
    'Delete',
    'ArrowLeft',
    'ArrowRight',
    'ArrowUp',
    'ArrowDown',
    'Home',
    'End',
  ].includes(event.key);
}

function getStepDelta(event: React.KeyboardEvent<HTMLInputElement>): -1 | 1 | null {
  if (event.code === 'Minus' || event.code === 'NumpadSubtract') {
    return -1;
  }
  if (event.code === 'Equal' || event.code === 'NumpadAdd') {
    return 1;
  }
  if (event.key === '-') {
    return -1;
  }
  if (event.key === '=' || event.key === '+') {
    return 1;
  }
  return null;
}

export function TaskItem({
  task,
  isExpanded,
  lists,
  actionSchemes,
  onToggleCompleted,
  onDeleteTask,
  onUpdateTask,
  onExecuteAction,
  onOpenActionPicker,
  onToggleDetail,
}: TaskItemProps) {
  const [draft, setDraft] = useState<EditDraft>(() => draftFromTask(task));
  const draftRef = useRef<EditDraft>(draftFromTask(task));
  const [activePanel, setActivePanel] = useState<'repeat' | null>(null);
  const [isDetailEditing, setIsDetailEditing] = useState(false);
  const [selectedListId, setSelectedListId] = useState<string>(task.listId ?? '__none__');
  const [weeklyRepeatInput, setWeeklyRepeatInput] = useState('');
  const [monthlyRepeatInput, setMonthlyRepeatInput] = useState('');
  const [monthlyRepeatInputError, setMonthlyRepeatInputError] = useState<string | null>(null);
  const [shouldRenderExpanded, setShouldRenderExpanded] = useState(isExpanded);
  const [expandedVisible, setExpandedVisible] = useState(isExpanded);
  const wasExpandedRef = useRef(isExpanded);
  const lastEnabledRepeatRef = useRef<RepeatDraftConfig>(
    task.repeat
      ? {
          repeatType: task.repeat.type,
          repeatDaysOfWeek: task.repeat.dayOfWeek ?? [],
          repeatDaysOfMonth: task.repeat.dayOfMonth ?? [],
        }
      : {
          repeatType: 'daily',
          repeatDaysOfWeek: [],
          repeatDaysOfMonth: [],
        },
  );
  const detailTextareaRef = useRef<HTMLTextAreaElement>(null);
  const weeklyInputRef = useRef<HTMLInputElement>(null);
  const monthlyInputRef = useRef<HTMLInputElement>(null);
  const weeklyComposingRef = useRef(false);
  const monthlyComposingRef = useRef(false);
  const hasDetail = Boolean(task.detail?.trim());
  const hasDraftDetail = Boolean(draft.detail.trim());
  const taskActions = task.actions ?? [];
  const hasActionBinding = taskActions.length > 0;
  const unavailableActionCount = taskActions.filter(
    (action) => !actionSchemes.some((scheme) => scheme.id === action.schemeId),
  ).length;

  useEffect(() => {
    draftRef.current = draft;
    if (draft.repeatType !== 'none') {
      lastEnabledRepeatRef.current = {
        repeatType: draft.repeatType,
        repeatDaysOfWeek: draft.repeatDaysOfWeek,
        repeatDaysOfMonth: draft.repeatDaysOfMonth,
      };
    }
  }, [draft]);

  useEffect(() => {
    if (!weeklyComposingRef.current) {
      setWeeklyRepeatInput([...new Set(draft.repeatDaysOfWeek.filter(isWeeklyValueAllowed))].sort((a, b) => a - b).join(','));
    }
  }, [draft.repeatDaysOfWeek]);

  useEffect(() => {
    if (!monthlyComposingRef.current) {
      setMonthlyRepeatInput([...new Set(draft.repeatDaysOfMonth.filter((n) => n >= 1 && n <= 31))].sort((a, b) => a - b).join(','));
      setMonthlyRepeatInputError(null);
    }
  }, [draft.repeatDaysOfMonth]);

  useEffect(() => {
    if (isExpanded) {
      const nextDraft = draftFromTask(task);
      draftRef.current = nextDraft;
      setDraft(nextDraft);
      const nextListValue = task.listId ?? '__none__';
      setSelectedListId(nextListValue);
      setWeeklyRepeatInput(
        [...new Set(nextDraft.repeatDaysOfWeek.filter(isWeeklyValueAllowed))].sort((a, b) => a - b).join(','),
      );
      setMonthlyRepeatInput(
        [...new Set(nextDraft.repeatDaysOfMonth.filter((n) => n >= 1 && n <= 31))].sort((a, b) => a - b).join(','),
      );
      setMonthlyRepeatInputError(null);
      if (nextDraft.repeatType !== 'none') {
        lastEnabledRepeatRef.current = {
          repeatType: nextDraft.repeatType,
          repeatDaysOfWeek: nextDraft.repeatDaysOfWeek,
          repeatDaysOfMonth: nextDraft.repeatDaysOfMonth,
        };
      }
    }
  }, [isExpanded, task.listId]);

  useEffect(() => {
    if (!isExpanded) {
      setActivePanel(null);
      setIsDetailEditing(false);
      setMonthlyRepeatInputError(null);
    }
  }, [isExpanded]);

  useEffect(() => {
    let timeoutId: number | null = null;
    let rafId: number | null = null;

    if (isExpanded) {
      setShouldRenderExpanded(true);
      rafId = window.requestAnimationFrame(() => setExpandedVisible(true));
    } else if (shouldRenderExpanded) {
      setExpandedVisible(false);
      timeoutId = window.setTimeout(() => setShouldRenderExpanded(false), 200);
    }

    return () => {
      if (timeoutId !== null) window.clearTimeout(timeoutId);
      if (rafId !== null) window.cancelAnimationFrame(rafId);
    };
  }, [isExpanded, shouldRenderExpanded]);

  useEffect(() => {
    if (isDetailEditing) {
      requestAnimationFrame(() => detailTextareaRef.current?.focus());
    }
  }, [isDetailEditing]);

  const flushDraftToTask = () => {
    const currentDraft = draftRef.current;
    const nextTitle = currentDraft.title.trim() || task.title;
    const nextDetail = currentDraft.detail.trim() || undefined;
    const nextDueDate = currentDraft.dueDate || null;
    const nextTime = currentDraft.time || null;
    const nextReminder = currentDraft.reminderEnabled ? toRelativeReminder(currentDraft.reminderMinutes) : null;
    const nextRepeat =
      currentDraft.repeatType === 'none'
        ? null
        : {
            type: currentDraft.repeatType,
            ...(currentDraft.repeatType === 'weekly' ? { dayOfWeek: currentDraft.repeatDaysOfWeek } : {}),
            ...(currentDraft.repeatType === 'monthly' ? { dayOfMonth: currentDraft.repeatDaysOfMonth } : {}),
          };

    commitPatch({
      title: nextTitle,
      detail: nextDetail,
      dueDate: nextDueDate,
      time: nextTime,
      reminder: nextReminder,
      repeat: nextRepeat,
    });
  };

  useEffect(() => {
    const wasExpanded = wasExpandedRef.current;
    if (wasExpanded && !isExpanded) {
      flushDraftToTask();
    }
    wasExpandedRef.current = isExpanded;
  }, [isExpanded, draft, task]);

  const commitPatch = (patch: Partial<Task>) => {
    const taskRecord = task as unknown as Record<string, unknown>;
    const filtered = Object.fromEntries(
      Object.entries(patch).filter(([key, value]) => !samePatchValue(taskRecord[key], value)),
    ) as Partial<Task>;

    if (Object.keys(filtered).length === 0) {
      return;
    }

    onUpdateTask(task.id, filtered);
  };

  const stopRowToggle = (event: React.MouseEvent | React.FocusEvent) => {
    event.stopPropagation();
  };

  const withStepKeys =
    (kind: 'date' | 'time' | 'reminder') => (event: React.KeyboardEvent<HTMLInputElement>) => {
      const delta = getStepDelta(event);
      if (delta == null) {
        return;
      }
      event.preventDefault();
      event.stopPropagation();

      if (kind === 'date') {
        const next = shiftDateSegment(draft.dueDate, getCaretSegmentForDate(event.currentTarget), delta);
        if (!next) return;
        setDraft((prev) => ({ ...prev, dueDate: next }));
        commitPatch({ dueDate: next });
        return;
      }

      if (kind === 'time') {
        const base = draft.time || '09:00';
        const next = shiftTimeSegment(base, getCaretSegmentForTime(event.currentTarget), delta);
        if (!next) return;
        setDraft((prev) => ({ ...prev, time: next }));
        commitPatch({ time: next });
        return;
      }

      const currentDraft = draftRef.current;
      const nextMinutes = Math.max(0, currentDraft.reminderMinutes + delta);
      const nextDraft = {
        ...currentDraft,
        reminderMinutes: nextMinutes,
        reminderEnabled: true,
      };
      draftRef.current = nextDraft;
      setDraft(nextDraft);
      commitPatch({ reminder: toRelativeReminder(nextMinutes) });
    };

  const restrictInlineMetaInputKeys = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (isAllowedEditorControlKey(event)) {
      return;
    }

    if (/^\d$/.test(event.key)) {
      return;
    }

    // `-`, `=`, `+` are reserved for decrement/increment shortcuts.
    if (getStepDelta(event) != null) {
      return;
    }

    event.preventDefault();
    event.stopPropagation();
  };

  const withRestrictedStepKeys =
    (kind: 'date' | 'time' | 'reminder') => (event: React.KeyboardEvent<HTMLInputElement>) => {
      withStepKeys(kind)(event);
      if (!event.defaultPrevented) {
        restrictInlineMetaInputKeys(event);
      }
    };

  const applyRepeatDraft = (next: Pick<EditDraft, 'repeatType' | 'repeatDaysOfWeek' | 'repeatDaysOfMonth'>) => {
    setDraft((prev) => ({ ...prev, ...next }));
    if (next.repeatType === 'none') {
      commitPatch({ repeat: null });
      return;
    }
    commitPatch({
      repeat: {
        type: next.repeatType,
        ...(next.repeatType === 'weekly' ? { dayOfWeek: next.repeatDaysOfWeek } : {}),
        ...(next.repeatType === 'monthly' ? { dayOfMonth: next.repeatDaysOfMonth } : {}),
      },
    });
  };

  const toggleRepeatEnabled = () => {
    const currentDraft = draftRef.current;
    if (currentDraft.repeatType === 'none') {
      const restore = lastEnabledRepeatRef.current;
      applyRepeatDraft({
        repeatType: restore.repeatType === 'none' ? 'daily' : restore.repeatType,
        repeatDaysOfWeek: restore.repeatDaysOfWeek,
        repeatDaysOfMonth: restore.repeatDaysOfMonth,
      });
      return;
    }

    lastEnabledRepeatRef.current = {
      repeatType: currentDraft.repeatType,
      repeatDaysOfWeek: currentDraft.repeatDaysOfWeek,
      repeatDaysOfMonth: currentDraft.repeatDaysOfMonth,
    };
    setActivePanel(null);
    applyRepeatDraft({
      repeatType: 'none',
      repeatDaysOfWeek: currentDraft.repeatDaysOfWeek,
      repeatDaysOfMonth: currentDraft.repeatDaysOfMonth,
    });
  };

  const applyInputCaret = (input: HTMLInputElement | null, pos: number) => {
    if (!input) {
      return;
    }
    requestAnimationFrame(() => {
      input.setSelectionRange(pos, pos);
    });
  };

  const commitWeeklyInput = () => {
    const cleaned = sanitizeNumericCommaInput(weeklyRepeatInput);
    const parsed = parseCommaInts(cleaned).filter(isWeeklyValueAllowed);
    const canonical = parsed.join(',');
    setWeeklyRepeatInput(canonical);
    applyRepeatDraft({
      repeatType: 'weekly',
      repeatDaysOfWeek: parsed,
      repeatDaysOfMonth: draftRef.current.repeatDaysOfMonth,
    });
  };

  const handleWeeklyInputChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    if (weeklyComposingRef.current) {
      setWeeklyRepeatInput(event.target.value);
      return;
    }
    const raw = event.target.value;
    const caret = event.target.selectionStart ?? raw.length;
    const next = sanitizeNumericCommaInputForEditing(raw);
    setWeeklyRepeatInput(next);
    if (next !== raw) {
      applyInputCaret(weeklyInputRef.current, getSanitizedCaretPosition(raw, caret, false));
    }

    const parsed = parseCommaInts(next).filter(isWeeklyValueAllowed);
    applyRepeatDraft({
      repeatType: 'weekly',
      repeatDaysOfWeek: parsed,
      repeatDaysOfMonth: draftRef.current.repeatDaysOfMonth,
    });
  };

  const computeMonthlyError = (raw: string): string | null => {
    const cleaned = sanitizeNumericCommaInput(raw);
    return validateMonthlyTokens(cleaned).ok ? null : '仅支持 1–31 的日期（用英文逗号分隔）';
  };

  const commitMonthlyInput = (): boolean => {
    const cleaned = sanitizeNumericCommaInput(monthlyRepeatInput);
    const result = validateMonthlyTokens(cleaned);
    setMonthlyRepeatInput(cleaned);
    if (!result.ok) {
      setMonthlyRepeatInputError('仅支持 1–31 的日期（用英文逗号分隔）');
      return false;
    }
    const canonical = result.values.join(',');
    setMonthlyRepeatInput(canonical);
    setMonthlyRepeatInputError(null);
    applyRepeatDraft({
      repeatType: 'monthly',
      repeatDaysOfWeek: draftRef.current.repeatDaysOfWeek,
      repeatDaysOfMonth: result.values,
    });
    return true;
  };

  const handleMonthlyInputChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    if (monthlyComposingRef.current) {
      setMonthlyRepeatInput(event.target.value);
      return;
    }
    const raw = event.target.value;
    const caret = event.target.selectionStart ?? raw.length;
    const next = sanitizeNumericCommaInputForEditing(raw);
    setMonthlyRepeatInput(next);
    setMonthlyRepeatInputError(computeMonthlyError(next));
    if (next !== raw) {
      applyInputCaret(monthlyInputRef.current, getSanitizedCaretPosition(raw, caret, false));
    }
  };

  const setTaskList = (nextListId: string | undefined) => {
    const normalized = nextListId ?? '__none__';
    setSelectedListId(normalized);
    commitPatch({ listId: nextListId });
  };

  if (!isExpanded) {
    return (
      <article
        data-task-item-id={task.id}
        onClick={onToggleDetail}
        className="group flex h-11 cursor-default items-center gap-3 rounded-xl px-3 transition hover:bg-white/70"
      >
        <div
          onClick={(event) => {
            event.stopPropagation();
          }}
        >
          <TaskRoundCheckbox checked={task.completed} onChange={() => onToggleCompleted(task.id)} />
        </div>

        <div className="min-w-0 flex-1">
          <div className="flex min-w-0 items-center gap-1.5">
            <p className="truncate text-[15px] font-medium tracking-[0.01em] text-slate-900">{task.title}</p>
            {hasDetail ? <FileText size={13} className="shrink-0 text-slate-400" /> : null}
          </div>
        </div>

        <button
          type="button"
          onClick={(event) => {
            event.stopPropagation();
            onDeleteTask(task.id);
          }}
          className="rounded-lg p-1.5 text-slate-400 opacity-0 transition group-hover:opacity-100 hover:bg-red-100 hover:text-red-600 focus:opacity-100"
          title="删除任务"
        >
          <Trash2 size={14} />
        </button>
      </article>
    );
  }

  const rowTagBase =
    'inline-flex h-[26px] items-center gap-1.5 rounded-md bg-gray-100/70 px-2 py-[2px] text-[12px] font-medium text-slate-600 transition-colors';
  const rowTagInteractive = `${rowTagBase} hover:bg-gray-200/70`;
  const canUseReminder = Boolean(draft.dueDate && draft.time);
  const listSelectOptions = lists.map((item) => ({
    value: item.id,
    label: item.name,
    icon: item.icon,
  }));
  const repeatEnabled = draft.repeatType !== 'none';
  return (
    <article
      data-task-item-id={task.id}
      className="group rounded-lg transition-[background-color] duration-[200ms] ease-[cubic-bezier(0.25,0.8,0.25,1)] hover:bg-gray-50/60"
    >
      <div className="flex min-h-11 items-start gap-3 px-3 py-2">
        <div
          className="mt-1 shrink-0"
          onClick={(event) => {
            event.stopPropagation();
          }}
        >
          <TaskRoundCheckbox checked={task.completed} onChange={() => onToggleCompleted(task.id)} />
        </div>

        <div className="min-w-0 flex-1">
          <input
            value={draft.title}
            onChange={(event) => setDraft((prev) => ({ ...prev, title: event.target.value }))}
            onBlur={() => {
              const title = draft.title.trim() || task.title;
              if (title !== task.title) commitPatch({ title });
            }}
            onClick={stopRowToggle}
            className="w-full bg-transparent py-0.5 text-[15px] font-semibold tracking-[0.01em] text-slate-900 outline-none"
          />

          <div
            className={`grid transition-[grid-template-rows,opacity,margin] duration-[200ms] ease-[cubic-bezier(0.25,0.8,0.25,1)] ${
              expandedVisible ? 'mt-2 grid-rows-[1fr] opacity-100' : 'mt-0 grid-rows-[0fr] opacity-0'
            }`}
          >
            <div className="min-h-0 overflow-hidden">
              <div className="space-y-2.5 pb-1" onClick={stopRowToggle}>
                <div className="flex flex-wrap items-center gap-1.5">
                  <label className={rowTagBase}>
                    <Calendar size={13} className="text-slate-400" />
                    <input
                      type="date"
                      value={draft.dueDate}
                      onChange={(event) => setDraft((prev) => ({ ...prev, dueDate: event.target.value }))}
                      onKeyDown={withRestrictedStepKeys('date')}
                      onPaste={(event) => event.preventDefault()}
                      onBlur={() => commitPatch({ dueDate: draft.dueDate || null })}
                      className={`min-w-0 bg-transparent text-[12px] font-medium outline-none ${
                        draft.dueDate ? 'text-slate-600' : 'text-slate-500'
                      }`}
                    />
                  </label>

                  <label className={rowTagBase}>
                    <Clock3 size={13} className="text-slate-400" />
                    <input
                      type="time"
                      value={draft.time}
                      onChange={(event) => setDraft((prev) => ({ ...prev, time: event.target.value }))}
                      onKeyDown={withRestrictedStepKeys('time')}
                      onPaste={(event) => event.preventDefault()}
                      onBlur={() => commitPatch({ time: draft.time || null })}
                      className={`w-[62px] bg-transparent text-[12px] font-medium outline-none ${
                        draft.time ? 'text-slate-600' : 'text-slate-500'
                      }`}
                    />
                  </label>

                  <div className={`${rowTagBase} ${!canUseReminder && !draft.reminderEnabled ? 'opacity-70' : ''}`}>
                      <button
                        type="button"
                        onClick={() => {
                          if (!canUseReminder && !draftRef.current.reminderEnabled) {
                            return;
                          }
                          const nextEnabled = !draftRef.current.reminderEnabled;
                          const nextDraft = { ...draftRef.current, reminderEnabled: nextEnabled };
                          draftRef.current = nextDraft;
                          setDraft(nextDraft);
                          commitPatch({
                            reminder: nextEnabled ? toRelativeReminder(nextDraft.reminderMinutes) : null,
                          });
                        }}
                        className={`rounded-sm p-0.5 transition ${
                          draft.reminderEnabled
                            ? 'bg-amber-100 text-amber-600 hover:bg-amber-200/80'
                            : 'text-slate-400 hover:bg-white/70'
                        }`}
                        disabled={!canUseReminder && !draft.reminderEnabled}
                        aria-label={draft.reminderEnabled ? '关闭提醒' : '开启提醒'}
                        title={draft.reminderEnabled ? '关闭提醒' : '开启提醒'}
                      >
                        <Bell size={13} className={draft.reminderEnabled ? 'text-amber-600' : 'text-slate-400'} />
                      </button>
                      <span>提前</span>
                      <input
                        type="text"
                        inputMode="numeric"
                        value={draft.reminderMinutes}
                        disabled={!draft.reminderEnabled}
                        onChange={(event) =>
                          setDraft((prev) => {
                            const digitsOnly = event.target.value.replace(/\D+/g, '');
                            return {
                              ...prev,
                              reminderMinutes: digitsOnly ? Math.max(0, Number(digitsOnly)) : 0,
                            };
                          })
                        }
                        onKeyDown={withRestrictedStepKeys('reminder')}
                        onPaste={(event) => event.preventDefault()}
                        onBlur={() => {
                          if (!draftRef.current.reminderEnabled) {
                            return;
                          }
                          commitPatch({ reminder: toRelativeReminder(draftRef.current.reminderMinutes) });
                        }}
                        className={`w-9 bg-transparent text-[12px] font-medium outline-none ${
                          draft.reminderEnabled ? 'text-slate-600' : 'cursor-not-allowed text-slate-400'
                        }`}
                      />
                      <span className={draft.reminderEnabled ? '' : 'text-slate-400'}>分钟</span>
                  </div>

                  <div className="relative">
                    <div className={rowTagBase}>
                      <button
                        type="button"
                        onClick={() => toggleRepeatEnabled()}
                        className={`inline-flex h-5 w-5 items-center justify-center rounded-sm transition ${
                          repeatEnabled ? 'bg-amber-100 text-amber-600 hover:bg-amber-200/80' : 'bg-white text-slate-400 hover:bg-slate-50'
                        }`}
                        aria-label={repeatEnabled ? '关闭重复' : '开启重复'}
                        title={repeatEnabled ? '关闭重复' : '开启重复'}
                      >
                        <Repeat2 size={12} />
                      </button>
                      <button
                        type="button"
                        disabled={!repeatEnabled}
                        onClick={() => {
                          if (!repeatEnabled) {
                            return;
                          }
                          setActivePanel((prev) => (prev === 'repeat' ? null : 'repeat'));
                        }}
                        className={`inline-flex items-center gap-1 rounded-sm px-0.5 transition ${
                          repeatEnabled
                            ? 'text-slate-600 hover:text-slate-800'
                            : 'cursor-default text-slate-400'
                        }`}
                      >
                        <span>{getRepeatSummaryLabel(draft.repeatType, draft.repeatDaysOfWeek, draft.repeatDaysOfMonth)}</span>
                      </button>
                    </div>
                    {activePanel === 'repeat' ? (
                      <TaskControlPopover className="w-[300px]">
                        <div onClick={stopRowToggle} className="space-y-2">
                          <div className="flex flex-wrap items-center gap-1.5">
                            {([
                              { value: 'daily', label: '每天' },
                              { value: 'weekly', label: '每周' },
                              { value: 'monthly', label: '每月' },
                            ] as const).map((option) => {
                              const isActive = draft.repeatType === option.value;
                              return (
                                <button
                                  key={option.value}
                                  type="button"
                                  onClick={() =>
                                    applyRepeatDraft({
                                      repeatType: option.value,
                                      repeatDaysOfWeek: draft.repeatDaysOfWeek,
                                      repeatDaysOfMonth: draft.repeatDaysOfMonth,
                                    })
                                  }
                                  className={`rounded-md px-2.5 py-1 text-xs font-medium transition ${
                                    isActive
                                      ? 'bg-slate-100 text-slate-700 ring-1 ring-slate-200/80'
                                      : 'text-slate-500 hover:bg-slate-100 hover:text-slate-700'
                                  }`}
                                >
                                  {option.label}
                                </button>
                              );
                            })}
                          </div>
                          {draft.repeatType === 'weekly' ? (
                            <div className="space-y-2">
                              <div className="flex flex-wrap gap-1">
                                {WEEK_LABELS.map((label, day) => {
                                  const active = draft.repeatDaysOfWeek.includes(day);
                                  return (
                                    <button
                                      key={label}
                                      type="button"
                                      onClick={() => {
                                        const next = active
                                          ? draft.repeatDaysOfWeek.filter((item) => item !== day)
                                          : [...draft.repeatDaysOfWeek, day];
                                        const canonical = [...new Set(next.filter(isWeeklyValueAllowed))]
                                          .sort((a, b) => a - b)
                                          .join(',');
                                        setWeeklyRepeatInput(canonical);
                                        applyRepeatDraft({
                                          repeatType: 'weekly',
                                          repeatDaysOfWeek: next,
                                          repeatDaysOfMonth: draft.repeatDaysOfMonth,
                                        });
                                      }}
                                      className={`rounded-md px-2 py-1 text-xs ${active ? 'bg-slate-700 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}
                                    >
                                      周{label}
                                    </button>
                                  );
                                })}
                              </div>
                              <input
                                ref={weeklyInputRef}
                                value={weeklyRepeatInput}
                                placeholder="0,2,5"
                                inputMode="numeric"
                                onChange={handleWeeklyInputChange}
                                onKeyDown={(event) => {
                                  if (!isAllowedNumericCommaKey(event)) {
                                    event.preventDefault();
                                    event.stopPropagation();
                                    return;
                                  }
                                  if (event.key === 'Enter') {
                                    event.preventDefault();
                                    commitWeeklyInput();
                                    event.currentTarget.blur();
                                  }
                                }}
                                onPaste={(event) => {
                                  event.preventDefault();
                                  const raw = event.clipboardData.getData('text');
                                  const cleanedPaste = sanitizeNumericCommaInputForEditing(raw);
                                  const input = event.currentTarget;
                                  const current = weeklyRepeatInput;
                                  const start = input.selectionStart ?? current.length;
                                  const end = input.selectionEnd ?? current.length;
                                  const nextRaw = `${current.slice(0, start)}${cleanedPaste}${current.slice(end)}`;
                                  const nextValue = sanitizeNumericCommaInputForEditing(nextRaw);
                                  setWeeklyRepeatInput(nextValue);
                                  applyInputCaret(
                                    weeklyInputRef.current,
                                    getSanitizedCaretPosition(nextRaw, start + cleanedPaste.length, false),
                                  );
                                  const parsed = parseCommaInts(nextValue).filter(isWeeklyValueAllowed);
                                  applyRepeatDraft({
                                    repeatType: 'weekly',
                                    repeatDaysOfWeek: parsed,
                                    repeatDaysOfMonth: draftRef.current.repeatDaysOfMonth,
                                  });
                                }}
                                onCompositionStart={() => {
                                  weeklyComposingRef.current = true;
                                }}
                                onCompositionEnd={(event) => {
                                  weeklyComposingRef.current = false;
                                  const raw = event.currentTarget.value;
                                  const caret = event.currentTarget.selectionStart ?? raw.length;
                                  const next = sanitizeNumericCommaInput(raw);
                                  setWeeklyRepeatInput(next);
                                  applyInputCaret(weeklyInputRef.current, getSanitizedCaretPosition(raw, caret, true));
                                  const parsed = parseCommaInts(next).filter(isWeeklyValueAllowed);
                                  applyRepeatDraft({
                                    repeatType: 'weekly',
                                    repeatDaysOfWeek: parsed,
                                    repeatDaysOfMonth: draftRef.current.repeatDaysOfMonth,
                                  });
                                }}
                                onBlur={commitWeeklyInput}
                                className="w-full rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-xs text-slate-700 outline-none focus:ring-1 focus:ring-slate-300/70"
                              />
                            </div>
                          ) : null}
                          {draft.repeatType === 'monthly' ? (
                            <div className="space-y-2">
                              <div className="flex flex-wrap gap-1">
                                {QUICK_MONTH_DAYS.map((day) => {
                                  const active = draft.repeatDaysOfMonth.includes(day);
                                  return (
                                    <button
                                      key={day}
                                      type="button"
                                      onClick={() => {
                                        const next = active
                                          ? draft.repeatDaysOfMonth.filter((item) => item !== day)
                                          : [...draft.repeatDaysOfMonth, day];
                                        const canonical = [...new Set(next.filter((n) => n >= 1 && n <= 31))]
                                          .sort((a, b) => a - b)
                                          .join(',');
                                        setMonthlyRepeatInput(canonical);
                                        setMonthlyRepeatInputError(null);
                                        applyRepeatDraft({
                                          repeatType: 'monthly',
                                          repeatDaysOfWeek: draft.repeatDaysOfWeek,
                                          repeatDaysOfMonth: next,
                                        });
                                      }}
                                      className={`rounded-md px-2 py-1 text-xs ${active ? 'bg-slate-700 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}
                                    >
                                      {day}号
                                    </button>
                                  );
                                })}
                              </div>
                              <div>
                                <input
                                  ref={monthlyInputRef}
                                  value={monthlyRepeatInput}
                                  placeholder="1,15,28"
                                  inputMode="numeric"
                                  onChange={handleMonthlyInputChange}
                                  onKeyDown={(event) => {
                                    if (!isAllowedNumericCommaKey(event)) {
                                      event.preventDefault();
                                      event.stopPropagation();
                                      return;
                                    }
                                    if (event.key === 'Enter') {
                                      event.preventDefault();
                                      const ok = commitMonthlyInput();
                                      if (ok) {
                                        event.currentTarget.blur();
                                      }
                                    }
                                  }}
                                  onPaste={(event) => {
                                    event.preventDefault();
                                    const raw = event.clipboardData.getData('text');
                                    const cleanedPaste = sanitizeNumericCommaInputForEditing(raw);
                                    const input = event.currentTarget;
                                    const current = monthlyRepeatInput;
                                    const start = input.selectionStart ?? current.length;
                                    const end = input.selectionEnd ?? current.length;
                                    const nextRaw = `${current.slice(0, start)}${cleanedPaste}${current.slice(end)}`;
                                    const nextValue = sanitizeNumericCommaInputForEditing(nextRaw);
                                    setMonthlyRepeatInput(nextValue);
                                    setMonthlyRepeatInputError(computeMonthlyError(nextValue));
                                    applyInputCaret(
                                      monthlyInputRef.current,
                                      getSanitizedCaretPosition(nextRaw, start + cleanedPaste.length, false),
                                    );
                                  }}
                                  onCompositionStart={() => {
                                    monthlyComposingRef.current = true;
                                  }}
                                  onCompositionEnd={(event) => {
                                    monthlyComposingRef.current = false;
                                    const raw = event.currentTarget.value;
                                    const caret = event.currentTarget.selectionStart ?? raw.length;
                                    const next = sanitizeNumericCommaInput(raw);
                                    setMonthlyRepeatInput(next);
                                    setMonthlyRepeatInputError(computeMonthlyError(next));
                                    applyInputCaret(monthlyInputRef.current, getSanitizedCaretPosition(raw, caret, true));
                                  }}
                                  onBlur={commitMonthlyInput}
                                  className={`w-full rounded-lg border bg-white px-2 py-1.5 text-xs text-slate-700 outline-none focus:ring-1 ${
                                    monthlyRepeatInputError
                                      ? 'border-red-300 ring-1 ring-red-400/60 focus:ring-red-400/60'
                                      : 'border-slate-200 focus:ring-slate-300/70'
                                  }`}
                                />
                                {monthlyRepeatInputError ? (
                                  <p className="mt-1 text-xs text-red-600">仅支持 1–31 的日期（用英文逗号分隔）</p>
                                ) : null}
                              </div>
                            </div>
                          ) : null}
                        </div>
                      </TaskControlPopover>
                    ) : null}
                  </div>

                  <button type="button" onClick={() => onOpenActionPicker(task)} className={rowTagInteractive}>
                    <Link2 size={13} className="text-slate-400" />
                    <span>动作</span>
                  </button>

                  <div className="ml-auto flex min-w-0 items-center gap-1.5">
                    <AppSelect
                      value={selectedListId}
                      onChange={(value) => setTaskList(value === '__none__' ? undefined : value)}
                      options={[{ value: '__none__', label: '无', icon: '∅' }, ...listSelectOptions]}
                      variant="inline-chip"
                      className="w-[150px] min-w-0"
                      menuClassName="min-w-[180px]"
                    />
                  </div>
                </div>

                <div className="px-0.5 py-0.5">
                  {isDetailEditing ? (
                    <textarea
                      ref={detailTextareaRef}
                      value={draft.detail}
                      onChange={(event) => setDraft((prev) => ({ ...prev, detail: event.target.value }))}
                      onBlur={() => {
                        const normalized = draft.detail.trim();
                        commitPatch({ detail: normalized || undefined });
                        setIsDetailEditing(false);
                      }}
                      rows={Math.max(2, Math.min(6, (draft.detail.match(/\n/g)?.length ?? 0) + 2))}
                      className="w-full resize-none bg-transparent px-0 py-0 text-[13px] leading-6 text-slate-600 outline-none"
                      placeholder="备注"
                    />
                  ) : hasDraftDetail ? (
                    <button
                      type="button"
                      onClick={() => setIsDetailEditing(true)}
                      className="block w-full text-left"
                    >
                      <p className="whitespace-pre-wrap text-[13px] leading-6 text-slate-600">{draft.detail}</p>
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={() => setIsDetailEditing(true)}
                      className="block w-full text-left"
                    >
                      <span className="text-[13px] text-slate-400 opacity-100 transition-opacity duration-150">
                        备注
                      </span>
                    </button>
                  )}
                </div>

                {hasActionBinding ? (
                  <div className="flex flex-wrap items-center gap-1.5 pt-0.5">
                    {actionSchemes.map((scheme) => {
                      const actionLabel = `${scheme.icon} ${scheme.name}`;
                      return (
                        <button
                          key={scheme.id}
                          type="button"
                          onClick={() => onExecuteAction(task, scheme.id)}
                          className={`${rowTagInteractive} max-w-44 truncate`}
                          title={actionLabel}
                        >
                          {actionLabel}
                        </button>
                      );
                    })}
                    {unavailableActionCount > 0 ? (
                      <span className={rowTagBase}>{unavailableActionCount} 个动作不可用</span>
                    ) : null}
                  </div>
                ) : null}
              </div>
            </div>
          </div>
        </div>

        <button
          type="button"
          onClick={(event) => {
            event.stopPropagation();
            onDeleteTask(task.id);
          }}
          className="mt-0.5 rounded-md p-1.5 text-slate-400 transition-colors duration-150 hover:bg-red-100 hover:text-red-600"
          title="删除任务"
        >
          <Trash2 size={15} />
        </button>
      </div>
    </article>
  );
}
