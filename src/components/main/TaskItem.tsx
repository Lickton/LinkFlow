import { FileText, Trash2 } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import type { List, RepeatType, Task, UrlScheme } from '../../types/models';
import { toRelativeReminder } from '../../utils/schedule';
import {
  TaskRoundCheckbox,
} from './TaskCardPrimitives';
import { TaskScheduleToolbar } from './TaskScheduleToolbar';
import { toggleNumberSelection } from './taskScheduleShared';

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
    draftRef.current = draft;
  }, [draft]);

  useEffect(() => {
    if (isExpanded) {
      const nextDraft = draftFromTask(task);
      draftRef.current = nextDraft;
      setDraft(nextDraft);
      const nextListValue = task.listId ?? '__none__';
      setSelectedListId(nextListValue);
    }
  }, [isExpanded, task.listId]);

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

  const applyRepeatDraft = (next: Pick<EditDraft, 'repeatType' | 'repeatDaysOfWeek' | 'repeatDaysOfMonth'>) => {
    draftRef.current = { ...draftRef.current, ...next };
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

  const listSelectOptions = [{ value: '__none__', label: '无' }, ...lists.map((item) => ({ value: item.id, label: item.name }))];
  return (
    <article
      data-task-item-id={task.id}
      className={`group relative rounded-lg transition-[background-color] duration-[200ms] ease-[cubic-bezier(0.25,0.8,0.25,1)] hover:bg-gray-50/60 ${
        activePanel ? 'z-20' : 'z-0'
      }`}
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
            <div className={`min-h-0 ${activePanel ? 'overflow-visible' : 'overflow-hidden'}`}>
              <div className="space-y-2.5 pb-1" onClick={stopRowToggle}>
                <TaskScheduleToolbar
                  mode="edit"
                  dueDate={draft.dueDate || null}
                  time={draft.time || null}
                  reminder={draft.reminderEnabled ? toRelativeReminder(draft.reminderMinutes) : null}
                  repeatType={draft.repeatType}
                  repeatDaysOfWeek={draft.repeatDaysOfWeek}
                  repeatDaysOfMonth={draft.repeatDaysOfMonth}
                  actionChips={actionSchemes.map((scheme) => ({
                    key: scheme.id,
                    label: `${scheme.icon} ${scheme.name}`,
                    title: `${scheme.icon} ${scheme.name}`,
                    onClick: () => onExecuteAction(task, scheme.id),
                  }))}
                  unavailableActionsLabel={unavailableActionCount > 0 ? `${unavailableActionCount} 个动作不可用` : null}
                  showListPicker
                  listOptions={listSelectOptions}
                  selectedListValue={selectedListId}
                  onSelectedListChange={(value) => setTaskList(value === '__none__' ? undefined : value ?? undefined)}
                  onDueDateChange={(value) => {
                    const nextDate = value ?? '';
                    const nextReminderEnabled = Boolean(nextDate && draftRef.current.time && draftRef.current.reminderEnabled);
                    const nextDraft = {
                      ...draftRef.current,
                      dueDate: nextDate,
                      reminderEnabled: nextReminderEnabled,
                    };
                    draftRef.current = nextDraft;
                    setDraft(nextDraft);
                    commitPatch({ dueDate: value, reminder: nextReminderEnabled ? toRelativeReminder(nextDraft.reminderMinutes) : null });
                  }}
                  onTimeChange={(value) => {
                    const nextTime = value ?? '';
                    const nextReminderEnabled = Boolean(nextTime && draftRef.current.reminderEnabled);
                    const nextDraft = {
                      ...draftRef.current,
                      time: nextTime,
                      reminderEnabled: nextReminderEnabled,
                    };
                    draftRef.current = nextDraft;
                    setDraft(nextDraft);
                    commitPatch({ time: value, reminder: nextReminderEnabled ? toRelativeReminder(nextDraft.reminderMinutes) : null });
                  }}
                  onReminderChange={(value) => {
                    const nextDraft = {
                      ...draftRef.current,
                      reminderEnabled: value?.type === 'relative',
                      reminderMinutes: value?.type === 'relative' ? value.offsetMinutes : draftRef.current.reminderMinutes,
                    };
                    draftRef.current = nextDraft;
                    setDraft(nextDraft);
                    commitPatch({ reminder: value });
                  }}
                  onRepeatTypeChange={(value) =>
                    applyRepeatDraft({
                      repeatType: value,
                      repeatDaysOfWeek: draftRef.current.repeatDaysOfWeek,
                      repeatDaysOfMonth: draftRef.current.repeatDaysOfMonth,
                    })
                  }
                  onToggleRepeatWeekDay={(day) => {
                    const current = draftRef.current.repeatDaysOfWeek;
                    const next = toggleNumberSelection(current, day);
                    applyRepeatDraft({
                      repeatType: 'weekly',
                      repeatDaysOfWeek: next,
                      repeatDaysOfMonth: draftRef.current.repeatDaysOfMonth,
                    });
                  }}
                  onSetRepeatMonthDays={(days) =>
                    applyRepeatDraft({
                      repeatType: days.length ? 'monthly' : 'none',
                      repeatDaysOfWeek: draftRef.current.repeatDaysOfWeek,
                      repeatDaysOfMonth: days,
                    })
                  }
                  onOpenActionPicker={() => onOpenActionPicker(task)}
                  onPanelOpenChange={(open) => setActivePanel(open ? 'repeat' : null)}
                />

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

                {hasActionBinding ? null : null}
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
