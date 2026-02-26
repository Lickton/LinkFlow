import { Search, X } from 'lucide-react';
import { useEffect, useRef } from 'react';
import type { Ref } from 'react';
import type { List, RepeatType, Task, TaskReminder, UrlScheme } from '../../types/models';
import { Header } from './Header';
import { TaskInputArea, type TaskInputAreaHandle } from './TaskInputArea';
import { TaskList } from './TaskList';

interface MainContentActionPreview {
  key: string;
  label: string;
  params: string[];
}

interface MainContentProps {
  title: string;
  activeView: 'list' | 'completed';
  isAllTasksView: boolean;
  allTasksListId: string;
  lists: List[];
  visibleTasks: Task[];
  schemes: UrlScheme[];
  draftTitle: string;
  draftDetail: string;
  draftDueDate?: string | null;
  draftTime?: string | null;
  draftReminder?: TaskReminder;
  draftRepeatType: RepeatType | 'none';
  draftRepeatDaysOfWeek: number[];
  draftRepeatDaysOfMonth: number[];
  draftActions?: MainContentActionPreview[];
  draftListId?: string | null;
  searchQuery: string;
  taskFilter: 'all' | 'today' | 'overdue' | 'upcoming';
  onDraftTitleChange: (value: string) => void;
  onDraftDetailChange: (value: string) => void;
  onDraftDueDateChange: (value: string | null) => void;
  onDraftTimeChange: (value: string | null) => void;
  onDraftReminderChange: (value: TaskReminder) => void;
  onBeforeOpenDraftReminder?: () => Promise<boolean> | boolean;
  onDraftRepeatTypeChange: (value: RepeatType | 'none') => void;
  onDraftToggleRepeatWeekDay: (value: number) => void;
  onDraftSetRepeatMonthDays: (value: number[]) => void;
  onDraftListChange: (value: string | null) => void;
  onSubmitTask: () => void | Promise<void>;
  onCancelDraftTask?: () => void;
  onOpenActionPicker: () => void;
  onSearchChange: (value: string) => void;
  onTaskFilterChange: (value: 'all' | 'today' | 'overdue' | 'upcoming') => void;
  onToggleCompleted: (taskId: string) => void;
  onDeleteTask: (taskId: string) => void;
  onUpdateTask: (taskId: string, patch: Partial<Task>) => void;
  onExecuteAction: (task: Task, actionSchemeId: string) => void;
  onOpenTaskActionPicker: (task: Task) => void;
  suspendEditorAutoCollapse?: boolean;
  showTaskInputArea?: boolean;
  contentBottomInset?: number;
  fillViewport?: boolean;
  quickEntryRef?: Ref<TaskInputAreaHandle>;
}

