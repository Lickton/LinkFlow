import { ClipboardList, Sparkles } from 'lucide-react';
import type { List, Task, UrlScheme } from '../../types/models';
import { TaskItem } from './TaskItem';

interface TaskListProps {
  tasks: Task[];
  lists: List[];
  schemes: UrlScheme[];
  showListInfo?: boolean;
  showCreateHint?: boolean;
  onToggleCompleted: (taskId: string) => void;
  onDeleteTask: (taskId: string) => void;
  onExecuteAction: (task: Task, actionSchemeId: string) => void;
  onEditTask: (task: Task) => void;
}

export function TaskList({
  tasks,
  lists,
  schemes,
  showListInfo,
  showCreateHint,
  onToggleCompleted,
  onDeleteTask,
  onExecuteAction,
  onEditTask,
}: TaskListProps) {
  if (tasks.length === 0) {
    return (
      <div className="h-full rounded-2xl bg-slate-100/40 p-2">
        <div className="flex h-full min-h-[240px] items-center justify-center rounded-2xl border border-slate-300/70 bg-white p-6 shadow-[0_6px_18px_rgba(15,23,42,0.06)]">
          <div className="mx-auto flex max-w-xl flex-col items-center text-center">
            <div className="relative mb-3">
              <span className="absolute -right-2 -top-2 inline-flex h-6 w-6 items-center justify-center rounded-full bg-blue-100 text-linkflow-accent">
                <Sparkles size={12} className="animate-pulse" />
              </span>
              <span className="inline-flex h-16 w-16 items-center justify-center rounded-2xl bg-slate-100 text-slate-500 shadow-inner">
                <ClipboardList size={30} className="animate-bounce" />
              </span>
            </div>

            <h3 className="text-lg font-bold text-slate-800">
              {showCreateHint ? '任务清单还是空的' : '这里还没有已完成任务'}
            </h3>
            <p className="mt-2 text-sm font-medium text-slate-500">
              {showCreateHint
                ? '从一个小任务开始，快速建立你的节奏。'
                : '完成任务后会自动出现在这个列表中。'}
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="h-full space-y-2.5 overflow-y-auto rounded-2xl bg-slate-100/40 p-2">
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
            onDeleteTask={onDeleteTask}
            onExecuteAction={onExecuteAction}
            onEditTask={onEditTask}
          />
        );
      })}
    </div>
  );
}
