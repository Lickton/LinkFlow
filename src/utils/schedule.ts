import type { RelativeReminder, TaskReminder } from '../types/models';

export interface ScheduleFields {
  dueDate?: string | null;
  time?: string | null;
  reminder?: TaskReminder;
}

export type ScheduleAction =
  | { type: 'DRAFT_SET_DUE_DATE'; dueDate: string | null }
  | { type: 'DRAFT_SET_TIME'; time: string | null }
  | { type: 'DRAFT_SET_REMINDER'; reminder: TaskReminder };

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const TIME_PATTERN = /^\d{2}:\d{2}$/;

function normalizeDueDate(value: string | null | undefined): string | null {
  if (!value) {
    return null;
  }
  const trimmed = value.trim();
  return DATE_PATTERN.test(trimmed) ? trimmed : null;
}

function normalizeTime(value: string | null | undefined): string | null {
  if (!value) {
    return null;
  }
  const trimmed = value.trim();
  return TIME_PATTERN.test(trimmed) ? trimmed : null;
}

function normalizeReminder(reminder: TaskReminder | undefined): TaskReminder {
  if (!reminder || reminder.type !== 'relative') {
    return null;
  }
  return {
    type: 'relative',
    offsetMinutes: Math.max(0, Math.floor(reminder.offsetMinutes)),
  };
}

function clearInvalidReminder(fields: Required<ScheduleFields>): Required<ScheduleFields> {
  if (!fields.dueDate || !fields.time) {
    return {
      ...fields,
      reminder: null,
    };
  }
  return fields;
}

export function applyScheduleInvariants(fields: ScheduleFields): Required<ScheduleFields> {
  const normalized = {
    dueDate: normalizeDueDate(fields.dueDate),
    time: normalizeTime(fields.time),
    reminder: normalizeReminder(fields.reminder),
  };

  if (!normalized.dueDate) {
    return {
      dueDate: null,
      time: null,
      reminder: null,
    };
  }

  if (!normalized.time) {
    return {
      dueDate: normalized.dueDate,
      time: null,
      reminder: null,
    };
  }

  return clearInvalidReminder(normalized);
}

export function reduceSchedule(
  state: Required<ScheduleFields>,
  action: ScheduleAction,
  today: string,
): Required<ScheduleFields> {
  switch (action.type) {
    case 'DRAFT_SET_DUE_DATE': {
      const dueDate = normalizeDueDate(action.dueDate);
      if (!dueDate) {
        return {
          dueDate: null,
          time: null,
          reminder: null,
        };
      }
      return applyScheduleInvariants({
        dueDate,
        time: state.time,
        reminder: state.reminder,
      });
    }
    case 'DRAFT_SET_TIME': {
      const nextTime = normalizeTime(action.time);
      if (!nextTime) {
        return applyScheduleInvariants({
          dueDate: state.dueDate,
          time: null,
          reminder: null,
        });
      }

      return applyScheduleInvariants({
        dueDate: state.dueDate ?? normalizeDueDate(today),
        time: nextTime,
        reminder: state.reminder,
      });
    }
    case 'DRAFT_SET_REMINDER': {
      const reminder = normalizeReminder(action.reminder);
      if (!state.dueDate || !state.time) {
        return {
          ...state,
          reminder: null,
        };
      }
      return {
        ...state,
        reminder,
      };
    }
    default:
      return state;
  }
}

export function toRelativeReminder(offsetMinutes = 10): RelativeReminder {
  return {
    type: 'relative',
    offsetMinutes: Math.max(0, Math.floor(offsetMinutes)),
  };
}
