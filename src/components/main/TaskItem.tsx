import { Pencil, Trash2 } from 'lucide-react';
import type { List, Task, UrlScheme } from '../../types/models';

interface TaskItemProps {
  task: Task;
  actionSchemes: UrlScheme[];
  list?: List;
  showListInfo?: boolean;
  onToggleCompleted: (taskId: string) => void;
  onDeleteTask: (taskId: string) => void;
  onExecuteAction: (task: Task, actionSchemeId: string) => void;
  onEditTask: (task: Task) => void;
}

export function TaskItem({
  task,
  actionSchemes,
  list,
  showListInfo,
  onToggleCompleted,
  onDeleteTask,
  onExecuteAction,
  onEditTask,
}: TaskItemProps) {
  const taskActions = task.actions ?? [];
  const hasActionBinding = taskActions.length > 0;
  const unavailableActionCount = taskActions.filter(
    (action) => !actionSchemes.some((scheme) => scheme.id === action.schemeId),
  ).length;

  const weekLabels = ['日', '一', '二', '三', '四', '五', '六'];

  return (
    <article className="flex items-center gap-3 rounded-2xl border border-gray-200/70 bg-white px-4 py-3.5 transition hover:bg-gray-50/60">
      <input
        type="checkbox"
        checked={task.completed}
        onChange={() => onToggleCompleted(task.id)}
        className="h-4 w-4 rounded border-gray-300 text-linkflow-accent focus:ring-1 focus:ring-gray-300/40"
      />
      <div className="min-w-0 flex-1">
        <p className="truncate text-[15px] font-medium tracking-[0.01em] text-gray-800">{task.title}</p>
        {task.detail ? <p className="mt-1 truncate text-xs text-gray-500">{task.detail}</p> : null}
        <div className="mt-1.5 flex items-center gap-2 text-xs tracking-[0.01em] text-gray-400">
          {showListInfo ? (
            <span className="rounded-full bg-gray-100 px-2 py-1 text-[13px] text-gray-500">
              {list ? `${list.icon} ${list.name}` : '∅ 无列表'}
            </span>
          ) : null}
          {task.date ? <span>{task.date}</span> : null}
          {task.time ? <span>{task.time}</span> : null}
          {task.reminder ? <span>提醒({task.reminderOffsetMinutes ?? 10}m前)</span> : null}
          {task.repeat ? (
            <span>
              {task.repeat.type === 'daily'
                ? '每天'
                : task.repeat.type === 'weekly'
                  ? `每周${(task.repeat.dayOfWeek ?? []).map((day) => weekLabels[day]).join('/')}`
                  : `每月${(task.repeat.dayOfMonth ?? []).join('/')}号`}
            </span>
          ) : null}
        </div>
      </div>

      <button
        type="button"
        onClick={() => onEditTask(task)}
        className="rounded-xl p-1.5 text-gray-400 transition hover:bg-gray-100 hover:text-gray-600"
        title="编辑任务"
      >
        <Pencil size={14} />
      </button>
      <button
        type="button"
        onClick={() => onDeleteTask(task.id)}
        className="rounded-xl p-1.5 text-gray-400 transition hover:bg-red-50 hover:text-red-500"
        title="删除任务"
      >
        <Trash2 size={14} />
      </button>

      {hasActionBinding ? (
        <div className="flex flex-wrap justify-end gap-1.5">
          {actionSchemes.map((scheme) => {
            const actionLabel = `${scheme.icon} ${scheme.name}${scheme.kind === 'script' ? ' · 脚本' : ''}`;
            return (
              <button
                key={scheme.id}
                type="button"
                onClick={() => onExecuteAction(task, scheme.id)}
                className="max-w-48 truncate rounded-full bg-gray-100 px-3 py-1 text-xs font-medium text-gray-600 transition hover:bg-gray-200"
                title={actionLabel}
              >
                {actionLabel}
              </button>
            );
          })}
          {unavailableActionCount > 0 ? (
            <span className="rounded-full bg-gray-200 px-3 py-1 text-xs text-gray-500">
              {unavailableActionCount} 个动作不可用
            </span>
          ) : null}
        </div>
      ) : null}
    </article>
  );
}
