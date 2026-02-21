import { invoke, isTauri } from '@tauri-apps/api/core';
import type { List, Task, UrlScheme } from '../types/models';

export interface AppSnapshot {
  lists: List[];
  tasks: Task[];
  schemes: UrlScheme[];
}

export type SchemeDraftInput = Omit<UrlScheme, 'id'>;

export interface NewTaskInput {
  listId?: string;
  title: string;
  detail?: string;
  dueDate?: string | null;
  time?: string | null;
  reminder?: Task['reminder'];
  repeat?: Task['repeat'];
  actions?: Task['actions'];
}

function ensureTauri(): void {
  if (!isTauri()) {
    throw new Error('SQLite backend is only available in Tauri desktop mode.');
  }
}

export async function getAppSnapshot(): Promise<AppSnapshot> {
  ensureTauri();
  return invoke<AppSnapshot>('get_app_snapshot');
}

export async function exportBackup(path: string): Promise<string> {
  ensureTauri();
  return invoke<string>('export_backup', { path });
}

export async function importBackup(path: string): Promise<AppSnapshot> {
  ensureTauri();
  return invoke<AppSnapshot>('import_backup', { path });
}

export async function createList(input: Omit<List, 'id'>): Promise<List> {
  ensureTauri();
  return invoke<List>('create_list', { input });
}

export async function updateList(listId: string, patch: Omit<List, 'id'>): Promise<List> {
  ensureTauri();
  return invoke<List>('update_list', { listId, patch });
}

export async function createScheme(input: SchemeDraftInput): Promise<UrlScheme> {
  ensureTauri();
  return invoke<UrlScheme>('create_scheme', { input });
}

export async function updateScheme(schemeId: string, patch: SchemeDraftInput): Promise<UrlScheme> {
  ensureTauri();
  return invoke<UrlScheme>('update_scheme', { schemeId, patch });
}

export async function deleteScheme(schemeId: string): Promise<void> {
  ensureTauri();
  await invoke('delete_scheme', { schemeId });
}

export async function createTask(input: NewTaskInput): Promise<Task> {
  ensureTauri();
  return invoke<Task>('create_task', { input });
}

export async function saveTask(task: Task): Promise<Task> {
  ensureTauri();
  return invoke<Task>('save_task', { task });
}

export async function toggleTaskCompleted(taskId: string): Promise<Task> {
  ensureTauri();
  return invoke<Task>('toggle_task_completed', { taskId });
}

export async function deleteTask(taskId: string): Promise<void> {
  ensureTauri();
  await invoke('delete_task', { taskId });
}

export async function deleteList(listId: string): Promise<void> {
  ensureTauri();
  await invoke('delete_list', { listId });
}
