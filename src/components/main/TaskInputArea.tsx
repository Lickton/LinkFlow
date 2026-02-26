import { Bell, Calendar, Circle, Clock3, Link2, Repeat2 } from 'lucide-react';
import { forwardRef, useEffect, useImperativeHandle, useLayoutEffect, useMemo, useReducer, useRef, useState } from 'react';
import { AppSelect } from '../common/AppSelect';
import type { List, RepeatType, TaskReminder } from '../../types/models';
import { toRelativeReminder } from '../../utils/schedule';
import {
  TaskAttributeTag,
  TaskControlInput,
  TaskControlPopover,
  TaskEditorBody,
  TaskEditorSurface,
  TaskNotesPanel,
} from './TaskCardPrimitives';

interface ActionPreview {
  key: string;
  label: string;
  params: string[];
}

interface TaskInputAreaProps {
  value: string;
  detail?: string;
  dueDate: string | null;
  time: string | null;
  reminder: TaskReminder;
  repeatType: RepeatType | 'none';
  repeatDaysOfWeek: number[];
  repeatDaysOfMonth: number[];
  actions?: ActionPreview[];
  showListPicker?: boolean;
  lists?: List[];
  selectedListId?: string | null;
  onChange: (value: string) => void;
  onDetailChange: (value: string) => void;
  onDueDateChange: (value: string | null) => void;
  onTimeChange: (value: string | null) => void;
  onReminderChange: (value: TaskReminder) => void;
  onBeforeOpenReminder?: () => Promise<boolean> | boolean;
  onRepeatTypeChange: (value: RepeatType | 'none') => void;
  onToggleRepeatWeekDay: (value: number) => void;
  onSetRepeatMonthDays: (value: number[]) => void;
  onSelectedListChange?: (value: string | null) => void;
  onSubmit: () => void | Promise<void>;
  onOpenActionPicker: () => void;
  onCancelDraft?: () => void;
  suspendAutoCollapse?: boolean;
}

export interface TaskInputAreaHandle {
  focusTitleInput: () => void;
  openQuickEntry: () => void;
  closeQuickEntry: () => void;
}

const WEEK_LABELS = ['一', '二', '三', '四', '五', '六', '日'];
const QUICK_MONTH_DAYS = [1, 5, 10, 15, 20, 25, 31];
const TIME_PRESETS = ['09:00', '12:00', '18:00', '21:00'];

type ActivePanel = 'time' | 'reminder' | 'repeat' | null;

type UiAction =
  | { type: 'UI_OPEN_PANEL'; panel: ActivePanel; currentTime: string | null }
  | { type: 'UI_CLOSE_PANEL' }
  | { type: 'UI_SET_TIME_INPUT'; value: string }
  | { type: 'UI_SET_TIME_ERROR'; message: string | null };

interface UiState {
  activePanel: ActivePanel;
  openedTimeValue: string | null;
  timeInput: string;
  timeError: string | null;
}

const initialUiState: UiState = {
  activePanel: null,
  openedTimeValue: null,
  timeInput: '00:00',
  timeError: null,
};

function uiReducer(state: UiState, action: UiAction): UiState {
  switch (action.type) {
    case 'UI_OPEN_PANEL': {
      if (action.panel === 'time') {
        const snapshot = action.currentTime ?? null;
        return {
          activePanel: 'time',
          openedTimeValue: snapshot,
          timeInput: snapshot ?? '00:00',
          timeError: null,
        };
      }
      return {
        ...state,
        activePanel: action.panel,
        timeError: null,
      };
    }
    case 'UI_CLOSE_PANEL': {
      return {
        ...state,
        activePanel: null,
        timeError: null,
      };
    }
    case 'UI_SET_TIME_INPUT': {
      return {
        ...state,
        timeInput: action.value,
        timeError: null,
      };
    }
    case 'UI_SET_TIME_ERROR': {
      return {
        ...state,
        timeError: action.message,
      };
    }
    default:
      return state;
  }
}

