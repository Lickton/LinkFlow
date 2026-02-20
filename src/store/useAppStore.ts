import { create } from 'zustand';
import { mockLists, mockSchemes, mockTasks } from './mockData';
import type { List, RepeatRule, Task, TaskActionBinding, UrlScheme } from '../types/models';

type ActiveView = 'list' | 'completed';

interface DraftTask {
  title: string;
  detail: string;
  listId?: string | null;
  date?: string;
  time?: string;
  reminder?: boolean;
  reminderOffsetMinutes?: number;
  repeat?: RepeatRule | null;
  actions: TaskActionBinding[];
}

interface AppState {
  lists: List[];
  tasks: Task[];
  schemes: UrlScheme[];
  activeListId: string;
  activeView: ActiveView;
  draftTask: DraftTask;
  setActiveList: (listId: string) => void;
  addList: (input: Omit<List, 'id'>) => void;
  setActiveView: (view: ActiveView) => void;
  toggleTaskCompleted: (taskId: string) => void;
  updateTask: (taskId: string, patch: Partial<Task>) => void;
  addTaskFromDraft: (defaultListId: string, useDraftList: boolean) => void;
  addScheme: (input: Omit<UrlScheme, 'id'>) => void;
  updateScheme: (schemeId: string, patch: Omit<UrlScheme, 'id'>) => void;
  deleteScheme: (schemeId: string) => void;
  updateDraftTask: (patch: Partial<DraftTask>) => void;
  resetDraftTask: () => void;
}

const initialDraftTask: DraftTask = {
  title: '',
  detail: '',
  listId: null,
  reminder: true,
  reminderOffsetMinutes: 10,
  repeat: null,
  actions: [],
};

const pad = (value: number) => value.toString().padStart(2, '0');

const formatDate = (date: Date): string => {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
};

const formatTime = (date: Date): string => `${pad(date.getHours())}:${pad(date.getMinutes())}`;

const roundToFiveMinutes = (date: Date): Date => {
  const cloned = new Date(date);
  const minutes = cloned.getMinutes();
  const next = Math.ceil(minutes / 5) * 5;
  cloned.setMinutes(next, 0, 0);
  return cloned;
};

const isSameRepeat = (a?: RepeatRule | null, b?: RepeatRule | null): boolean => {
  if (!a && !b) {
    return true;
  }
  if (!a || !b) {
    return false;
  }
  const weekA = a.dayOfWeek ?? [];
  const weekB = b.dayOfWeek ?? [];
  const monthA = a.dayOfMonth ?? [];
  const monthB = b.dayOfMonth ?? [];

  const sameWeek =
    weekA.length === weekB.length && weekA.every((value, index) => value === weekB[index]);
  const sameMonth =
    monthA.length === monthB.length && monthA.every((value, index) => value === monthB[index]);

  return a.type === b.type && sameWeek && sameMonth;
};

const inferDefaultSchedule = (
  draft: DraftTask,
  listId: string | undefined,
  tasks: Task[],
): Pick<Task, 'date' | 'time' | 'reminder' | 'reminderOffsetMinutes'> => {
  if (draft.repeat) {
    const previous = [...tasks]
      .reverse()
      .find(
        (task) =>
          task.listId === listId &&
          task.title.trim() === draft.title.trim() &&
          isSameRepeat(task.repeat, draft.repeat),
      );

    if (previous) {
      return {
        date: draft.date ?? previous.date,
        time: draft.time ?? previous.time,
        reminder: draft.reminder ?? previous.reminder,
        reminderOffsetMinutes: draft.reminderOffsetMinutes ?? previous.reminderOffsetMinutes,
      };
    }
  }

  const now = new Date();
  const hour = now.getHours();
  const hasDate = Boolean(draft.date);
  const hasTime = Boolean(draft.time);

  if (hasDate && hasTime) {
    return {
      date: draft.date,
      time: draft.time,
      reminder: draft.reminder ?? true,
      reminderOffsetMinutes: draft.reminderOffsetMinutes ?? 10,
    };
  }

  if (hour >= 20 || hour < 6) {
    const tomorrowMorning = new Date(now);
    tomorrowMorning.setDate(tomorrowMorning.getDate() + 1);
    tomorrowMorning.setHours(9, 0, 0, 0);

    return {
      date: draft.date ?? formatDate(tomorrowMorning),
      time: draft.time ?? formatTime(tomorrowMorning),
      reminder: draft.reminder ?? true,
      reminderOffsetMinutes: draft.reminderOffsetMinutes ?? 10,
    };
  }

  const roundedNow = roundToFiveMinutes(now);
  return {
    date: draft.date ?? formatDate(roundedNow),
    time: draft.time ?? formatTime(roundedNow),
    reminder: draft.reminder ?? true,
    reminderOffsetMinutes: draft.reminderOffsetMinutes ?? 10,
  };
};

