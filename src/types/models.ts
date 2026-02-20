export interface UrlScheme {
  id: string;
  name: string;
  icon: string;
  template: string;
  kind?: 'url' | 'script';
  paramType: 'string' | 'number';
}

export type RepeatType = 'daily' | 'weekly' | 'monthly';

export interface RepeatRule {
  type: RepeatType;
  dayOfWeek?: number[];
  dayOfMonth?: number[];
}

export interface Task {
  id: string;
  listId?: string;
  title: string;
  detail?: string;
  completed: boolean;
  date?: string;
  time?: string;
  reminder?: boolean;
  reminderOffsetMinutes?: number;
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
