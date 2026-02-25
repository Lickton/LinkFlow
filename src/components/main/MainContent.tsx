import type { List, RepeatType, Task, TaskReminder, UrlScheme } from '../../types/models';
import { AppSelect } from '../common/AppSelect';
import { Header } from './Header';
import { TaskInputArea } from './TaskInputArea';
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
  onSubmitTask: () => void;
  onOpenActionPicker: () => void;
  onSearchChange: (value: string) => void;
  onTaskFilterChange: (value: 'all' | 'today' | 'overdue' | 'upcoming') => void;
  onToggleCompleted: (taskId: string) => void;
  onDeleteTask: (taskId: string) => void;
  onExecuteAction: (task: Task, actionSchemeId: string) => void;
  onEditTask: (task: Task) => void;
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
  taskFilter,
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
  onOpenActionPicker,
  onSearchChange,
  onTaskFilterChange,
  onToggleCompleted,
  onDeleteTask,
  onExecuteAction,
  onEditTask,
}: MainContentProps) {
  const subtitle = activeView === 'completed' ? '全部已完成任务' : '';

  return (
    <section className="flex h-full min-w-0 flex-1 flex-col bg-slate-50 p-6">
      <Header title={title} subtitle={subtitle} />

      {activeView === 'completed' ? null : (
        <TaskInputArea
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
          onOpenActionPicker={onOpenActionPicker}
        />
      )}

      <div className="mb-3 rounded-xl border border-slate-200 bg-white p-3 shadow-[0_4px_14px_rgba(15,23,42,0.05)]">
        <div className="flex flex-wrap items-center gap-2">
          <input
            value={searchQuery}
            onChange={(event) => onSearchChange(event.target.value)}
            placeholder="搜索任务标题或详情"
            className="h-10 min-w-48 flex-1 rounded-xl border border-slate-300/80 bg-slate-50 px-3 text-sm font-medium text-slate-800 outline-none focus:border-blue-300 focus:ring-2 focus:ring-linkflow-accent/15"
          />
          <AppSelect
          value={taskFilter}
          onChange={(value) => onTaskFilterChange(value as 'all' | 'today' | 'overdue' | 'upcoming')}
          options={[
            { value: 'all', label: '全部时间' },
            { value: 'today', label: '今天' },
            { value: 'overdue', label: '逾期' },
            { value: 'upcoming', label: '未来' },
          ]}
            className="w-36"
          />
        </div>
      </div>

      <div className="mb-3 border-t border-slate-200" />

      <div className="min-h-0 flex-1">
        <TaskList
          tasks={visibleTasks}
          lists={lists}
          schemes={schemes}
          showListInfo={isAllTasksView}
          showCreateHint={activeView !== 'completed'}
          onToggleCompleted={onToggleCompleted}
          onDeleteTask={onDeleteTask}
          onExecuteAction={onExecuteAction}
          onEditTask={onEditTask}
        />
      </div>
    </section>
  );
}
