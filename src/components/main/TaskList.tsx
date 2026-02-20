import type { List, Task, UrlScheme } from '../../types/models';
import { TaskItem } from './TaskItem';

interface TaskListProps {
  tasks: Task[];
  lists: List[];
  schemes: UrlScheme[];
  showListInfo?: boolean;
  onToggleCompleted: (taskId: string) => void;
  onExecuteAction: (task: Task, actionSchemeId: string) => void;
  onEditTask: (task: Task) => void;
}

export function TaskList({
  tasks,
  lists,
  schemes,
  showListInfo,
  onToggleCompleted,
  onExecuteAction,
  onEditTask,
}: TaskListProps) {
  if (tasks.length === 0) {
    return <p className="rounded-2xl border border-gray-200/70 bg-white p-4 text-sm text-gray-400">暂无任务</p>;
  }

  return (
    <div className="space-y-2.5 overflow-y-auto">
      {tasks.map((task) => {
        const list = lists.find((item) => item.id === task.listId);
        const actionSchemes = (task.actions ?? [])
          .map((action) => schemes.find((item) => item.id === action.schemeId))
          .filter((item): item is UrlScheme => Boolean(item));

        return (
          <TaskItem
            key={task.id}
            task={task}
            actionSchemes={actionSchemes}
            list={list}
            showListInfo={showListInfo}
            onToggleCompleted={onToggleCompleted}
            onExecuteAction={onExecuteAction}
            onEditTask={onEditTask}
          />
        );
      })}
    </div>
  );
}
