import { isTauri } from '@tauri-apps/api/core';
import { useEffect, useRef, useState } from 'react';
import { AppLayout } from './components/layout/AppLayout';
import { MainContent } from './components/main/MainContent';
import { ActionPickerModal } from './components/modals/ActionPickerModal';
import { SettingsModal } from './components/modals/SettingsModal';
import { TaskEditModal } from './components/modals/TaskEditModal';
import { Sidebar } from './components/sidebar/Sidebar';
import { useAppStore } from './store/useAppStore';
import { executeTaskAction } from './utils/actionEngine';
import type { Task } from './types/models';

const ALL_TASKS_LIST_ID = 'list_today';

function App() {
  const {
    lists,
    tasks,
    schemes,
    activeListId,
    activeView,
    draftTask,
    setActiveList,
    addList,
    setActiveView,
    updateDraftTask,
    addTaskFromDraft,
    toggleTaskCompleted,
    updateTask,
    addScheme,
    updateScheme,
    deleteScheme,
  } = useAppStore();
  const [isActionPickerOpen, setIsActionPickerOpen] = useState(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [editingTaskId, setEditingTaskId] = useState<string | null>(null);
  const executedScriptTaskKeysRef = useRef<Set<string>>(new Set());

  const activeList = lists.find((list) => list.id === activeListId);
  const draftActionPreviews = (draftTask.actions ?? [])
    .map((action, index) => {
      const scheme = schemes.find((item) => item.id === action.schemeId);
      if (!scheme) {
        return null;
      }
      return {
        key: `${action.schemeId}-${index}`,
        label: `${scheme.icon} ${scheme.name}${scheme.kind === 'script' ? ' · 脚本' : ''}`,
        params: action.params,
      };
    })
    .filter((item): item is { key: string; label: string; params: string[] } => Boolean(item));
  const editingTask = tasks.find((task) => task.id === editingTaskId);
  const isAllTasksView = activeView === 'list' && activeListId === ALL_TASKS_LIST_ID;

  const visibleTasks =
    activeView === 'completed'
      ? tasks.filter((task) => task.completed)
      : isAllTasksView
        ? tasks.filter((task) => !task.completed)
        : tasks.filter((task) => task.listId === activeListId && !task.completed);

  const title = activeView === 'completed' ? '✅ 已完成' : activeList?.name ?? '列表';

  const handleCreateList = () => {
    const name = window.prompt('请输入列表名称');
    if (!name?.trim()) {
      return;
    }

    const icon = window.prompt('请输入列表图标（可选）', '🗂️')?.trim() || '🗂️';
    addList({ name: name.trim(), icon });
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
      if (scheme?.kind === 'script') {
        window.alert('脚本执行失败，请确认路径为绝对路径且文件可执行，并在 Tauri 桌面端运行。');
        return;
      }
      window.alert('动作执行失败，请确认已在 Tauri 桌面端运行，并检查 URL Scheme 是否已安装。');
    }
  };

  useEffect(() => {
    if (!isTauri()) {
      return;
    }

    const runDueScriptTasks = async () => {
      const now = Date.now();
      for (const task of tasks) {
        if (task.completed || !task.date || !task.time) {
          continue;
        }

        const dueAt = new Date(`${task.date}T${task.time}:00`).getTime();
        if (!Number.isFinite(dueAt) || dueAt > now) {
          continue;
        }

        const taskActions = task.actions ?? [];
        for (const action of taskActions) {
          const scheme = schemes.find((item) => item.id === action.schemeId);
          if (!scheme || scheme.kind !== 'script') {
            continue;
          }

          const runKey = `${task.id}|${task.date}|${task.time}|${scheme.id}`;
          if (executedScriptTaskKeysRef.current.has(runKey)) {
            continue;
          }

          try {
            await executeTaskAction(action, scheme);
            executedScriptTaskKeysRef.current.add(runKey);
          } catch (error) {
            console.error('Failed to execute scheduled script task', error);
          }
        }
      }
    };

    const timer = window.setInterval(() => {
      void runDueScriptTasks();
    }, 30_000);

    void runDueScriptTasks();

    return () => window.clearInterval(timer);
  }, [schemes, tasks]);

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
            draftDate={draftTask.date}
            draftTime={draftTask.time}
            draftReminder={draftTask.reminder}
            draftReminderOffsetMinutes={draftTask.reminderOffsetMinutes}
            draftRepeatType={draftTask.repeat?.type ?? 'none'}
            draftRepeatDaysOfWeek={draftTask.repeat?.dayOfWeek ?? []}
            draftRepeatDaysOfMonth={draftTask.repeat?.dayOfMonth ?? []}
            draftActions={draftActionPreviews}
            onDraftTitleChange={(value) => updateDraftTask({ title: value })}
            onDraftDetailChange={(value) => updateDraftTask({ detail: value })}
            onDraftDateChange={(value) => updateDraftTask({ date: value })}
            onDraftTimeChange={(value) => updateDraftTask({ time: value })}
            onDraftReminderChange={(value) => updateDraftTask({ reminder: value })}
            onDraftReminderOffsetChange={(value) =>
              updateDraftTask({ reminderOffsetMinutes: Math.max(0, value) })
            }
            onDraftRepeatTypeChange={(value) => {
              if (value === 'none') {
                updateDraftTask({ repeat: null });
                return;
              }

              if (value === 'daily') {
                updateDraftTask({
                  date: undefined,
                  repeat: { type: 'daily' },
                });
                return;
              }

              if (value === 'weekly') {
                updateDraftTask({
                  date: undefined,
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
                date: undefined,
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
            onSubmitTask={() => addTaskFromDraft(activeListId, isAllTasksView)}
            onOpenActionPicker={() => setIsActionPickerOpen(true)}
            onToggleCompleted={toggleTaskCompleted}
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
      />
      <TaskEditModal
        task={editingTask}
        isOpen={Boolean(editingTask)}
        onClose={() => setEditingTaskId(null)}
        onSave={updateTask}
      />
    </>
  );
}

export default App;
