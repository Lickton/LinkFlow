import type { List, RepeatType, Task, UrlScheme } from '../../types/models';
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
  draftDate?: string;
  draftTime?: string;
  draftReminder?: boolean;
  draftReminderOffsetMinutes?: number;
  draftRepeatType: RepeatType | 'none';
  draftRepeatDaysOfWeek: number[];
  draftRepeatDaysOfMonth: number[];
  draftActions?: MainContentActionPreview[];
  draftListId?: string | null;
  onDraftTitleChange: (value: string) => void;
  onDraftDetailChange: (value: string) => void;
  onDraftDateChange: (value?: string) => void;
  onDraftTimeChange: (value?: string) => void;
  onDraftReminderChange: (value: boolean) => void;
  onDraftReminderOffsetChange: (value: number) => void;
  onDraftRepeatTypeChange: (value: RepeatType | 'none') => void;
  onDraftToggleRepeatWeekDay: (value: number) => void;
  onDraftSetRepeatMonthDays: (value: number[]) => void;
  onDraftListChange: (value: string | null) => void;
  onSubmitTask: () => void;
  onOpenActionPicker: () => void;
  onToggleCompleted: (taskId: string) => void;
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
  draftDate,
  draftTime,
  draftReminder,
  draftReminderOffsetMinutes,
  draftRepeatType,
  draftRepeatDaysOfWeek,
  draftRepeatDaysOfMonth,
  draftActions,
  draftListId,
  onDraftTitleChange,
  onDraftDetailChange,
  onDraftDateChange,
  onDraftTimeChange,
  onDraftReminderChange,
  onDraftReminderOffsetChange,
  onDraftRepeatTypeChange,
  onDraftToggleRepeatWeekDay,
  onDraftSetRepeatMonthDays,
  onDraftListChange,
  onSubmitTask,
  onOpenActionPicker,
  onToggleCompleted,
  onExecuteAction,
  onEditTask,
}: MainContentProps) {
  const subtitle =
    activeView === 'completed'
      ? '全部已完成任务'
      : isAllTasksView
        ? '全部未完成任务'
        : '当前列表中的未完成任务';

  return (
    <section className="flex min-w-0 flex-1 flex-col bg-white p-6">
      <Header title={title} subtitle={subtitle} />

      {activeView === 'completed' ? null : (
        <TaskInputArea
          value={draftTitle}
          detail={draftDetail}
          date={draftDate}
          time={draftTime}
          reminder={draftReminder}
          reminderOffsetMinutes={draftReminderOffsetMinutes}
          repeatType={draftRepeatType}
          repeatDaysOfWeek={draftRepeatDaysOfWeek}
          repeatDaysOfMonth={draftRepeatDaysOfMonth}
          actions={draftActions}
          showListPicker={isAllTasksView}
          lists={lists.filter((list) => !isAllTasksView || list.id !== allTasksListId)}
          selectedListId={draftListId}
          onChange={onDraftTitleChange}
          onDetailChange={onDraftDetailChange}
          onDateChange={onDraftDateChange}
          onTimeChange={onDraftTimeChange}
          onReminderChange={onDraftReminderChange}
          onReminderOffsetChange={onDraftReminderOffsetChange}
          onRepeatTypeChange={onDraftRepeatTypeChange}
          onToggleRepeatWeekDay={onDraftToggleRepeatWeekDay}
          onSetRepeatMonthDays={onDraftSetRepeatMonthDays}
          onSelectedListChange={onDraftListChange}
          onSubmit={onSubmitTask}
          onOpenActionPicker={onOpenActionPicker}
        />
      )}

      <TaskList
        tasks={visibleTasks}
        lists={lists}
        schemes={schemes}
        showListInfo={isAllTasksView}
        onToggleCompleted={onToggleCompleted}
        onExecuteAction={onExecuteAction}
        onEditTask={onEditTask}
      />
    </section>
  );
}
