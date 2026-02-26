import { Bell, Calendar, FileText, Link2, Repeat2, Trash2 } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { AppSelect } from '../common/AppSelect';
import type { List, RepeatType, Task, UrlScheme } from '../../types/models';
import { toRelativeReminder } from '../../utils/schedule';
import { TaskControlPopover, TaskRoundCheckbox } from './TaskCardPrimitives';

interface TaskItemProps {
  task: Task;
  isExpanded: boolean;
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
    'ArrowLeft',
    'ArrowRight',
    'ArrowUp',
    'ArrowDown',
    'Home',
    'End',
  ].includes(event.key);
}

export function TaskItem({
  task,
  isExpanded,
  actionSchemes,
  list,
  showListInfo,
  onToggleCompleted,
  onDeleteTask,
  onUpdateTask,
  onExecuteAction,
  onOpenActionPicker,
  onToggleDetail,
}: TaskItemProps) {
  const [draft, setDraft] = useState<EditDraft>(() => draftFromTask(task));
  const [activePanel, setActivePanel] = useState<'repeat' | null>(null);
  const [isDetailEditing, setIsDetailEditing] = useState(false);
  const [shouldRenderExpanded, setShouldRenderExpanded] = useState(isExpanded);
  const [expandedVisible, setExpandedVisible] = useState(isExpanded);
  const wasExpandedRef = useRef(isExpanded);
  const detailTextareaRef = useRef<HTMLTextAreaElement>(null);
  const hasDetail = Boolean(task.detail?.trim());
  const hasDraftDetail = Boolean(draft.detail.trim());
  const taskActions = task.actions ?? [];
  const hasActionBinding = taskActions.length > 0;
  const unavailableActionCount = taskActions.filter(
    (action) => !actionSchemes.some((scheme) => scheme.id === action.schemeId),
  ).length;

  useEffect(() => {
    if (isExpanded) {
      setDraft(draftFromTask(task));
    }
  }, [isExpanded, task]);

  useEffect(() => {
    if (!isExpanded) {
      setActivePanel(null);
      setIsDetailEditing(false);
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
    const nextTitle = draft.title.trim() || task.title;
    const nextDetail = draft.detail.trim() || undefined;
    const nextDueDate = draft.dueDate || null;
    const nextTime = draft.time || null;
    const nextReminder = draft.reminderEnabled ? toRelativeReminder(draft.reminderMinutes) : null;
    const nextRepeat =
      draft.repeatType === 'none'
        ? null
        : {
            type: draft.repeatType,
            ...(draft.repeatType === 'weekly' ? { dayOfWeek: draft.repeatDaysOfWeek } : {}),
            ...(draft.repeatType === 'monthly' ? { dayOfMonth: draft.repeatDaysOfMonth } : {}),
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
      if (event.key !== '-' && event.key !== '=' && event.key !== '+') {
        return;
      }
      event.preventDefault();
      event.stopPropagation();
      const delta = event.key === '-' ? -1 : 1;

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

      const currentValue = Number(event.currentTarget.value);
      const baseMinutes = Number.isFinite(currentValue) ? currentValue : draft.reminderMinutes;
      const nextMinutes = Math.max(0, baseMinutes + delta);
      setDraft((prev) => ({ ...prev, reminderMinutes: nextMinutes, reminderEnabled: true }));
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
    if (event.key === '-' || event.key === '=' || event.key === '+') {
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
                  {(draft.dueDate || draft.time) ? (
                    <label className={rowTagBase}>
                      <Calendar size={13} className="text-slate-400" />
                      {draft.dueDate ? (
                        <input
                          type="date"
                          value={draft.dueDate}
                          onChange={(event) => setDraft((prev) => ({ ...prev, dueDate: event.target.value }))}
                          onKeyDown={withRestrictedStepKeys('date')}
                          onPaste={(event) => event.preventDefault()}
                          onBlur={() => commitPatch({ dueDate: draft.dueDate || null })}
                          className="min-w-0 bg-transparent text-[12px] font-medium text-slate-600 outline-none"
                        />
                      ) : (
                        <span className="text-[12px] text-slate-500">日期</span>
                      )}
                      {draft.time ? <span className="text-slate-400">·</span> : null}
                      {draft.time ? (
                        <input
                          type="time"
                          value={draft.time}
                          onChange={(event) => setDraft((prev) => ({ ...prev, time: event.target.value }))}
                          onKeyDown={withRestrictedStepKeys('time')}
                          onPaste={(event) => event.preventDefault()}
                          onBlur={() => commitPatch({ time: draft.time || null })}
                          className="w-[62px] bg-transparent text-[12px] font-medium text-slate-600 outline-none"
                        />
                      ) : null}
                    </label>
                  ) : null}

                  {draft.reminderEnabled ? (
                    <label className={rowTagBase}>
                      <Bell size={13} className="text-slate-400" />
                      <span>提前</span>
                      <input
                        type="number"
                        min={0}
                        value={draft.reminderMinutes}
                        onChange={(event) =>
                          setDraft((prev) => ({
                            ...prev,
                            reminderMinutes: Math.max(0, Number(event.target.value) || 0),
                          }))
                        }
                        onKeyDown={withRestrictedStepKeys('reminder')}
                        onPaste={(event) => event.preventDefault()}
                        onBlur={() => commitPatch({ reminder: toRelativeReminder(draft.reminderMinutes) })}
                        className="w-9 bg-transparent text-[12px] font-medium text-slate-600 outline-none"
                      />
                      <span>分钟</span>
                    </label>
                  ) : null}

                  {draft.repeatType !== 'none' || activePanel === 'repeat' ? (
                    <div className="relative">
                    <button
                      type="button"
                      onClick={() => setActivePanel((prev) => (prev === 'repeat' ? null : 'repeat'))}
                      className={rowTagInteractive}
                    >
                      <Repeat2 size={13} className="text-slate-400" />
                      <span>{getRepeatSummaryLabel(draft.repeatType, draft.repeatDaysOfWeek, draft.repeatDaysOfMonth)}</span>
                    </button>
                    {activePanel === 'repeat' ? (
                      <TaskControlPopover className="w-[300px]">
                        <div onClick={stopRowToggle} className="space-y-2">
                          <div className="flex items-center gap-2">
                            <span className="text-xs text-slate-400">重复</span>
                            <AppSelect
                              value={draft.repeatType}
                              onChange={(selected) =>
                                applyRepeatDraft({
                                  repeatType: selected as RepeatType | 'none',
                                  repeatDaysOfWeek: draft.repeatDaysOfWeek,
                                  repeatDaysOfMonth: draft.repeatDaysOfMonth,
                                })
                              }
                              options={[
                                { value: 'none', label: '不重复' },
                                { value: 'daily', label: '每天' },
                                { value: 'weekly', label: '每周' },
                                { value: 'monthly', label: '每月' },
                              ]}
                              className="w-28"
                            />
                          </div>
                          {draft.repeatType === 'weekly' ? (
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
                          ) : null}
                          {draft.repeatType === 'monthly' ? (
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
                          ) : null}
                        </div>
                      </TaskControlPopover>
                    ) : null}
                    </div>
                  ) : null}

                  <button type="button" onClick={() => onOpenActionPicker(task)} className={rowTagInteractive}>
                    <Link2 size={13} className="text-slate-400" />
                    <span>动作</span>
                  </button>

                  {showListInfo && list ? (
                    <div className={`${rowTagBase} ml-auto`}>
                      <span className="text-slate-500">{`${list.icon} ${list.name}`}</span>
                    </div>
                  ) : null}
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
