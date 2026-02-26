import { Bell, Calendar, Check, ChevronDown, Clock3, Link2, List as ListIcon, Repeat2 } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import type { RepeatType, TaskReminder } from '../../types/models';
import { toRelativeReminder } from '../../utils/schedule';
import { TaskControlPopover, TaskInlineToolbarButtonChip, TaskInlineToolbarChip } from './TaskCardPrimitives';
import { toggleNumberSelection } from './taskScheduleShared';

type ToolbarMode = 'create' | 'edit';

type RepeatValue = RepeatType | 'none';

interface ActionChipItem {
  key: string;
  label: string;
  onClick?: () => void;
  title?: string;
}

interface ListOption {
  value: string;
  label: string;
}

interface TaskScheduleToolbarProps {
  mode: ToolbarMode;
  dueDate: string | null;
  time: string | null;
  reminder: TaskReminder;
  repeatType: RepeatValue;
  repeatDaysOfWeek: number[];
  repeatDaysOfMonth: number[];
  actionChips?: ActionChipItem[];
  unavailableActionsLabel?: string | null;
  showListPicker?: boolean;
  listOptions?: ListOption[];
  selectedListValue?: string;
  onSelectedListChange?: (value: string | null) => void;
  onDueDateChange: (value: string | null) => void;
  onTimeChange: (value: string | null) => void;
  onReminderChange: (value: TaskReminder) => void;
  onBeforeOpenReminder?: () => Promise<boolean> | boolean;
  onRepeatTypeChange: (value: RepeatValue) => void;
  onToggleRepeatWeekDay: (value: number) => void;
  onSetRepeatMonthDays: (value: number[]) => void;
  onOpenActionPicker: () => void;
  onPanelOpenChange?: (open: boolean) => void;
}

const WEEK_LABELS = ['一', '二', '三', '四', '五', '六', '日'];
const QUICK_MONTH_DAYS = [1, 5, 10, 15, 20, 25, 31];

