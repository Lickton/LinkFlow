import { Circle } from 'lucide-react';
import { forwardRef, useEffect, useImperativeHandle, useLayoutEffect, useMemo, useRef, useState } from 'react';
import type { List, RepeatType, TaskReminder } from '../../types/models';
import { TaskScheduleToolbar } from './TaskScheduleToolbar';

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
  const titleInputRef = useRef<HTMLInputElement>(null);
  const detailTextareaRef = useRef<HTMLTextAreaElement>(null);
  const launcherButtonRef = useRef<HTMLButtonElement>(null);
  const composerCardRef = useRef<HTMLDivElement>(null);
  const rootRef = useRef<HTMLDivElement>(null);

  const canSubmit = value.trim().length > 0;
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
  const listOptions = useMemo(
    () => [
      { value: '__none__', label: '无' },
      ...((lists ?? []).map((list) => ({
        value: list.id,
        label: list.name,
      })) as { value: string; label: string }[]),
    ],
    [lists],
  );
  const selectedListValue = selectedListId ?? '__none__';

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
  }, [isExpanded, value, detail, dueDate, time, reminder, repeatType, actions]);

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

      if (rootRef.current?.contains(target)) {
        return;
      }

      closeQuickEntry();
    };

    document.addEventListener('mousedown', onPointerDown);
    return () => document.removeEventListener('mousedown', onPointerDown);
  }, [isExpanded, suspendAutoCollapse]);

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
    // Shared toolbar manages its own internal popovers now.
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
        <div
          ref={composerCardRef}
          className="group absolute left-0 right-0 top-0 z-20 transition-all duration-150"
        >
          <article className="rounded-lg transition-[background-color] duration-[200ms] ease-[cubic-bezier(0.25,0.8,0.25,1)] hover:bg-gray-50/60">
            <div className="flex min-h-11 items-start gap-3 px-3 py-2">
              <div className="mt-1 shrink-0">
                <Circle size={18} className="text-slate-300" />
              </div>

              <div className="min-w-0 flex-1">
                <div className="flex items-start gap-3">
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
                    className="min-w-0 flex-1 bg-transparent py-0.5 text-[15px] font-semibold tracking-[0.01em] text-slate-900 outline-none placeholder:font-medium placeholder:text-slate-400"
                  />

                  <button
                    type="button"
                    onClick={submitQuickEntry}
                    disabled={!canSubmit}
                    className={`shrink-0 rounded-xl px-4 py-2 text-sm font-semibold transition ${
                      canSubmit
                        ? 'bg-slate-900 text-white shadow-sm hover:bg-slate-800'
                        : 'cursor-not-allowed bg-slate-200 text-slate-400'
                    }`}
                  >
                    创建
                  </button>
                </div>

                <div className="mt-2">
                  <TaskScheduleToolbar
                    mode="create"
                    dueDate={dueDate}
                    time={time}
                    reminder={reminder}
                    repeatType={repeatType}
                    repeatDaysOfWeek={repeatDaysOfWeek}
                    repeatDaysOfMonth={repeatDaysOfMonth}
                    actionChips={actions?.map((action) => ({
                      key: action.key,
                      label: action.label,
                    }))}
                    showListPicker={showListPicker}
                    listOptions={listOptions}
                    selectedListValue={selectedListValue}
                    onSelectedListChange={onSelectedListChange}
                    onDueDateChange={onDueDateChange}
                    onTimeChange={onTimeChange}
                    onReminderChange={onReminderChange}
                    onBeforeOpenReminder={onBeforeOpenReminder}
                    onRepeatTypeChange={onRepeatTypeChange}
                    onToggleRepeatWeekDay={onToggleRepeatWeekDay}
                    onSetRepeatMonthDays={onSetRepeatMonthDays}
                    onOpenActionPicker={onOpenActionPicker}
                  />

                  <div className="px-0.5 py-0.5">
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
                        className="w-full resize-none bg-transparent px-0 py-0 text-[13px] leading-6 text-slate-600 outline-none placeholder:text-slate-400"
                      />
                    </label>
                  </div>
                </div>
              </div>
            </div>
          </article>
        </div>
      ) : null}
    </div>
  );
});