export const useAppStore = create<AppState>((set) => ({
  lists: mockLists,
  tasks: mockTasks,
  schemes: mockSchemes,
  activeListId: mockLists[0]?.id ?? '',
  activeView: 'list',
  draftTask: initialDraftTask,
  setActiveList: (listId) =>
    set({
      activeListId: listId,
      activeView: 'list',
    }),
  addList: (input) =>
    set((state) => {
      const nextList: List = {
        id: `list_${globalThis.crypto?.randomUUID?.() ?? Date.now().toString()}`,
        ...input,
      };

      return {
        lists: [...state.lists, nextList],
        activeListId: nextList.id,
        activeView: 'list',
      };
    }),
  setActiveView: (view) => set({ activeView: view }),
  toggleTaskCompleted: (taskId) =>
    set((state) => ({
      tasks: state.tasks.map((task) =>
        task.id === taskId ? { ...task, completed: !task.completed } : task,
      ),
    })),
  updateTask: (taskId, patch) =>
    set((state) => ({
      tasks: state.tasks.map((task) => (task.id === taskId ? { ...task, ...patch } : task)),
    })),
  addTaskFromDraft: (defaultListId, useDraftList) =>
    set((state) => {
      const title = state.draftTask.title.trim();

      if (!title) {
        return state;
      }

      const targetListId = useDraftList ? (state.draftTask.listId ?? undefined) : defaultListId;

      const scheduleDefaults = inferDefaultSchedule(
        {
          ...state.draftTask,
          title,
        },
        targetListId,
        state.tasks,
      );

      const nextTask: Task = {
        id: `task_${globalThis.crypto?.randomUUID?.() ?? Date.now().toString()}`,
        listId: targetListId,
        title,
        detail: state.draftTask.detail.trim() || undefined,
        completed: false,
        date: scheduleDefaults.date,
        time: scheduleDefaults.time,
        reminder: scheduleDefaults.reminder,
        reminderOffsetMinutes: scheduleDefaults.reminderOffsetMinutes,
        repeat: state.draftTask.repeat ?? null,
        actions: state.draftTask.actions.length > 0 ? state.draftTask.actions : undefined,
      };

      return {
        tasks: [nextTask, ...state.tasks],
        draftTask: initialDraftTask,
      };
    }),
  addScheme: (input) =>
    set((state) => ({
      schemes: [
        ...state.schemes,
        {
          id: `scheme_${globalThis.crypto?.randomUUID?.() ?? Date.now().toString()}`,
          ...input,
        },
      ],
    })),
  updateScheme: (schemeId, patch) =>
    set((state) => ({
      schemes: state.schemes.map((scheme) =>
        scheme.id === schemeId
          ? {
              ...scheme,
              ...patch,
            }
          : scheme,
      ),
    })),
  deleteScheme: (schemeId) =>
    set((state) => ({
      schemes: state.schemes.filter((scheme) => scheme.id !== schemeId),
      draftTask: {
        ...state.draftTask,
        actions: state.draftTask.actions.filter((action) => action.schemeId !== schemeId),
      },
    })),
  updateDraftTask: (patch) =>
    set((state) => ({
      draftTask: {
        ...state.draftTask,
        ...patch,
      },
    })),
  resetDraftTask: () => set({ draftTask: initialDraftTask }),
}));
