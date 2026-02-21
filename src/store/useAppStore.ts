import { create } from 'zustand';
import type { List, RepeatRule, Task, TaskActionBinding, UrlScheme } from '../types/models';
import {
  createList as createListInDb,
  createScheme as createSchemeInDb,
  createTask as createTaskInDb,
  deleteList as deleteListInDb,
  deleteTask as deleteTaskInDb,
  deleteScheme as deleteSchemeInDb,
  exportBackup as exportBackupInDb,
  getAppSnapshot,
  importBackup as importBackupInDb,
  saveTask as saveTaskInDb,
  toggleTaskCompleted as toggleTaskCompletedInDb,
  updateScheme as updateSchemeInDb,
  updateList as updateListInDb,
} from '../utils/backendApi';

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
  isHydrating: boolean;
  isHydrated: boolean;
  syncError?: string;
  initFromBackend: () => Promise<void>;
  setActiveList: (listId: string) => void;
  addList: (input: Omit<List, 'id'>) => Promise<void>;
  updateList: (listId: string, patch: Omit<List, 'id'>) => Promise<void>;
  deleteList: (listId: string) => Promise<void>;
  setActiveView: (view: ActiveView) => void;
  toggleTaskCompleted: (taskId: string) => Promise<void>;
  deleteTask: (taskId: string) => Promise<void>;
  updateTask: (taskId: string, patch: Partial<Task>) => Promise<void>;
  addTaskFromDraft: (defaultListId: string, useDraftList: boolean) => Promise<void>;
  addScheme: (input: Omit<UrlScheme, 'id'>) => Promise<void>;
  updateScheme: (schemeId: string, patch: Omit<UrlScheme, 'id'>) => Promise<void>;
  deleteScheme: (schemeId: string) => Promise<void>;
  exportBackup: (path: string) => Promise<string>;
  importBackup: (path: string) => Promise<void>;
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

const normalizeTime = (value?: string): string | undefined => {
  if (!value) {
    return undefined;
  }
  const trimmed = value.trim();
  return /^\d{2}:\d{2}$/.test(trimmed) ? trimmed : undefined;
};

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
  const normalizedDraftTime = normalizeTime(draft.time);
  const hasTime = Boolean(normalizedDraftTime);

  if (hasDate && hasTime) {
    return {
      date: draft.date,
      time: normalizedDraftTime,
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
      time: normalizedDraftTime ?? formatTime(tomorrowMorning),
      reminder: draft.reminder ?? true,
      reminderOffsetMinutes: draft.reminderOffsetMinutes ?? 10,
    };
  }

  const roundedNow = roundToFiveMinutes(now);
  return {
    date: draft.date ?? formatDate(roundedNow),
    time: normalizedDraftTime ?? formatTime(roundedNow),
    reminder: draft.reminder ?? true,
    reminderOffsetMinutes: draft.reminderOffsetMinutes ?? 10,
  };
};

