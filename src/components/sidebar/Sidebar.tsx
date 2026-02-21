import { CheckCircle2, Pencil, Plus, Settings, Trash2 } from 'lucide-react';
import type { List } from '../../types/models';

interface SidebarProps {
  lists: List[];
  activeListId: string;
  activeView: 'list' | 'completed';
  onListClick: (listId: string) => void;
  onCreateList: () => void;
  onUpdateList: (list: List) => void;
  onDeleteList: (list: List) => void;
  onCompletedClick: () => void;
  onOpenSettings: () => void;
}

export function Sidebar({
  lists,
  activeListId,
  activeView,
  onListClick,
  onCreateList,
  onUpdateList,
  onDeleteList,
  onCompletedClick,
  onOpenSettings,
}: SidebarProps) {
  return (
    <aside className="flex h-full w-full min-w-0 flex-col bg-gray-50 p-4">
      <h1 className="px-2 pb-4 text-xl font-semibold text-gray-800">LinkFlow</h1>

      <nav className="flex-1 space-y-1 overflow-y-auto">
        {lists.map((list) => {
          const isActive = activeView === 'list' && activeListId === list.id;

          return (
            <div
              key={list.id}
              className={`flex w-full items-center gap-2 rounded-lg px-2 py-2 text-left text-sm transition ${
                isActive
                  ? 'bg-white text-linkflow-accent shadow-sm'
                  : 'text-gray-700 hover:bg-white/80'
              }`}
            >
              <button
                type="button"
                onClick={() => onListClick(list.id)}
                className="flex min-w-0 flex-1 items-center gap-2 text-left"
              >
                <span>{list.icon}</span>
                <span className="truncate">{list.name}</span>
              </button>
              <button
                type="button"
                onClick={() => onUpdateList(list)}
                className="rounded-md p-1 text-gray-400 transition hover:bg-gray-100 hover:text-gray-600"
                title="编辑列表"
              >
                <Pencil size={14} />
              </button>
              {list.id !== 'list_today' ? (
                <button
                  type="button"
                  onClick={() => onDeleteList(list)}
                  className="rounded-md p-1 text-gray-400 transition hover:bg-red-50 hover:text-red-500"
                  title="删除列表"
                >
                  <Trash2 size={14} />
                </button>
              ) : null}
            </div>
          );
        })}
      </nav>

      <div className="my-3 border-t border-gray-200" />

      <button
        type="button"
        onClick={onCompletedClick}
        className={`mb-3 flex w-full items-center gap-2 rounded-lg px-2 py-2 text-left text-sm transition ${
          activeView === 'completed'
            ? 'bg-white text-linkflow-accent shadow-sm'
            : 'text-gray-700 hover:bg-white/80'
        }`}
      >
        <CheckCircle2 size={16} />
        <span>已完成</span>
      </button>

      <div className="mt-auto space-y-1 pt-2">
        <button
          type="button"
          onClick={onCreateList}
          className="flex w-full items-center gap-2 rounded-lg px-2 py-2 text-left text-sm text-gray-500 transition hover:bg-white/80"
        >
          <Plus size={16} />
          <span>新建列表</span>
        </button>
        <button
          type="button"
          onClick={onOpenSettings}
          className="flex w-full items-center gap-2 rounded-lg px-2 py-2 text-left text-sm text-gray-500 transition hover:bg-white/80"
        >
          <Settings size={16} />
          <span>动作设置</span>
        </button>
      </div>
    </aside>
  );
}