function todayDateString() {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function shiftDate(value: string, deltaDays: number): string | null {
  if (!value) return null;
  const date = new Date(`${value}T00:00:00`);
  if (Number.isNaN(date.getTime())) return null;
  date.setDate(date.getDate() + deltaDays);
  return date.toISOString().slice(0, 10);
}

function daysInMonth(year: number, month1to12: number): number {
  return new Date(year, month1to12, 0).getDate();
}

function shiftDateSegment(value: string, segment: 'year' | 'month' | 'day', delta: number): string | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  let [year, month, day] = value.split('-').map(Number);
  if (!year || !month || !day) return null;
  if (segment === 'day') return shiftDate(value, delta);
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
  if (!/^\d{2}:\d{2}$/.test(value)) return null;
  const [rawH, rawM] = value.split(':').map(Number);
  if (!Number.isInteger(rawH) || !Number.isInteger(rawM)) return null;
  let h = rawH;
  let m = rawM;
  if (segment === 'hour') h = ((h + delta) % 24 + 24) % 24;
  else m = ((m + delta) % 60 + 60) % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

function getCaretSegmentForDate(input: HTMLInputElement): 'year' | 'month' | 'day' {
  try {
    const pos = input.selectionStart;
    if (pos == null) return 'day';
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
    if (pos == null) return 'minute';
    return pos <= 2 ? 'hour' : 'minute';
  } catch {
    return 'minute';
  }
}

function isAllowedEditorControlKey(event: React.KeyboardEvent<HTMLInputElement>): boolean {
  if (event.metaKey || event.ctrlKey || event.altKey) return true;
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
  if (event.code === 'Minus' || event.code === 'NumpadSubtract') return -1;
  if (event.code === 'Equal' || event.code === 'NumpadAdd') return 1;
  if (event.key === '-') return -1;
  if (event.key === '=' || event.key === '+') return 1;
  return null;
}

function getRepeatSummaryLabel(repeatType: RepeatValue, week: number[], month: number[]) {
  if (repeatType === 'none') return '重复';
  if (repeatType === 'daily') return '每天';
  if (repeatType === 'weekly') return week.length ? week.map((d) => `周${WEEK_LABELS[d]}`).join('/') : '每周';
  return `每月${month.join('/') || '-'}号`;
}

function useDismissiblePanel(
  open: boolean,
  panelRef: React.RefObject<HTMLDivElement>,
  onClose: () => void,
) {
  useEffect(() => {
    if (!open) return;

    const onPointerDown = (event: PointerEvent) => {
      const target = event.target;
      if (!(target instanceof Node)) return;
      if (panelRef.current?.contains(target)) return;
      onClose();
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };

    window.addEventListener('pointerdown', onPointerDown);
    window.addEventListener('keydown', onKeyDown);
    return () => {
      window.removeEventListener('pointerdown', onPointerDown);
      window.removeEventListener('keydown', onKeyDown);
    };
  }, [open, onClose, panelRef]);
}

export function TaskScheduleToolbar({
  mode,
  dueDate,
  time,
  reminder,
  repeatType,
  repeatDaysOfWeek,
  repeatDaysOfMonth,
  actionChips,
  unavailableActionsLabel,
  showListPicker = false,
  listOptions = [],
  selectedListValue = '__none__',
  onSelectedListChange,
  onDueDateChange,
  onTimeChange,
  onReminderChange,
  onBeforeOpenReminder,
  onRepeatTypeChange,
  onToggleRepeatWeekDay,
  onSetRepeatMonthDays,
  onOpenActionPicker,
  onPanelOpenChange,
}: TaskScheduleToolbarProps) {
  const [activePanel, setActivePanel] = useState<'repeat' | null>(null);
  const [isListMenuOpen, setIsListMenuOpen] = useState(false);
  const [repeatMonthDaysInput, setRepeatMonthDaysInput] = useState('');
  const repeatPanelRef = useRef<HTMLDivElement>(null);
  const listMenuRef = useRef<HTMLDivElement>(null);
  const repeatMonthDaysInputRef = useRef<HTMLInputElement>(null);
  const lastEnabledTimeRef = useRef<string>('09:00');
  const lastEnabledRepeatRef = useRef<{
    repeatType: RepeatType;
    repeatDaysOfWeek: number[];
    repeatDaysOfMonth: number[];
  }>({ repeatType: 'daily', repeatDaysOfWeek: [], repeatDaysOfMonth: [] });

  const reminderOffsetMinutes = reminder?.type === 'relative' ? reminder.offsetMinutes : 10;
  const canUseReminder = Boolean(time);
  const repeatEnabled = repeatType !== 'none';
  const dateEnabled = Boolean(dueDate);
  const timeEnabled = Boolean(time);
  const displayedTimeValue = timeEnabled ? (time ?? '') : lastEnabledTimeRef.current;
  const selectedListLabel = useMemo(
    () => listOptions.find((option) => option.value === selectedListValue)?.label ?? '无',
    [listOptions, selectedListValue],
  );

  useEffect(() => {
    onPanelOpenChange?.(Boolean(activePanel || isListMenuOpen));
  }, [activePanel, isListMenuOpen, onPanelOpenChange]);

  useEffect(() => {
    if (time) {
      lastEnabledTimeRef.current = time;
    }
  }, [time]);

  useEffect(() => {
    if (repeatType !== 'none') {
      lastEnabledRepeatRef.current = {
        repeatType,
        repeatDaysOfWeek,
        repeatDaysOfMonth,
      };
    }
  }, [repeatType, repeatDaysOfWeek, repeatDaysOfMonth]);

  useEffect(() => {
    if (repeatType !== 'monthly') {
      return;
    }
    if (document.activeElement === repeatMonthDaysInputRef.current) {
      return;
    }
    setRepeatMonthDaysInput(repeatDaysOfMonth.join(','));
  }, [repeatType, repeatDaysOfMonth]);

  useDismissiblePanel(Boolean(activePanel), repeatPanelRef, () => setActivePanel(null));
  useDismissiblePanel(isListMenuOpen, listMenuRef, () => setIsListMenuOpen(false));

  const toggleDateEnabled = () => {
    if (dateEnabled) {
      onDueDateChange(null);
      return;
    }
    if (repeatEnabled) {
      onRepeatTypeChange('none');
      setActivePanel(null);
    }
    onDueDateChange(dueDate ?? todayDateString());
  };

  const toggleTimeEnabled = () => {
    if (timeEnabled) {
      if (time) {
        lastEnabledTimeRef.current = time;
      }
      onTimeChange(null);
      onReminderChange(null);
      return;
    }
    onTimeChange(lastEnabledTimeRef.current);
  };

  const setReminderEnabled = (nextEnabled: boolean) => {
    void (async () => {
      if (nextEnabled) {
        if (!canUseReminder) {
          window.alert('请先设置时间');
          return;
        }
        const canEnable = (await onBeforeOpenReminder?.()) ?? true;
        if (!canEnable) return;
        onReminderChange(toRelativeReminder(reminderOffsetMinutes || 10));
        return;
      }
      onReminderChange(null);
    })();
  };

  const toggleRepeatEnabled = () => {
    if (!repeatEnabled) {
      if (dateEnabled && mode === 'edit') {
        onDueDateChange(null);
      }
      onRepeatTypeChange(lastEnabledRepeatRef.current.repeatType);
      return;
    }
    onRepeatTypeChange('none');
    setActivePanel(null);
  };

  const modeAttr = mode; // mark prop as used for now; can branch styles later.
  void modeAttr;

  const withStepKeys =
    (kind: 'date' | 'time' | 'reminder') => (event: React.KeyboardEvent<HTMLInputElement>) => {
      const delta = getStepDelta(event);
      if (delta == null) return;
      event.preventDefault();
      event.stopPropagation();

      if (kind === 'date') {
        const base = dueDate ?? '';
        const next = shiftDateSegment(base, getCaretSegmentForDate(event.currentTarget), delta);
        if (!next) return;
        onDueDateChange(next);
        return;
      }

      if (kind === 'time') {
        const base = time || '09:00';
        const next = shiftTimeSegment(base, getCaretSegmentForTime(event.currentTarget), delta);
        if (!next) return;
        onTimeChange(next);
        return;
      }

      if (!canUseReminder && !reminder) {
        return;
      }
      const currentMinutes = reminder?.type === 'relative' ? reminder.offsetMinutes : reminderOffsetMinutes;
      const nextMinutes = Math.max(0, currentMinutes + delta);
      if (!reminder) {
        onReminderChange(toRelativeReminder(nextMinutes));
        return;
      }
      onReminderChange(toRelativeReminder(nextMinutes));
    };

  const restrictInlineMetaInputKeys = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (isAllowedEditorControlKey(event)) return;
    if (/^\d$/.test(event.key)) return;
    if (getStepDelta(event) != null) return;
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

  return (
    <div className="space-y-2.5 pb-1">
      <div className="flex flex-wrap items-center gap-1.5">
        <TaskInlineToolbarChip>
          <button
            type="button"
            onClick={(event) => {
              event.preventDefault();
              event.stopPropagation();
              toggleDateEnabled();
            }}
            className={`inline-flex h-5 w-5 items-center justify-center rounded-sm transition ${
              dateEnabled ? 'bg-amber-100 text-amber-600' : 'bg-white text-slate-400 hover:bg-slate-50'
            }`}
            aria-label={dateEnabled ? '关闭日期' : '开启日期'}
          >
            <Calendar size={12} />
          </button>
          <input
            type="date"
            value={dueDate ?? ''}
            onChange={(event) => onDueDateChange(event.target.value || null)}
            onKeyDown={withRestrictedStepKeys('date')}
            onPaste={(event) => event.preventDefault()}
            className={`min-w-0 bg-transparent text-[12px] font-medium outline-none ${dueDate ? 'text-slate-600' : 'text-slate-500'}`}
          />
        </TaskInlineToolbarChip>

        <TaskInlineToolbarChip>
          <button
            type="button"
            onClick={(event) => {
              event.preventDefault();
              event.stopPropagation();
              toggleTimeEnabled();
            }}
            className={`inline-flex h-5 w-5 items-center justify-center rounded-sm transition ${
              timeEnabled ? 'bg-amber-100 text-amber-600' : 'bg-white text-slate-400 hover:bg-slate-50'
            }`}
            aria-label={timeEnabled ? '关闭时间' : '开启时间'}
          >
            <Clock3 size={12} />
          </button>
          <input
            type={timeEnabled ? 'time' : 'text'}
            value={displayedTimeValue}
            readOnly={!timeEnabled}
            onChange={(event) => {
              if (!timeEnabled) return;
              onTimeChange(event.target.value || null);
            }}
            onKeyDown={(event) => {
              if (!timeEnabled) {
                event.preventDefault();
                event.stopPropagation();
                return;
              }
              withRestrictedStepKeys('time')(event);
            }}
            onPaste={(event) => event.preventDefault()}
            className={`w-[62px] bg-transparent text-[12px] font-medium outline-none ${timeEnabled ? 'text-slate-600' : 'text-slate-500'}`}
          />
        </TaskInlineToolbarChip>

        <TaskInlineToolbarChip
          className={!canUseReminder && !reminder ? 'opacity-70' : ''}
          onClick={(event) => {
            const target = event.target;
            if (target instanceof HTMLInputElement) return;
            setReminderEnabled(!Boolean(reminder));
          }}
        >
          <button
            type="button"
            onClick={(event) => {
              event.stopPropagation();
              setReminderEnabled(!Boolean(reminder));
            }}
            className={`rounded-sm p-0.5 transition ${
              reminder ? 'bg-amber-100 text-amber-600 hover:bg-amber-200/80' : 'text-slate-400 hover:bg-white/70'
            }`}
            disabled={!canUseReminder && !reminder}
            aria-label={reminder ? '关闭提醒' : '开启提醒'}
          >
            <Bell size={13} className={reminder ? 'text-amber-600' : 'text-slate-400'} />
          </button>
          <span>提前</span>
          <input
            type="text"
            inputMode="numeric"
            value={reminderOffsetMinutes}
            disabled={!reminder}
            onChange={(event) => {
              const digitsOnly = event.target.value.replace(/\D+/g, '');
              const next = digitsOnly ? Math.max(0, Number(digitsOnly)) : 0;
              onReminderChange(toRelativeReminder(next));
            }}
            onKeyDown={withRestrictedStepKeys('reminder')}
            onPaste={(event) => event.preventDefault()}
            className={`w-9 bg-transparent text-[12px] font-medium outline-none ${
              reminder ? 'text-slate-600' : 'cursor-not-allowed text-slate-400'
            }`}
          />
          <span className={reminder ? '' : 'text-slate-400'}>分钟</span>
        </TaskInlineToolbarChip>

        <div ref={repeatPanelRef} className="relative">
          <TaskInlineToolbarChip className={repeatEnabled ? 'bg-amber-100/80 text-amber-700' : ''}>
            <button
              type="button"
              onClick={toggleRepeatEnabled}
              className={`inline-flex h-5 w-5 items-center justify-center rounded-sm transition ${
                repeatEnabled ? 'bg-amber-100 text-amber-600 hover:bg-amber-200/80' : 'bg-white text-slate-400 hover:bg-slate-50'
              }`}
              aria-label={repeatEnabled ? '关闭重复' : '开启重复'}
            >
              <Repeat2 size={12} />
            </button>
            <button
              type="button"
              disabled={!repeatEnabled}
              onClick={() => {
                if (!repeatEnabled) return;
                setIsListMenuOpen(false);
                setActivePanel((prev) => (prev === 'repeat' ? null : 'repeat'));
              }}
              className={`inline-flex items-center gap-1 rounded-sm px-0.5 transition ${
                repeatEnabled ? 'text-slate-600 hover:text-slate-800' : 'cursor-default text-slate-400'
              }`}
            >
              <span>{getRepeatSummaryLabel(repeatType, repeatDaysOfWeek, repeatDaysOfMonth)}</span>
            </button>
          </TaskInlineToolbarChip>

          {activePanel === 'repeat' ? (
            <TaskControlPopover className="w-[320px]">
              <div className="flex flex-col gap-2">
                <div className="flex flex-wrap items-center gap-1.5">
                  {([
                    { value: 'daily', label: '每天' },
                    { value: 'weekly', label: '每周' },
                    { value: 'monthly', label: '每月' },
                  ] as const).map((option) => {
                    const active = repeatType === option.value;
                    return (
                      <button
                        key={option.value}
                        type="button"
                        onClick={() => onRepeatTypeChange(option.value)}
                        className={`rounded-md px-2.5 py-1 text-xs font-medium transition ${
                          active
                            ? 'bg-slate-100 text-slate-700 ring-1 ring-slate-200/80'
                            : 'text-slate-500 hover:bg-slate-100 hover:text-slate-700'
                        }`}
                      >
                        {option.label}
                      </button>
                    );
                  })}
                </div>

                {repeatType === 'weekly' ? (
                  <div className="flex flex-wrap items-center gap-1">
                    {WEEK_LABELS.map((label, day) => {
                      const active = repeatDaysOfWeek.includes(day);
                      return (
                        <button
                          key={label}
                          type="button"
                          onClick={() => onToggleRepeatWeekDay(day)}
                          className={`rounded-md px-2 py-1 text-xs transition ${
                            active ? 'bg-linkflow-accent text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                          }`}
                        >
                          周{label}
                        </button>
                      );
                    })}
                  </div>
                ) : null}

                {repeatType === 'monthly' ? (
                  <>
                    <div className="flex flex-wrap items-center gap-1">
                      {QUICK_MONTH_DAYS.map((day) => {
                        const active = repeatDaysOfMonth.includes(day);
                        return (
                          <button
                            key={day}
                            type="button"
                            onClick={() => {
                              onSetRepeatMonthDays(toggleNumberSelection(repeatDaysOfMonth, day));
                            }}
                            className={`rounded-md px-2 py-1 text-xs transition ${
                              active ? 'bg-linkflow-accent text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                            }`}
                          >
                            {day}号
                          </button>
                        );
                      })}
                    </div>
                    <label className="flex items-center gap-2 text-xs text-slate-400">
                      自定义
                      <input
                        ref={repeatMonthDaysInputRef}
                        value={repeatMonthDaysInput}
                        onChange={(event) => {
                          const raw = event.target.value;
                          setRepeatMonthDaysInput(raw);
                          const parsed = raw
                            .split(/[,，]/)
                            .map((item) => Number(item.trim()))
                            .filter((item) => Number.isInteger(item) && item >= 1 && item <= 31);
                          const unique = Array.from(new Set(parsed)).sort((a, b) => a - b);
                          onSetRepeatMonthDays(unique);
                        }}
                        onBlur={() => setRepeatMonthDaysInput(repeatDaysOfMonth.join(','))}
                        className="flex-1 rounded-lg border border-slate-200 px-2 py-1 text-xs text-slate-700 outline-none focus:ring-2 focus:ring-linkflow-accent/15"
                        placeholder="1,15,28"
                      />
                    </label>
                  </>
                ) : null}
              </div>
            </TaskControlPopover>
          ) : null}
        </div>

        <TaskInlineToolbarButtonChip onClick={onOpenActionPicker}>
          <Link2 size={13} className="text-slate-400" />
          <span>动作</span>
        </TaskInlineToolbarButtonChip>

        {showListPicker ? (
          <div ref={listMenuRef} className="relative ml-auto w-fit">
            <TaskInlineToolbarButtonChip
              onClick={() => {
                if (!isListMenuOpen) {
                  setActivePanel(null);
                }
                setIsListMenuOpen((prev) => !prev);
              }}
            >
              <ListIcon className="h-3.5 w-3.5 text-gray-400" />
              <span className="max-w-[140px] truncate text-[12px] text-gray-600">{selectedListLabel}</span>
              <ChevronDown className="h-3.5 w-3.5 text-gray-400" />
            </TaskInlineToolbarButtonChip>

            {isListMenuOpen ? (
              <TaskControlPopover className="left-auto right-0 z-40 mt-1 min-w-full w-max rounded-xl bg-white/95 p-1.5 ring-slate-200/60 shadow-[0_8px_20px_rgba(15,23,42,0.08)] backdrop-blur-sm">
                <div className="max-h-64 overflow-y-auto">
                  {listOptions.map((option) => {
                    const isSelected = option.value === selectedListValue;
                    return (
                      <button
                        key={option.value}
                        type="button"
                        onClick={() => {
                          onSelectedListChange?.(option.value === '__none__' ? null : option.value);
                          setIsListMenuOpen(false);
                        }}
                        className={`flex h-8 w-full items-center justify-between gap-3 rounded-lg px-2.5 text-left text-[12px] font-medium text-slate-600 transition-colors hover:bg-slate-100/80 ${
                          isSelected ? 'bg-slate-100/70' : ''
                        }`}
                      >
                        <span className="inline-flex min-w-0 items-center gap-2">
                          <ListIcon className="h-3.5 w-3.5 shrink-0 text-gray-400" />
                          <span className="truncate">{option.label}</span>
                        </span>
                        {isSelected ? <Check className="h-3.5 w-3.5 shrink-0 text-slate-500" /> : null}
                      </button>
                    );
                  })}
                </div>
              </TaskControlPopover>
            ) : null}
          </div>
        ) : null}
      </div>

      {(actionChips?.length ?? 0) > 0 || unavailableActionsLabel ? (
        <div className="flex flex-wrap items-center gap-1.5 pt-0.5">
          {actionChips?.map((chip) =>
            chip.onClick ? (
              <TaskInlineToolbarButtonChip key={chip.key} onClick={chip.onClick} className="max-w-44 truncate" title={chip.title ?? chip.label}>
                {chip.label}
              </TaskInlineToolbarButtonChip>
            ) : (
              <TaskInlineToolbarChip key={chip.key} className="max-w-44 truncate" title={chip.title ?? chip.label}>
                {chip.label}
              </TaskInlineToolbarChip>
            ),
          )}
          {unavailableActionsLabel ? <TaskInlineToolbarChip>{unavailableActionsLabel}</TaskInlineToolbarChip> : null}
        </div>
      ) : null}
    </div>
  );
}