function isValidTime(value: string): boolean {
  if (!/^\d{2}:\d{2}$/.test(value)) {
    return false;
  }
  const [hours, minutes] = value.split(':').map(Number);
  return Number.isInteger(hours) && Number.isInteger(minutes) && hours >= 0 && hours <= 23 && minutes >= 0 && minutes <= 59;
}

function getRepeatSummaryLabel(
  repeatType: RepeatType | 'none',
  repeatDaysOfWeek: number[],
  repeatDaysOfMonth: number[],
): string {
  if (repeatType === 'none') {
    return '重复';
  }
  if (repeatType === 'daily') {
    return '每天';
  }
  if (repeatType === 'weekly') {
    const days = repeatDaysOfWeek.length ? repeatDaysOfWeek.map((day) => `周${WEEK_LABELS[day]}`).join('/') : '每周';
    return days;
  }
  return `每月${repeatDaysOfMonth.join('/') || '-'}号`;
}

export const TaskInputArea = forwardRef<TaskInputAreaHandle, TaskInputAreaProps>(function TaskInputArea({
  value,
  detail,
  dueDate,
  time,
  reminder,
  repeatType,
  repeatDaysOfWeek,
  repeatDaysOfMonth,
  actions,
  showListPicker,
  lists,
  selectedListId,
  onChange,
  onDetailChange,
  onDueDateChange,
  onTimeChange,
  onReminderChange,
  onBeforeOpenReminder,
  onRepeatTypeChange,
  onToggleRepeatWeekDay,
  onSetRepeatMonthDays,
  onSelectedListChange,
  onSubmit,
  onOpenActionPicker,
  onCancelDraft,
  suspendAutoCollapse = false,
}, ref) {
  const dateInputRef = useRef<HTMLInputElement>(null);
  const timePickerInputRef = useRef<HTMLInputElement>(null);
  const titleInputRef = useRef<HTMLInputElement>(null);
  const detailTextareaRef = useRef<HTMLTextAreaElement>(null);
  const launcherButtonRef = useRef<HTMLButtonElement>(null);
  const composerCardRef = useRef<HTMLDivElement>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const nativePickerOpenRef = useRef(false);
  const [ui, dispatchUi] = useReducer(uiReducer, {
    ...initialUiState,
    timeInput: time ?? '00:00',
  });
  const shouldUseNativeTimePicker = /Android/i.test(window.navigator.userAgent);

  const monthDaysText = useMemo(() => repeatDaysOfMonth.join(','), [repeatDaysOfMonth]);
  const canSubmit = value.trim().length > 0;
  const reminderOffsetMinutes = reminder?.type === 'relative' ? reminder.offsetMinutes : 10;
  const canUseRelativeReminder = Boolean(dueDate && time);
  const [isExpanded, setIsExpanded] = useState(false);
  const [expandedHeight, setExpandedHeight] = useState(0);
  const hasDraftPayload = Boolean(
    value.trim() ||
      detail?.trim() ||
      dueDate ||
      time ||
      reminder ||
      repeatType !== 'none' ||
      (actions?.length ?? 0) > 0,
  );

  const focusTitleSoon = () => {
    requestAnimationFrame(() => {
      titleInputRef.current?.focus();
    });
  };

  const openQuickEntry = () => {
    setIsExpanded(true);
    focusTitleSoon();
  };

  const closeQuickEntry = () => {
    setIsExpanded(false);
    closeQuickEntryPanels();
  };

  useEffect(() => {
    if (hasDraftPayload) {
      setIsExpanded(true);
    }
  }, [hasDraftPayload]);

  useLayoutEffect(() => {
    if (!isExpanded) {
      return;
    }

    const node = composerCardRef.current;
    if (!node) {
      return;
    }

    const updateHeight = () => {
      setExpandedHeight(node.getBoundingClientRect().height);
    };

    updateHeight();

    const observer = new ResizeObserver(() => updateHeight());
    observer.observe(node);
    return () => observer.disconnect();
  }, [isExpanded, ui.activePanel, value, detail, dueDate, time, reminder, repeatType, actions]);

  useEffect(() => {
    if (!isExpanded) {
      return;
    }
    if (suspendAutoCollapse) {
      return;
    }

    const onPointerDown = (event: MouseEvent) => {
      const target = event.target;
      if (!(target instanceof Node)) {
        return;
      }

      // macOS native date/time pickers render outside the webview DOM; ignore outside-close while one is open.
      if (nativePickerOpenRef.current) {
        return;
      }

      if (rootRef.current?.contains(target)) {
        return;
      }

      closeQuickEntry();
    };

    window.addEventListener('mousedown', onPointerDown);
    return () => window.removeEventListener('mousedown', onPointerDown);
  }, [isExpanded, ui.activePanel, suspendAutoCollapse]);

  useImperativeHandle(
    ref,
    () => ({
      focusTitleInput: () => {
        openQuickEntry();
      },
      openQuickEntry,
      closeQuickEntry,
    }),
    [openQuickEntry],
  );

  const closeQuickEntryPanels = () => {
    if (ui.activePanel) {
      dispatchUi({ type: 'UI_CLOSE_PANEL' });
    }
  };

  const handleCancelQuickEntry = () => {
    closeQuickEntry();
    onCancelDraft?.();
    requestAnimationFrame(() => {
      launcherButtonRef.current?.focus();
    });
  };

  const focusNotesPanel = () => {
    requestAnimationFrame(() => {
      detailTextareaRef.current?.focus();
      const textarea = detailTextareaRef.current;
      if (textarea) {
        const len = textarea.value.length;
        textarea.setSelectionRange(len, len);
      }
    });
  };

  const submitQuickEntry = () => {
    if (!canSubmit) {
      return;
    }
    void Promise.resolve(onSubmit()).finally(() => {
      setIsExpanded(true);
      focusTitleSoon();
    });
  };

  const commitTimeInput = (closePanel = false) => {
    const normalized = ui.timeInput.trim() || '00:00';

    if (!isValidTime(normalized)) {
      dispatchUi({ type: 'UI_SET_TIME_ERROR', message: '时间格式不合法，请使用 HH:mm。' });
      return;
    }

    onTimeChange(normalized);
    if (closePanel) {
      dispatchUi({ type: 'UI_CLOSE_PANEL' });
    }
  };

  const revertTimeInput = () => {
    dispatchUi({ type: 'UI_SET_TIME_INPUT', value: time ?? '00:00' });
    dispatchUi({ type: 'UI_SET_TIME_ERROR', message: null });
  };

  return (
    <div
      ref={rootRef}
      className="relative mb-2"
      style={{ height: isExpanded ? `${Math.ceil(expandedHeight)}px` : undefined }}
    >
      <button
        ref={launcherButtonRef}
        type="button"
        onClick={openQuickEntry}
        className={`group flex h-11 w-full items-center gap-3 rounded-xl px-3 text-left transition-all duration-150 ${
          isExpanded
            ? 'opacity-0 pointer-events-none'
            : 'bg-transparent text-slate-400 hover:bg-white/70 hover:text-slate-500'
        }`}
        aria-label="新建待办事项"
      >
        <Circle size={18} className="text-slate-300" />
        <span className="text-[15px] font-medium tracking-[0.01em]">新建待办事项</span>
      </button>

      {isExpanded ? (
        <TaskEditorSurface
          ref={composerCardRef}
          elevated
          className="group absolute left-0 right-0 top-0 z-20 transition-all duration-150 focus-within:-translate-y-[1px]"
          checkbox={<Circle size={18} className="text-slate-300" />}
          title={
            <input
              id="task-title-input"
              ref={titleInputRef}
              value={value}
              onChange={(event) => onChange(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Escape') {
                  event.preventDefault();
                  handleCancelQuickEntry();
                  return;
                }
                if (event.key === 'Enter' && event.shiftKey) {
                  event.preventDefault();
                  focusNotesPanel();
                  return;
                }
                if (event.key === 'Enter') {
                  event.preventDefault();
                  submitQuickEntry();
                }
              }}
              placeholder="添加新任务"
              className="w-full border-none bg-transparent text-[15px] font-semibold text-slate-900 outline-none placeholder:font-medium placeholder:text-slate-400"
            />
          }
          rightAction={
            <button
              type="button"
              onClick={submitQuickEntry}
              disabled={!canSubmit}
              className={`rounded-xl px-4 py-2 text-sm font-semibold transition duration-150 ${
                canSubmit
                  ? 'bg-slate-900 text-white shadow-sm hover:bg-slate-800'
                  : 'cursor-not-allowed bg-slate-200 text-slate-400'
              }`}
            >
              创建
            </button>
          }
          body={
            <>
              <TaskEditorBody
        toolbar={
          <div className="min-h-[49px] overflow-visible">
            <div className="flex flex-wrap items-center gap-2 transition-all duration-150 translate-y-0 opacity-100">
        {repeatType === 'none' ? (
          <TaskAttributeTag
            icon={<Calendar size={14} />}
            label="日期"
            active={Boolean(dueDate)}
            onClick={() => {
              const input = dateInputRef.current;
              if (!input) {
                return;
              }
              nativePickerOpenRef.current = true;
              input.showPicker?.();
              input.focus();
            }}
          />
        ) : null}

        <div className="relative">
          <TaskAttributeTag
            icon={<Clock3 size={12} />}
            label={time || '时间'}
            active={ui.activePanel === 'time' || Boolean(time)}
            muted={!time && ui.activePanel !== 'time'}
            onClick={() => {
              if (shouldUseNativeTimePicker) {
                const input = timePickerInputRef.current;
                if (!input) {
                  return;
                }
                let opened = false;
                try {
                  nativePickerOpenRef.current = true;
                  input.showPicker?.();
                  opened = typeof input.showPicker === 'function';
                } catch {
                  // Fallback to lightweight popover when showPicker is unavailable.
                }
                input.focus();
                if (opened) {
                  return;
                }
              }

              if (ui.activePanel === 'time') {
                dispatchUi({ type: 'UI_CLOSE_PANEL' });
                return;
              }
              dispatchUi({ type: 'UI_OPEN_PANEL', panel: 'time', currentTime: time });
            }}
          />

          {ui.activePanel === 'time' && !shouldUseNativeTimePicker ? (
            <TaskControlPopover className="w-[280px]">
              <div className="flex flex-col gap-2">
                <div className="flex flex-wrap items-center gap-1.5">
                  {TIME_PRESETS.map((preset) => (
                    <button
                      key={preset}
                      type="button"
                      onClick={() => {
                        dispatchUi({ type: 'UI_SET_TIME_INPUT', value: preset });
                      }}
                    className="rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 text-xs font-medium text-slate-600 hover:bg-slate-100"
                    >
                      {preset}
                    </button>
                  ))}
                  {time ? (
                    <button
                      type="button"
                      onClick={() => {
                        onTimeChange(null);
                        dispatchUi({ type: 'UI_SET_TIME_INPUT', value: '00:00' });
                        dispatchUi({ type: 'UI_SET_TIME_ERROR', message: null });
                      }}
                      className="rounded-full border border-slate-200 bg-white px-2.5 py-1 text-xs font-medium text-slate-500 hover:bg-slate-50"
                    >
                      移除
                    </button>
                  ) : null}
                </div>

                <div className="flex items-center gap-2">
                  <TaskControlInput className="px-0">
                    <input
                      type="time"
                      value={ui.timeInput}
                      onChange={(event) => dispatchUi({ type: 'UI_SET_TIME_INPUT', value: event.target.value })}
                      onKeyDown={(event) => {
                        if (event.key === 'Escape') {
                          event.preventDefault();
                          revertTimeInput();
                          dispatchUi({ type: 'UI_CLOSE_PANEL' });
                          return;
                        }
                        if (event.key === 'Enter') {
                          event.preventDefault();
                          commitTimeInput(true);
                        }
                      }}
                      className="h-7 w-[118px] rounded-lg bg-transparent px-2 text-xs font-medium text-slate-700 outline-none"
                      autoFocus
                    />
                  </TaskControlInput>
                  <button
                    type="button"
                    onClick={() => commitTimeInput(true)}
                    className="rounded-lg bg-slate-900 px-2.5 py-1.5 text-xs font-semibold text-white hover:bg-slate-800"
                  >
                    确认
                  </button>
                </div>

                {ui.timeError ? <p className="text-xs text-red-500">{ui.timeError}</p> : null}
              </div>
            </TaskControlPopover>
          ) : null}
        </div>

        <TaskAttributeTag
          type="div"
          icon={<Bell size={14} />}
          label="提醒"
          active={Boolean(reminder)}
          muted={!reminder}
          className={!canUseRelativeReminder ? 'opacity-60' : ''}
        >
          <label className="inline-flex items-center gap-1 text-current" onClick={(event) => event.stopPropagation()}>
            <input
              type="checkbox"
              checked={Boolean(reminder)}
              disabled={!canUseRelativeReminder}
              onChange={(event) => {
                const nextEnabled = event.target.checked;
                void (async () => {
                  if (nextEnabled) {
                    const canEnable = (await onBeforeOpenReminder?.()) ?? true;
                    if (!canEnable) {
                      return;
                    }
                    onReminderChange(toRelativeReminder(reminderOffsetMinutes || 10));
                    return;
                  }
                  onReminderChange(null);
                })();
              }}
              className="h-3.5 w-3.5 rounded border-slate-300"
            />
            {reminder ? (
              <input
                type="number"
                min={0}
                value={reminderOffsetMinutes}
                disabled={!canUseRelativeReminder}
                onChange={(event) => {
                  const next = Math.max(0, Number(event.target.value) || 0);
                  onReminderChange(toRelativeReminder(next));
                }}
                className="w-10 bg-transparent text-xs font-medium text-current outline-none"
              />
            ) : (
              <span className="text-xs font-semibold">关</span>
            )}
          </label>
        </TaskAttributeTag>

        <div className="relative">
          <TaskAttributeTag
            icon={<Repeat2 size={12} />}
            label={getRepeatSummaryLabel(repeatType, repeatDaysOfWeek, repeatDaysOfMonth)}
            active={ui.activePanel === 'repeat'}
            muted={repeatType === 'none' && ui.activePanel !== 'repeat'}
            onClick={() =>
              dispatchUi({
                type: ui.activePanel === 'repeat' ? 'UI_CLOSE_PANEL' : 'UI_OPEN_PANEL',
                panel: 'repeat',
                currentTime: time,
              })
            }
          />

          {ui.activePanel === 'repeat' ? (
            <TaskControlPopover className="w-[320px]">
              <div className="flex flex-col gap-2">
                <div className="flex flex-wrap items-center gap-2">
                  <label className="text-xs text-slate-400">重复</label>
                  <AppSelect
                    value={repeatType}
                    onChange={(selected) => onRepeatTypeChange(selected as RepeatType | 'none')}
                    options={[
                      { value: 'none', label: '不重复' },
                      { value: 'daily', label: '每天' },
                      { value: 'weekly', label: '每周' },
                      { value: 'monthly', label: '每月' },
                    ]}
                    className="w-28"
                  />
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
                              if (active) {
                                onSetRepeatMonthDays(repeatDaysOfMonth.filter((item) => item !== day));
                              } else {
                                onSetRepeatMonthDays([...repeatDaysOfMonth, day]);
                              }
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
                        value={monthDaysText}
                        onChange={(event) => {
                          const parsed = event.target.value
                            .split(',')
                            .map((item) => Number(item.trim()))
                            .filter((item) => Number.isInteger(item) && item >= 1 && item <= 31);
                          const unique = Array.from(new Set(parsed)).sort((a, b) => a - b);
                          onSetRepeatMonthDays(unique);
                        }}
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

        <TaskAttributeTag icon={<Link2 size={12} />} label="动作" highlight onClick={onOpenActionPicker} />

        {showListPicker ? (
          <AppSelect
            value={selectedListId ?? '__none__'}
            onChange={(selected) => onSelectedListChange?.(selected === '__none__' ? null : selected)}
            options={[
              { value: '__none__', label: '无', icon: '∅' },
              ...((lists ?? []).map((list) => ({
                value: list.id,
                label: list.name,
                icon: list.icon,
              })) as { value: string; label: string; icon: string }[]),
            ]}
            className="ml-auto w-48"
          />
        ) : null}
            </div>
          </div>
        }
        notes={
          <TaskNotesPanel label={null}>
        <label className="flex flex-col">
          <textarea
            ref={detailTextareaRef}
            value={detail ?? ''}
            onChange={(event) => onDetailChange(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Escape') {
                event.preventDefault();
                handleCancelQuickEntry();
                return;
              }
              if (event.key === 'Enter' && !event.shiftKey) {
                event.preventDefault();
                submitQuickEntry();
              }
            }}
            rows={3}
            placeholder="备注"
            className="w-full resize-none bg-transparent px-1 py-1.5 text-sm leading-6 text-slate-700 outline-none placeholder:text-slate-400"
          />
        </label>
          </TaskNotesPanel>
        }
        afterNotes={null}
      />

      <input
        ref={dateInputRef}
        type="date"
        value={dueDate ?? ''}
        onChange={(event) => onDueDateChange(event.target.value || null)}
        onBlur={() => {
          nativePickerOpenRef.current = false;
        }}
        className="sr-only"
      />
      <input
        ref={timePickerInputRef}
        type="time"
        value={time ?? ''}
        onChange={(event) => {
          const next = event.target.value || null;
          onTimeChange(next);
          nativePickerOpenRef.current = false;
          if (next) {
            dispatchUi({ type: 'UI_SET_TIME_INPUT', value: next });
          }
        }}
        onBlur={() => {
          nativePickerOpenRef.current = false;
        }}
        className="sr-only"
      />

      {dueDate || time || reminder || repeatType !== 'none' ? (
        <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-slate-200 pt-3">
          {dueDate && repeatType === 'none' ? (
            <button
              type="button"
              onClick={() => onDueDateChange(null)}
              className="rounded-full bg-slate-200 px-2 py-1 text-xs font-medium text-slate-600 transition hover:bg-slate-300"
            >
              {time ? `日期: ${dueDate}` : `${dueDate} · 全天`} ×
            </button>
          ) : null}

          {time ? (
            <button
              type="button"
              onClick={() => onTimeChange(null)}
              className="rounded-full bg-slate-200 px-2 py-1 text-xs font-medium text-slate-600 transition hover:bg-slate-300"
            >
              时间: {time} ×
            </button>
          ) : null}

          {reminder?.type === 'relative' ? (
            <button
              type="button"
              onClick={() => onReminderChange(null)}
              className="rounded-full bg-amber-100 px-2 py-1 text-xs font-medium text-amber-700 transition hover:bg-amber-200"
            >
              提醒: 提前{reminder.offsetMinutes}m ×
            </button>
          ) : null}

          {repeatType !== 'none' ? (
            <button
              type="button"
              onClick={() => onRepeatTypeChange('none')}
              className="rounded-full bg-blue-100 px-2 py-1 text-xs font-medium text-linkflow-accent transition hover:bg-blue-200"
            >
              {repeatType === 'daily'
                ? '重复: 每天'
                : repeatType === 'weekly'
                  ? `重复: 每周${repeatDaysOfWeek.map((day) => WEEK_LABELS[day]).join('/')}`
                  : `重复: 每月${repeatDaysOfMonth.join('/') || '-'}号`}
              {' ×'}
            </button>
          ) : null}
        </div>
      ) : null}

      {(actions?.length ?? 0) > 0 ? (
        <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-slate-200 pt-3">
          {actions?.map((action) => (
            <span key={action.key} className="rounded-full bg-blue-100 px-2 py-1 text-xs font-medium text-linkflow-accent">
              {action.label}
            </span>
          ))}
        </div>
      ) : null}
            </>
          }
        />
      ) : null}
    </div>
  );
});