export function MainContent({
  title,
  activeView,
  isAllTasksView,
  allTasksListId,
  lists,
  visibleTasks,
  schemes,
  draftTitle,
  draftDetail,
  draftDueDate,
  draftTime,
  draftReminder,
  draftRepeatType,
  draftRepeatDaysOfWeek,
  draftRepeatDaysOfMonth,
  draftActions,
  draftListId,
  searchQuery,
  taskFilter: _taskFilter,
  onDraftTitleChange,
  onDraftDetailChange,
  onDraftDueDateChange,
  onDraftTimeChange,
  onDraftReminderChange,
  onBeforeOpenDraftReminder,
  onDraftRepeatTypeChange,
  onDraftToggleRepeatWeekDay,
  onDraftSetRepeatMonthDays,
  onDraftListChange,
  onSubmitTask,
  onCancelDraftTask,
  onOpenActionPicker,
  onSearchChange,
  onTaskFilterChange: _onTaskFilterChange,
  onToggleCompleted,
  onDeleteTask,
  onUpdateTask,
  onExecuteAction,
  onOpenTaskActionPicker,
  suspendEditorAutoCollapse = false,
  showTaskInputArea = true,
  contentBottomInset = 0,
  fillViewport = false,
  quickEntryRef,
}: MainContentProps) {
  const subtitle = activeView === 'completed' ? '全部已完成任务' : '';
  const searchInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    _onTaskFilterChange('all');
  }, [_onTaskFilterChange]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.metaKey && !event.ctrlKey && !event.altKey && event.key.toLowerCase() === 'f') {
        event.preventDefault();
        requestAnimationFrame(() => {
          searchInputRef.current?.focus();
          searchInputRef.current?.select();
        });
      }
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);

  return (
    <section
      className="relative flex h-full min-w-0 flex-1 flex-col bg-slate-50 p-3 sm:p-4 md:p-6"
      style={{
        paddingBottom: contentBottomInset > 0 ? `${contentBottomInset}px` : undefined,
        minHeight: fillViewport ? `calc(100dvh - ${contentBottomInset}px)` : undefined,
      }}
    >
      <Header
        title={title}
        subtitle={subtitle}
        showDate={false}
        rightContent={
          <div className="flex w-[280px] items-center gap-2 rounded-xl bg-white px-3 py-2 shadow-[0_8px_20px_rgba(15,23,42,0.06)] ring-1 ring-slate-200/80">
            <Search size={14} className="text-slate-400" />
            <input
              ref={searchInputRef}
              value={searchQuery}
              onChange={(event) => onSearchChange(event.target.value)}
              placeholder="搜索任务"
              className="min-w-0 flex-1 bg-transparent text-sm font-medium text-slate-800 outline-none placeholder:text-slate-400"
            />
            {searchQuery ? (
              <button
                type="button"
                onClick={() => onSearchChange('')}
                className="rounded-md p-1 text-slate-400 transition hover:bg-slate-100 hover:text-slate-600"
                aria-label="清空搜索"
              >
                <X size={14} />
              </button>
            ) : null}
          </div>
        }
      />

      {activeView === 'completed' || !showTaskInputArea ? null : (
        <TaskInputArea
          ref={quickEntryRef}
          value={draftTitle}
          detail={draftDetail}
          dueDate={draftDueDate ?? null}
          time={draftTime ?? null}
          reminder={draftReminder ?? null}
          repeatType={draftRepeatType}
          repeatDaysOfWeek={draftRepeatDaysOfWeek}
          repeatDaysOfMonth={draftRepeatDaysOfMonth}
          actions={draftActions}
          showListPicker={isAllTasksView}
          lists={lists.filter((list) => !isAllTasksView || list.id !== allTasksListId)}
          selectedListId={draftListId}
          onChange={onDraftTitleChange}
          onDetailChange={onDraftDetailChange}
          onDueDateChange={onDraftDueDateChange}
          onTimeChange={onDraftTimeChange}
          onReminderChange={onDraftReminderChange}
          onBeforeOpenReminder={onBeforeOpenDraftReminder}
          onRepeatTypeChange={onDraftRepeatTypeChange}
          onToggleRepeatWeekDay={onDraftToggleRepeatWeekDay}
          onSetRepeatMonthDays={onDraftSetRepeatMonthDays}
          onSelectedListChange={onDraftListChange}
          onSubmit={onSubmitTask}
          onCancelDraft={onCancelDraftTask}
          onOpenActionPicker={onOpenActionPicker}
          suspendAutoCollapse={suspendEditorAutoCollapse}
        />
      )}

      <div className="min-h-0 flex-1">
        <TaskList
          tasks={visibleTasks}
          lists={lists}
          schemes={schemes}
          showListInfo={isAllTasksView}
          showCreateHint={activeView !== 'completed'}
          onToggleCompleted={onToggleCompleted}
          onDeleteTask={onDeleteTask}
          onUpdateTask={onUpdateTask}
          onExecuteAction={onExecuteAction}
          onOpenTaskActionPicker={onOpenTaskActionPicker}
          suspendAutoCollapse={suspendEditorAutoCollapse}
        />
      </div>
    </section>
  );
}
