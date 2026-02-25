export interface UrlScheme {
  id: string;
  name: string;
  icon: string;
  template: string;
  kind?: 'url';
  paramType: 'string' | 'number';
}

export type RepeatType = 'daily' | 'weekly' | 'monthly';

export interface RepeatRule {
  type: RepeatType;
  dayOfWeek?: number[];
  dayOfMonth?: number[];
}

export interface RelativeReminder {
  type: 'relative';
  offsetMinutes: number;
}

export type TaskReminder = RelativeReminder | null;

export interface Task {
  id: string;
  listId?: string;
  title: string;
  detail?: string;
  completed: boolean;
  dueDate?: string | null;
  time?: string | null;
  reminder?: TaskReminder;
  repeat?: RepeatRule | null;
  actions?: TaskActionBinding[];
}

export interface TaskActionBinding {
  schemeId: string;
  params: string[];
}

export interface List {
  id: string;
  name: string;
  icon: string;
}
