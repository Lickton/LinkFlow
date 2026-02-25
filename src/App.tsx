import { isTauri } from '@tauri-apps/api/core';
import { isPermissionGranted } from '@tauri-apps/plugin-notification';
import { open as openExternal } from '@tauri-apps/plugin-shell';
import { useEffect, useState } from 'react';
import { AppLayout } from './components/layout/AppLayout';
import { MainContent } from './components/main/MainContent';
import { ActionPickerModal } from './components/modals/ActionPickerModal';
import { SettingsModal } from './components/modals/SettingsModal';
import { TaskEditModal } from './components/modals/TaskEditModal';
import { Sidebar } from './components/sidebar/Sidebar';
import { useAppStore } from './store/useAppStore';
import { executeTaskAction } from './utils/actionEngine';
import type { List, Task } from './types/models';

const ALL_TASKS_LIST_ID = 'list_today';
const isMacDesktop = () => /Macintosh|Mac OS X/i.test(window.navigator.userAgent);

function App() {
  const {
    lists,
    tasks,
    schemes,
    activeListId,
    activeView,
    draftTask,
    isHydrating,
    isHydrated,
    syncError,
    initFromBackend,
    setActiveList,
    addList,
    updateList,
    deleteList,
    setActiveView,
    updateDraftTask,
    dispatchDraftSchedule,
    addTaskFromDraft,
    toggleTaskCompleted,
    deleteTask,
    updateTask,
    addScheme,
    updateScheme,
    deleteScheme,
    exportBackup,
    importBackup,
  } = useAppStore();
  const [isActionPickerOpen, setIsActionPickerOpen] = useState(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [editingTaskId, setEditingTaskId] = useState<string | null>(null);
  const [isCreateListOpen, setIsCreateListOpen] = useState(false);
  const [newListName, setNewListName] = useState('');
  const [newListIcon, setNewListIcon] = useState('🗂️');
  const [isCreatingList, setIsCreatingList] = useState(false);
  const [editingList, setEditingList] = useState<List | null>(null);
  const [editListIcon, setEditListIcon] = useState('🗂️');
  const [isUpdatingList, setIsUpdatingList] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [taskFilter, setTaskFilter] = useState<'all' | 'today' | 'overdue' | 'upcoming'>('all');
  const [notificationPermissionGranted, setNotificationPermissionGranted] = useState<boolean | null>(null);

  useEffect(() => {
    if (!isTauri()) {
      return;
    }

    void initFromBackend().catch((error) => {
      console.error('Failed to load persisted data', error);
    });
  }, [initFromBackend]);

  useEffect(() => {
    if (!isTauri()) {
      return;
    }

    let disposed = false;

    const checkNotificationPermissionOnce = async () => {
      try {
        const granted = await isPermissionGranted();
        if (disposed) {
          return;
        }
        setNotificationPermissionGranted(granted);

        if (granted) {
          return;
        }

        const shouldOpenSettings = window.confirm(
          '未开启系统通知权限，提醒将无法触发。是否前往系统设置的通知权限页面？',
        );
        if (!shouldOpenSettings || disposed) {
          return;
        }

        if (isMacDesktop()) {
          const macUrls = [
            'x-apple.systempreferences:com.apple.Notifications-Settings.extension',
            'x-apple.systempreferences:com.apple.preference.notifications',
          ];

          for (const url of macUrls) {
            try {
              await openExternal(url);
              return;
            } catch {
              // Try the next known macOS settings URL scheme.
            }
          }
        }

        window.alert('无法自动打开通知设置，请手动前往系统设置的“通知”页面开启 LinkFlow。');
      } catch (error) {
        console.error('Failed to check notification permission on startup', error);
        if (!disposed) {
          setNotificationPermissionGranted(false);
        }
      }
    };

    void checkNotificationPermissionOnce();

    return () => {
      disposed = true;
    };
  }, []);

  const activeList = lists.find((list) => list.id === activeListId);
  const draftActionPreviews = (draftTask.actions ?? [])
    .map((action, index) => {
      const scheme = schemes.find((item) => item.id === action.schemeId);
      if (!scheme) {
        return null;
      }
      return {
        key: `${action.schemeId}-${index}`,
        label: `${scheme.icon} ${scheme.name}`,
        params: action.params,
      };
    })
    .filter((item): item is { key: string; label: string; params: string[] } => Boolean(item));
  const editingTask = tasks.find((task) => task.id === editingTaskId);
  const isAllTasksView = activeView === 'list' && activeListId === ALL_TASKS_LIST_ID;

  const baseTasks =
    activeView === 'completed'
      ? tasks.filter((task) => task.completed)
      : isAllTasksView
        ? tasks.filter((task) => !task.completed)
        : tasks.filter((task) => task.listId === activeListId && !task.completed);

  const todayDate = new Date().toISOString().slice(0, 10);
  const normalizedKeyword = searchQuery.trim().toLowerCase();

  const visibleTasks = baseTasks.filter((task) => {
    if (normalizedKeyword) {
      const haystack = `${task.title} ${task.detail ?? ''}`.toLowerCase();
      if (!haystack.includes(normalizedKeyword)) {
        return false;
      }
    }

    if (activeView === 'completed') {
      return true;
    }

    if (taskFilter === 'today') {
      return task.dueDate === todayDate;
    }
    if (taskFilter === 'overdue') {
      return Boolean(task.dueDate) && (task.dueDate ?? '') < todayDate;
    }
    if (taskFilter === 'upcoming') {
      return Boolean(task.dueDate) && (task.dueDate ?? '') > todayDate;
    }
    return true;
  });
  visibleTasks.sort((a, b) => {
    const aDate = a.dueDate ?? null;
    const bDate = b.dueDate ?? null;
    if (aDate === null && bDate !== null) {
      return 1;
    }
    if (aDate !== null && bDate === null) {
      return -1;
    }
    if (aDate !== bDate) {
      return (aDate ?? '').localeCompare(bDate ?? '');
    }

    const aTime = a.time ?? null;
    const bTime = b.time ?? null;
    if (aTime === null && bTime !== null) {
      return 1;
    }
    if (aTime !== null && bTime === null) {
      return -1;
    }
    if (aTime !== bTime) {
      return (aTime ?? '').localeCompare(bTime ?? '');
    }
    return 0;
  });

  const title = activeView === 'completed' ? '✅ 已完成' : activeList?.name ?? '列表';

  const handleCreateList = () => {
    setNewListName('');
    setNewListIcon('🗂️');
    setIsCreateListOpen(true);
  };

  const submitCreateList = () => {
    const name = newListName.trim();
    if (!name || isCreatingList) {
      return;
    }

    setIsCreatingList(true);
    void addList({ name, icon: newListIcon.trim() || '🗂️' })
      .then(() => {
        setIsCreateListOpen(false);
        setNewListName('');
        setNewListIcon('🗂️');
      })
      .catch((error) => {
      console.error('Failed to create list', error);
      window.alert('创建列表失败，请稍后重试。');
      })
      .finally(() => {
        setIsCreatingList(false);
      });
  };

  const handleSubmitTask = () => {
    void addTaskFromDraft(activeListId, isAllTasksView).catch((error) => {
      console.error('Failed to create task', error);
      window.alert('创建任务失败，请稍后重试。');
    });
  };

  const handleToggleCompleted = (taskId: string) => {
    void toggleTaskCompleted(taskId).catch((error) => {
      console.error('Failed to toggle task', error);
      window.alert('更新任务状态失败，请稍后重试。');
    });
  };

  const handleUpdateTask = (taskId: string, patch: Partial<Task>) => {
    void updateTask(taskId, patch).catch((error) => {
      console.error('Failed to update task', error);
      window.alert('保存任务失败，请稍后重试。');
    });
  };

  const handleDeleteTask = (taskId: string) => {
    if (!window.confirm('确认删除这个任务吗？')) {
      return;
    }

    void deleteTask(taskId).catch((error) => {
      console.error('Failed to delete task', error);
      window.alert('删除任务失败，请稍后重试。');
    });
  };

  const handleUpdateList = (list: (typeof lists)[number]) => {
    setEditingList(list);
    setEditListIcon(list.icon);
  };

  const handleDeleteList = (list: (typeof lists)[number]) => {
    if (list.id === ALL_TASKS_LIST_ID) {
      return;
    }
    if (!window.confirm(`确认删除列表「${list.name}」吗？该列表下任务会变成“无列表”。`)) {
      return;
    }
    void deleteList(list.id).catch((error) => {
      console.error('Failed to delete list', error);
      window.alert('删除列表失败，请稍后重试。');
    });
  };

  const submitUpdateList = () => {
    if (!editingList || isUpdatingList) {
      return;
    }

    setIsUpdatingList(true);
    void updateList(editingList.id, {
      name: editingList.name,
      icon: editListIcon.trim() || editingList.icon || '🗂️',
    })
      .then(() => {
        setEditingList(null);
        setEditListIcon('🗂️');
      })
      .catch((error) => {
        console.error('Failed to update list', error);
        window.alert('编辑列表失败，请稍后重试。');
      })
      .finally(() => {
        setIsUpdatingList(false);
      });
  };

  const handleExecuteAction = async (task: Task, actionSchemeId: string) => {
    const action = (task.actions ?? []).find((item) => item.schemeId === actionSchemeId);
    const scheme = schemes.find((item) => item.id === actionSchemeId);

    try {
      if (!action) {
        throw new Error('Task action binding not found');
      }
      await executeTaskAction(action, scheme);
    } catch (error) {
      console.error('Failed to execute action', error);
      window.alert('动作执行失败，请确认已在 Tauri 桌面端运行，并检查 URL Scheme 是否已安装。');
    }
  };

  const ensureNotificationPermissionForReminderPanel = (): boolean => {
    if (!isTauri()) {
      return true;
    }

    if (notificationPermissionGranted === false) {
      window.alert('系统通知权限未开启，请先在系统设置中为 LinkFlow 开启通知权限。');
      return false;
    }
    if (notificationPermissionGranted === null) {
      window.alert('正在检查通知权限，请稍后再试。');
      return false;
    }

    return true;
  };

  useEffect(() => {
    if (!isCreateListOpen) {
      return;
    }

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') {
        return;
      }
      setIsCreateListOpen(false);
      setNewListName('');
      setNewListIcon('🗂️');
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [isCreateListOpen]);

  if (!isTauri()) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gray-100 p-6 text-sm text-gray-700">
        请使用 `npm run tauri dev` 或打包后的桌面应用运行，SQLite 后端仅在 Tauri 桌面端可用。
      </div>
    );
  }

  if (isHydrating && !isHydrated) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gray-100 p-6 text-sm text-gray-700">
        正在加载本地数据库数据...
      </div>
    );
  }

  if (!isHydrated) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-red-50 p-6 text-sm text-red-700">
        数据库初始化失败：{syncError ?? '未知错误'}
      </div>
    );
  }

  return (
    <>
      <AppLayout
        sidebar={
          <Sidebar
            lists={lists}
            activeListId={activeListId}
            activeView={activeView}
            onListClick={setActiveList}
            onCreateList={handleCreateList}
            onUpdateList={handleUpdateList}
            onDeleteList={handleDeleteList}
            onCompletedClick={() => setActiveView('completed')}
            onOpenSettings={() => setIsSettingsOpen(true)}
          />
        }
        main={
          <MainContent
            title={title}
            activeView={activeView}
            isAllTasksView={isAllTasksView}
            allTasksListId={ALL_TASKS_LIST_ID}
            lists={lists}
            visibleTasks={visibleTasks}
            schemes={schemes}
            draftTitle={draftTask.title}
            draftDetail={draftTask.detail}
            draftListId={draftTask.listId}
            draftDueDate={draftTask.dueDate}
            draftTime={draftTask.time}
            draftReminder={draftTask.reminder}
            draftRepeatType={draftTask.repeat?.type ?? 'none'}
            draftRepeatDaysOfWeek={draftTask.repeat?.dayOfWeek ?? []}
            draftRepeatDaysOfMonth={draftTask.repeat?.dayOfMonth ?? []}
            draftActions={draftActionPreviews}
            searchQuery={searchQuery}
            taskFilter={taskFilter}
            onDraftTitleChange={(value) => updateDraftTask({ title: value })}
            onDraftDetailChange={(value) => updateDraftTask({ detail: value })}
            onDraftDueDateChange={(value) =>
              dispatchDraftSchedule({ type: 'DRAFT_SET_DUE_DATE', dueDate: value })
            }
            onDraftTimeChange={(value) =>
              dispatchDraftSchedule({ type: 'DRAFT_SET_TIME', time: value })
            }
            onDraftReminderChange={(value) =>
              dispatchDraftSchedule({ type: 'DRAFT_SET_REMINDER', reminder: value })
            }
            onBeforeOpenDraftReminder={ensureNotificationPermissionForReminderPanel}
            onDraftRepeatTypeChange={(value) => {
              if (value === 'none') {
                updateDraftTask({ repeat: null });
                return;
              }

              if (value === 'daily') {
                updateDraftTask({
                  dueDate: null,
                  repeat: { type: 'daily' },
                });
                return;
              }

              if (value === 'weekly') {
                updateDraftTask({
                  dueDate: null,
                  repeat: {
                    type: 'weekly',
                    dayOfWeek: draftTask.repeat?.dayOfWeek?.length
                      ? draftTask.repeat.dayOfWeek
                      : [1],
                  },
                });
                return;
              }

              updateDraftTask({
                dueDate: null,
                repeat: {
                  type: 'monthly',
                  dayOfMonth: draftTask.repeat?.dayOfMonth?.length
                    ? draftTask.repeat.dayOfMonth
                    : [1],
                },
              });
            }}
            onDraftToggleRepeatWeekDay={(value) => {
              const current = draftTask.repeat?.type === 'weekly' ? draftTask.repeat.dayOfWeek ?? [] : [];
              const next = current.includes(value)
                ? current.filter((day) => day !== value)
                : [...current, value];
              updateDraftTask({
                repeat: next.length
                  ? {
                      type: 'weekly',
                      dayOfWeek: next.sort((a, b) => a - b),
                    }
                  : null,
              });
            }}
            onDraftSetRepeatMonthDays={(value) =>
              updateDraftTask({
                repeat: value.length
                  ? {
                      type: 'monthly',
                      dayOfMonth: [...value].sort((a, b) => a - b),
                    }
                  : null,
              })
            }
            onDraftListChange={(value) => updateDraftTask({ listId: value })}
            onSubmitTask={handleSubmitTask}
            onOpenActionPicker={() => setIsActionPickerOpen(true)}
            onSearchChange={setSearchQuery}
            onTaskFilterChange={setTaskFilter}
            onToggleCompleted={handleToggleCompleted}
            onDeleteTask={handleDeleteTask}
            onExecuteAction={handleExecuteAction}
            onEditTask={(task) => setEditingTaskId(task.id)}
          />
        }
      />
      <ActionPickerModal
        isOpen={isActionPickerOpen}
        schemes={schemes}
        initialActions={draftTask.actions}
        onClose={() => setIsActionPickerOpen(false)}
        onConfirm={({ actions }) => updateDraftTask({ actions })}
      />
      <SettingsModal
        isOpen={isSettingsOpen}
        schemes={schemes}
        onClose={() => setIsSettingsOpen(false)}
        onCreate={addScheme}
        onUpdate={updateScheme}
        onDelete={deleteScheme}
        onExportBackup={exportBackup}
        onImportBackup={importBackup}
      />
      <TaskEditModal
        task={editingTask}
        isOpen={Boolean(editingTask)}
        onClose={() => setEditingTaskId(null)}
        onSave={handleUpdateTask}
      />
      {isCreateListOpen ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4">
          <div className="w-full max-w-md rounded-xl bg-white p-5 shadow-lg">
            <h3 className="mb-4 text-lg font-semibold text-gray-800">新建任务列表</h3>
            <div className="space-y-3">
              <label className="block">
                <span className="mb-1 block text-xs text-gray-400">列表名称</span>
                <input
                  value={newListName}
                  onChange={(event) => setNewListName(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter') {
                      submitCreateList();
                    }
                  }}
                  className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm text-gray-700 outline-none ring-linkflow-accent/20 focus:ring"
                  placeholder="例如：学习"
                  autoFocus
                />
              </label>
              <label className="block">
                <span className="mb-1 block text-xs text-gray-400">图标（可选）</span>
                <input
                  value={newListIcon}
                  onChange={(event) => setNewListIcon(event.target.value)}
                  className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm text-gray-700 outline-none ring-linkflow-accent/20 focus:ring"
                  placeholder="🗂️"
                />
              </label>
            </div>
            <div className="mt-5 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setIsCreateListOpen(false)}
                className="rounded-lg px-3 py-2 text-sm text-gray-500 transition hover:bg-gray-100"
              >
                取消
              </button>
              <button
                type="button"
                disabled={!newListName.trim() || isCreatingList}
                onClick={submitCreateList}
                className="rounded-lg bg-linkflow-accent px-3 py-2 text-sm text-white transition enabled:hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {isCreatingList ? '创建中...' : '创建'}
              </button>
            </div>
          </div>
        </div>
      ) : null}
      {editingList ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4">
          <div className="w-full max-w-md rounded-xl bg-white p-5 shadow-lg">
            <h3 className="mb-4 text-lg font-semibold text-gray-800">编辑任务列表</h3>
            <div className="space-y-3">
              <label className="block">
                <span className="mb-1 block text-xs text-gray-400">列表名称</span>
                <div className="w-full rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-sm text-gray-500">
                  {editingList.name}
                </div>
              </label>
              <label className="block">
                <span className="mb-1 block text-xs text-gray-400">图标（可修改）</span>
                <input
                  value={editListIcon}
                  onChange={(event) => setEditListIcon(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter') {
                      submitUpdateList();
                    }
                  }}
                  className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm text-gray-700 outline-none ring-linkflow-accent/20 focus:ring"
                  placeholder="🗂️"
                  autoFocus
                />
              </label>
            </div>
            <div className="mt-5 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setEditingList(null)}
                className="rounded-lg px-3 py-2 text-sm text-gray-500 transition hover:bg-gray-100"
              >
                取消
              </button>
              <button
                type="button"
                disabled={isUpdatingList}
                onClick={submitUpdateList}
                className="rounded-lg bg-linkflow-accent px-3 py-2 text-sm text-white transition enabled:hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {isUpdatingList ? '保存中...' : '保存'}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}

export default App;