export const useAppStore = create<AppState>((set, get) => ({
  lists: [],
  tasks: [],
  schemes: [],
  activeListId: '',
  activeView: 'list',
  draftTask: initialDraftTask,
  isHydrating: false,
  isHydrated: false,
  syncError: undefined,
  initFromBackend: async () => {
    set({ isHydrating: true, syncError: undefined });
    try {
      const snapshot = await getAppSnapshot();
      set((state) => ({
        lists: snapshot.lists,
        tasks: snapshot.tasks,
        schemes: snapshot.schemes,
        activeListId:
          state.activeListId && snapshot.lists.some((list) => list.id === state.activeListId)
            ? state.activeListId
            : (snapshot.lists[0]?.id ?? ''),
        isHydrating: false,
        isHydrated: true,
        syncError: undefined,
      }));
    } catch (error) {
      set({
        isHydrating: false,
        isHydrated: false,
        syncError: error instanceof Error ? error.message : 'Failed to load data from backend',
      });
      throw error;
    }
  },
  setActiveList: (listId) =>
    set({
      activeListId: listId,
      activeView: 'list',
    }),
  addList: async (input) => {
    const created = await createListInDb(input);
    set((state) => ({
      lists: [...state.lists, created],
      activeListId: created.id,
      activeView: 'list',
    }));
  },
  updateList: async (listId, patch) => {
    const updated = await updateListInDb(listId, patch);
    set((state) => ({
      lists: state.lists.map((list) => (list.id === updated.id ? updated : list)),
    }));
  },
  deleteList: async (listId) => {
    await deleteListInDb(listId);
    set((state) => {
      const nextLists = state.lists.filter((list) => list.id !== listId);
      const nextActiveListId =
        state.activeListId === listId ? (nextLists[0]?.id ?? '') : state.activeListId;

      return {
        lists: nextLists,
        tasks: state.tasks.map((task) =>
          task.listId === listId
            ? {
                ...task,
                listId: undefined,
              }
            : task,
        ),
        activeListId: nextActiveListId,
        activeView: state.activeView === 'completed' ? 'completed' : 'list',
      };
    });
  },
  setActiveView: (view) => set({ activeView: view }),
  toggleTaskCompleted: async (taskId) => {
    const updated = await toggleTaskCompletedInDb(taskId);
    set((state) => ({
      tasks: state.tasks.map((task) => (task.id === updated.id ? updated : task)),
    }));
  },
  deleteTask: async (taskId) => {
    await deleteTaskInDb(taskId);
    set((state) => ({
      tasks: state.tasks.filter((task) => task.id !== taskId),
    }));
  },
  updateTask: async (taskId, patch) => {
    const existing = get().tasks.find((task) => task.id === taskId);
    if (!existing) {
      return;
    }

    const merged: Task = {
      ...existing,
      ...patch,
      id: existing.id,
    };

    const saved = await saveTaskInDb(merged);
    set((state) => ({
      tasks: state.tasks.map((task) => (task.id === saved.id ? saved : task)),
    }));
  },
  addTaskFromDraft: async (defaultListId, useDraftList) => {
    const state = get();
    const title = state.draftTask.title.trim();
    if (!title) {
      return;
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

    const created = await createTaskInDb({
      listId: targetListId,
      title,
      detail: state.draftTask.detail.trim() || undefined,
      date: scheduleDefaults.date,
      time: scheduleDefaults.time,
      reminder: scheduleDefaults.reminder,
      reminderOffsetMinutes: scheduleDefaults.reminderOffsetMinutes,
      repeat: state.draftTask.repeat ?? null,
      actions: state.draftTask.actions.length > 0 ? state.draftTask.actions : undefined,
    });

    set((current) => ({
      tasks: [created, ...current.tasks],
      draftTask: initialDraftTask,
    }));
  },
  addScheme: async (input) => {
    const created = await createSchemeInDb(input);
    set((state) => ({
      schemes: [...state.schemes, created],
    }));
  },
  updateScheme: async (schemeId, patch) => {
    const updated = await updateSchemeInDb(schemeId, patch);
    set((state) => ({
      schemes: state.schemes.map((scheme) => (scheme.id === updated.id ? updated : scheme)),
    }));
  },
  deleteScheme: async (schemeId) => {
    await deleteSchemeInDb(schemeId);
    set((state) => ({
      schemes: state.schemes.filter((scheme) => scheme.id !== schemeId),
      tasks: state.tasks.map((task) => ({
        ...task,
        actions: task.actions?.filter((action) => action.schemeId !== schemeId),
      })),
      draftTask: {
        ...state.draftTask,
        actions: state.draftTask.actions.filter((action) => action.schemeId !== schemeId),
      },
    }));
  },
  exportBackup: async (path) => exportBackupInDb(path),
  importBackup: async (path) => {
    const snapshot = await importBackupInDb(path);
    set((state) => ({
      lists: snapshot.lists,
      tasks: snapshot.tasks,
      schemes: snapshot.schemes,
      activeListId:
        state.activeListId && snapshot.lists.some((list) => list.id === state.activeListId)
          ? state.activeListId
          : (snapshot.lists[0]?.id ?? ''),
      activeView: 'list',
      draftTask: initialDraftTask,
    }));
  },
  updateDraftTask: (patch) =>
    set((state) => ({
      draftTask: {
        ...state.draftTask,
        ...patch,
      },
    })),
  resetDraftTask: () => set({ draftTask: initialDraftTask }),
}));
