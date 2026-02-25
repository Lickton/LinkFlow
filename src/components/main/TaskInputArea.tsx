import { Bell, Calendar, ChevronDown, Clock3, Link2, Repeat2 } from 'lucide-react';
import { useMemo, useReducer, useRef } from 'react';
import type { ReactNode } from 'react';
import { AppSelect } from '../common/AppSelect';
import type { List, RepeatType, TaskReminder } from '../../types/models';
import { toRelativeReminder } from '../../utils/schedule';

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
  onSubmit: () => void;
  onOpenActionPicker: () => void;
}

const WEEK_LABELS = ['一', '二', '三', '四', '五', '六', '日'];
const QUICK_MONTH_DAYS = [1, 5, 10, 15, 20, 25, 31];
const REMINDER_PRESETS = [0, 1, 2, 5, 10];
const TIME_PRESETS = ['09:00', '12:00', '18:00', '21:00'];

type ActivePanel = 'detail' | 'time' | 'reminder' | 'repeat' | null;

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

export function TaskInputArea({
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
}: TaskInputAreaProps) {
  const dateInputRef = useRef<HTMLInputElement>(null);
  const timePickerInputRef = useRef<HTMLInputElement>(null);
  const [ui, dispatchUi] = useReducer(uiReducer, {
    ...initialUiState,
    timeInput: time ?? '00:00',
  });
  const shouldUseNativeTimePicker = /Android/i.test(window.navigator.userAgent);

  const monthDaysText = useMemo(() => repeatDaysOfMonth.join(','), [repeatDaysOfMonth]);
  const canSubmit = value.trim().length > 0;
  const reminderOffsetMinutes = reminder?.type === 'relative' ? reminder.offsetMinutes : 10;
  const canUseRelativeReminder = Boolean(dueDate && time);

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
    <section className="mb-6 rounded-xl border border-slate-300/80 bg-white p-4 shadow-[0_8px_22px_rgba(15,23,42,0.08)]">
      <div className="flex items-center gap-2">
        <input
          id="task-title-input"
          value={value}
          onChange={(event) => onChange(event.target.value)}
          placeholder="添加新任务"
          className="flex-1 border-none bg-transparent text-base font-semibold text-slate-900 outline-none placeholder:font-medium placeholder:text-slate-400"
        />
        <button
          type="button"
          onClick={onSubmit}
          disabled={!canSubmit}
          className={`rounded-xl px-4 py-2 text-sm font-semibold transition ${
            canSubmit
              ? 'bg-blue-600 text-white shadow-sm hover:bg-blue-700'
              : 'cursor-not-allowed bg-slate-300 text-slate-500'
          }`}
        >
          创建
        </button>
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-slate-200 pt-3">
        <ToolbarButton
          icon={<ChevronDown size={14} />}
          label="详情"
          active={ui.activePanel === 'detail' || Boolean(detail?.trim())}
          onClick={() =>
            dispatchUi({
              type: ui.activePanel === 'detail' ? 'UI_CLOSE_PANEL' : 'UI_OPEN_PANEL',
              panel: 'detail',
              currentTime: time,
            })
          }
        />

        {repeatType === 'none' ? (
          <ToolbarButton
            icon={<Calendar size={14} />}
            label="日期"
            active={Boolean(dueDate)}
            onClick={() => {
              const input = dateInputRef.current;
              if (!input) {
                return;
              }
              input.showPicker?.();
              input.focus();
            }}
          />
        ) : null}

        <ToolbarButton
          icon={<Clock3 size={14} />}
          label="时间"
          active={ui.activePanel === 'time' || Boolean(time)}
          onClick={() => {
            if (shouldUseNativeTimePicker) {
              const input = timePickerInputRef.current;
              if (!input) {
                return;
              }
              let opened = false;
              try {
                input.showPicker?.();
                opened = typeof input.showPicker === 'function';
              } catch {
                // Fallback to the in-panel editor when the WebView blocks showPicker.
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

        <ToolbarButton
          icon={<Bell size={14} />}
          label="提醒"
          active={ui.activePanel === 'reminder' || Boolean(reminder)}
          onClick={() => {
            if (ui.activePanel === 'reminder') {
              dispatchUi({ type: 'UI_CLOSE_PANEL' });
              return;
            }

            void (async () => {
              const canOpen = (await onBeforeOpenReminder?.()) ?? true;
              if (!canOpen) {
                return;
              }
              dispatchUi({
                type: 'UI_OPEN_PANEL',
                panel: 'reminder',
                currentTime: time,
              });
            })();
          }}
        />

        <ToolbarButton
          icon={<Repeat2 size={14} />}
          label="重复"
          active={ui.activePanel === 'repeat' || repeatType !== 'none'}
          onClick={() =>
            dispatchUi({
              type: ui.activePanel === 'repeat' ? 'UI_CLOSE_PANEL' : 'UI_OPEN_PANEL',
              panel: 'repeat',
              currentTime: time,
            })
          }
        />

        <ToolbarButton icon={<Link2 size={14} />} label="动作" highlight onClick={onOpenActionPicker} />

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

      {ui.activePanel ? (
        <div className="mt-3 rounded-2xl border border-slate-300/70 bg-slate-100/70 p-3 shadow-inner">
          {ui.activePanel === 'detail' ? (
            <label className="flex flex-col">
              <textarea
                value={detail ?? ''}
                onChange={(event) => onDetailChange(event.target.value)}
                rows={3}
                placeholder="输入任务详情..."
                className="w-full resize-none rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm text-slate-700 outline-none transition focus:ring-2 focus:ring-linkflow-accent/15"
              />
            </label>
          ) : null}

          {ui.activePanel === 'time' && !shouldUseNativeTimePicker ? (
            <div className="flex flex-col gap-2">
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-xs text-gray-400">快捷</span>
                {TIME_PRESETS.map((preset) => (
                  <button
                    key={preset}
                    type="button"
                    onClick={() => {
                      dispatchUi({ type: 'UI_SET_TIME_INPUT', value: preset });
                    }}
                    className="rounded-2xl border border-transparent bg-white px-3 py-2 text-xs font-medium text-gray-600 transition-all duration-150 hover:border-gray-200/70 hover:bg-gray-100"
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
                    className="rounded-2xl border border-transparent bg-white px-3 py-2 text-xs font-medium text-gray-500 transition-all duration-150 hover:border-gray-200/70 hover:bg-gray-100"
                  >
                    移除时间
                  </button>
                ) : null}
              </div>

              <div className="flex items-center gap-2">
                <span className="text-xs text-gray-400">输入</span>
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
                  className="h-8 w-[118px] rounded-2xl border border-gray-200/60 bg-white px-3 py-2 text-[14px] font-light tracking-[0.01em] text-gray-600 outline-none transition-all duration-150 hover:border-gray-300/70 hover:bg-gray-50 focus:border-gray-300 focus:ring-2 focus:ring-linkflow-accent/15"
                  autoFocus
                />
                <button
                  type="button"
                  onClick={() => commitTimeInput(false)}
                  className="rounded-2xl bg-blue-600 px-3 py-1.5 text-xs font-medium text-white transition hover:bg-blue-700"
                >
                  确认
                </button>
              </div>

              {ui.timeError ? <p className="text-xs text-red-500">{ui.timeError}</p> : null}
            </div>
          ) : null}

          {ui.activePanel === 'reminder' ? (
            <div className="flex flex-wrap items-center gap-2 transition-all duration-150">
              <button
                type="button"
                disabled={!canUseRelativeReminder}
                onClick={() =>
                  onReminderChange(reminder ? null : toRelativeReminder(reminderOffsetMinutes || 10))
                }
                className={`rounded-2xl border border-transparent px-3 py-2 text-xs font-medium transition-all duration-150 ${
                  reminder
                    ? 'bg-white text-gray-600 hover:border-gray-200/70'
                    : 'bg-white text-gray-500 hover:border-gray-200/70 hover:bg-gray-100'
                } ${!canUseRelativeReminder ? 'cursor-not-allowed opacity-40' : ''}`}
              >
                {reminder ? '已开启提醒' : '提醒已关闭'}
              </button>

              {!canUseRelativeReminder ? (
                <span className="text-xs text-gray-400">先设置日期和时间，才能使用提前提醒</span>
              ) : null}

              <span className="text-xs text-gray-400">提前</span>
              {REMINDER_PRESETS.map((preset) => (
                <button
                  key={preset}
                  type="button"
                  onClick={() => onReminderChange(toRelativeReminder(preset))}
                  disabled={!reminder || !canUseRelativeReminder}
                  className={`rounded-2xl border border-transparent px-3 py-2 text-xs font-medium transition-all duration-150 ${
                    reminderOffsetMinutes === preset
                      ? 'bg-white text-gray-700'
                      : 'bg-white text-gray-500 hover:border-gray-200/70 hover:bg-gray-100'
                  } ${!reminder || !canUseRelativeReminder ? 'cursor-not-allowed opacity-40' : ''}`}
                >
                  {preset}m
                </button>
              ))}

              <input
                type="number"
                min={0}
                value={reminderOffsetMinutes}
                onChange={(event) => {
                  const next = Math.max(0, Number(event.target.value) || 0);
                  onReminderChange(toRelativeReminder(next));
                }}
                disabled={!reminder || !canUseRelativeReminder}
                className="h-8 w-20 rounded-2xl border border-gray-200/60 bg-white px-3 py-2 text-xs font-light text-gray-600 outline-none transition-all duration-150 hover:border-gray-300/70 focus:border-gray-300 focus:ring-2 focus:ring-linkflow-accent/15"
              />
              <span className="text-xs text-gray-400">分钟</span>
            </div>
          ) : null}

          {ui.activePanel === 'repeat' ? (
            <div className="flex flex-col gap-2">
              <div className="flex flex-wrap items-center gap-2">
                <label className="text-xs text-gray-400">重复</label>
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
                          active
                            ? 'bg-linkflow-accent text-white'
                            : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
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
                            active
                              ? 'bg-linkflow-accent text-white'
                              : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                          }`}
                        >
                          {day}号
                        </button>
                      );
                    })}
                  </div>

                  <label className="flex items-center gap-2 text-xs text-gray-400">
                    自定义（逗号分隔）
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
                      className="flex-1 rounded-md border border-gray-200 px-2 py-1 text-xs text-gray-700 outline-none focus:ring-2 focus:ring-linkflow-accent/20"
                      placeholder="例如: 1,15,28"
                    />
                  </label>
                </>
              ) : null}
            </div>
          ) : null}
        </div>
      ) : null}

      <input
        ref={dateInputRef}
        type="date"
        value={dueDate ?? ''}
        onChange={(event) => onDueDateChange(event.target.value || null)}
        className="sr-only"
      />
      <input
        ref={timePickerInputRef}
        type="time"
        value={time ?? ''}
        onChange={(event) => {
          const next = event.target.value || null;
          onTimeChange(next);
          if (next) {
            dispatchUi({ type: 'UI_SET_TIME_INPUT', value: next });
          }
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
    </section>
  );
}

interface ToolbarButtonProps {
  icon: ReactNode;
  label: string;
  highlight?: boolean;
  active?: boolean;
  onClick?: () => void;
}

function ToolbarButton({ icon, label, highlight = false, active = false, onClick }: ToolbarButtonProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`inline-flex h-9 items-center gap-1 rounded-2xl border px-3 py-2 text-xs font-semibold transition-all duration-150 ${
        highlight
          ? 'border-slate-300/80 bg-slate-100 text-slate-700 hover:bg-slate-200'
          : active
            ? 'border-blue-200 bg-blue-50 text-linkflow-accent'
            : 'border-slate-300/80 bg-white text-slate-500 hover:bg-slate-100 hover:text-slate-700'
      }`}
    >
      {icon}
      <span>{label}</span>
    </button>
  );
}
