import { X } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { AppSelect } from '../common/AppSelect';
import type { RepeatType, Task } from '../../types/models';
import { applyScheduleInvariants, toRelativeReminder } from '../../utils/schedule';

interface TaskEditModalProps {
  task?: Task;
  isOpen: boolean;
  onClose: () => void;
  onSave: (taskId: string, patch: Partial<Task>) => void;
}

const WEEK_LABELS = ['日', '一', '二', '三', '四', '五', '六'];
const QUICK_MONTH_DAYS = [1, 5, 10, 15, 20, 25, 31];
const REMINDER_PRESETS = [0, 1, 2, 5, 10];

function getStepDelta(event: React.KeyboardEvent<HTMLInputElement>): -1 | 1 | null {
  if (event.code === 'Minus' || event.code === 'NumpadSubtract') {
    return -1;
  }
  if (event.code === 'Equal' || event.code === 'NumpadAdd') {
    return 1;
  }
  if (event.key === '-') {
    return -1;
  }
  if (event.key === '=' || event.key === '+') {
    return 1;
  }
  return null;
}

export function TaskEditModal({ task, isOpen, onClose, onSave }: TaskEditModalProps) {
  const [title, setTitle] = useState('');
  const [dueDate, setDueDate] = useState<string | null>(null);
  const [time, setTime] = useState<string | null>(null);
  const [reminderOffsetMinutes, setReminderOffsetMinutes] = useState(10);
  const [reminderEnabled, setReminderEnabled] = useState(false);
  const [repeatType, setRepeatType] = useState<RepeatType | 'none'>('none');
  const [repeatDaysOfWeek, setRepeatDaysOfWeek] = useState<number[]>([]);
  const [repeatDaysOfMonth, setRepeatDaysOfMonth] = useState<number[]>([]);

  useEffect(() => {
    if (!task || !isOpen) {
      return;
    }

    setTitle(task.title);
    setDueDate(task.dueDate ?? null);
    setTime(task.time ?? null);
    setReminderEnabled(task.reminder?.type === 'relative');
    setReminderOffsetMinutes(task.reminder?.type === 'relative' ? task.reminder.offsetMinutes : 10);
    setRepeatType(task.repeat?.type ?? 'none');
    setRepeatDaysOfWeek(task.repeat?.dayOfWeek ?? []);
    setRepeatDaysOfMonth(task.repeat?.dayOfMonth ?? []);
  }, [isOpen, task]);

  const monthDaysText = useMemo(() => repeatDaysOfMonth.join(','), [repeatDaysOfMonth]);
  const handleReminderStepKey = (event: React.KeyboardEvent<HTMLInputElement>) => {
    const delta = getStepDelta(event);
    if (delta == null) {
      return;
    }
    event.preventDefault();
    event.stopPropagation();
    setReminderOffsetMinutes((prev) => Math.max(0, prev + delta));
  };

  if (!isOpen || !task) {
    return null;
  }

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4">
      <div className="w-full max-w-lg rounded-xl bg-white p-5 shadow-lg">
        <div className="mb-4 flex items-center justify-between">
          <h3 className="text-lg font-semibold text-gray-800">编辑任务</h3>
          <button
            type="button"
            onClick={onClose}
            className="rounded-md p-1 text-gray-400 transition hover:bg-gray-100 hover:text-gray-600"
          >
            <X size={16} />
          </button>
        </div>

        <div className="space-y-3">
          <label className="block">
            <span className="mb-1 block text-xs text-gray-400">标题</span>
            <input
              value={title}
              onChange={(event) => setTitle(event.target.value)}
              className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm text-gray-700 outline-none ring-linkflow-accent/20 focus:ring"
            />
          </label>

          <div className="grid gap-3 sm:grid-cols-2">
            <label className="block">
              <span className="mb-1 block text-xs text-gray-400">日期</span>
              <input
                type="date"
                value={dueDate ?? ''}
                onChange={(event) => setDueDate(event.target.value || null)}
                className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm text-gray-700 outline-none ring-linkflow-accent/20 focus:ring"
              />
            </label>
            <label className="block">
              <span className="mb-1 block text-xs text-gray-400">时间</span>
              <input
                type="time"
                value={time ?? ''}
                onChange={(event) => setTime(event.target.value || null)}
                className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm text-gray-700 outline-none ring-linkflow-accent/20 focus:ring"
              />
            </label>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <label className="block">
              <span className="mb-1 block text-xs text-gray-400">重复</span>
              <AppSelect
                value={repeatType}
                onChange={(value) => setRepeatType(value as RepeatType | 'none')}
                options={[
                  { value: 'none', label: '不重复' },
                  { value: 'daily', label: '每天' },
                  { value: 'weekly', label: '每周' },
                  { value: 'monthly', label: '每月' },
                ]}
                className="w-full"
              />
            </label>
            <label className="flex items-end">
              <span className="inline-flex items-center gap-2 rounded-md bg-gray-50 px-3 py-2 text-sm text-gray-600">
                <input
                  type="checkbox"
                  checked={reminderEnabled}
                  onChange={(event) => setReminderEnabled(event.target.checked)}
                  className="h-4 w-4 rounded border-gray-300 text-linkflow-accent"
                />
                开启提醒
              </span>
            </label>
          </div>

          {reminderEnabled ? (
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-xs text-gray-400">提前</span>
              {REMINDER_PRESETS.map((preset) => (
                <button
                  key={preset}
                  type="button"
                  onClick={() => setReminderOffsetMinutes(preset)}
                  className={`rounded-md px-2 py-1 text-xs ${
                    reminderOffsetMinutes === preset
                      ? 'bg-linkflow-accent text-white'
                      : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                  }`}
                >
                  {preset}m
                </button>
              ))}
              <input
                type="text"
                inputMode="numeric"
                value={reminderOffsetMinutes}
                onChange={(event) => {
                  const digitsOnly = event.target.value.replace(/\D+/g, '');
                  setReminderOffsetMinutes(digitsOnly ? Math.max(0, Number(digitsOnly)) : 0);
                }}
                onKeyDown={handleReminderStepKey}
                className="w-20 rounded-lg border border-gray-200 px-2 py-1 text-sm text-gray-700 outline-none ring-linkflow-accent/20 focus:ring"
              />
              <span className="text-xs text-gray-400">分钟</span>
            </div>
          ) : null}

          {repeatType === 'weekly' ? (
            <div className="flex flex-wrap items-center gap-1">
              {WEEK_LABELS.map((label, day) => {
                const active = repeatDaysOfWeek.includes(day);
                return (
                  <button
                    key={label}
                    type="button"
                    onClick={() => {
                      if (active) {
                        setRepeatDaysOfWeek(repeatDaysOfWeek.filter((item) => item !== day));
                      } else {
                        setRepeatDaysOfWeek([...repeatDaysOfWeek, day]);
                      }
                    }}
                    className={`rounded-md px-2 py-1 text-xs ${
                      active
                        ? 'bg-linkflow-accent text-white'
                        : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                    }`}
                  >
                    周{label}
                  </button>
                );
              })}
            </div>
          ) : null}

          {repeatType === 'monthly' ? (
            <>
              <div className="flex flex-wrap items-center gap-1">
                {QUICK_MONTH_DAYS.map((day) => {
                  const active = repeatDaysOfMonth.includes(day);
                  return (
                    <button
                      key={day}
                      type="button"
                      onClick={() => {
                        if (active) {
                          setRepeatDaysOfMonth(repeatDaysOfMonth.filter((item) => item !== day));
                        } else {
                          setRepeatDaysOfMonth([...repeatDaysOfMonth, day]);
                        }
                      }}
                      className={`rounded-md px-2 py-1 text-xs ${
                        active
                          ? 'bg-linkflow-accent text-white'
                          : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                      }`}
                    >
                      {day}号
                    </button>
                  );
                })}
              </div>
              <label className="flex items-center gap-2 text-xs text-gray-400">
                自定义（逗号分隔）
                <input
                  value={monthDaysText}
                  onChange={(event) => {
                    const parsed = event.target.value
                      .split(',')
                      .map((item) => Number(item.trim()))
                      .filter((item) => Number.isInteger(item) && item >= 1 && item <= 31);
                    const unique = Array.from(new Set(parsed)).sort((a, b) => a - b);
                    setRepeatDaysOfMonth(unique);
                  }}
                  className="flex-1 rounded-md border border-gray-200 px-2 py-1 text-xs text-gray-700 outline-none focus:ring-2 focus:ring-linkflow-accent/20"
                  placeholder="例如: 1,15,28"
                />
              </label>
            </>
          ) : null}
        </div>

        <div className="mt-5 flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg px-3 py-2 text-sm text-gray-500 transition hover:bg-gray-100"
          >
            取消
          </button>
          <button
            type="button"
            onClick={() => {
              const nextRepeat =
                repeatType === 'none'
                  ? null
                  : repeatType === 'weekly'
                    ? repeatDaysOfWeek.length
                      ? { type: repeatType, dayOfWeek: [...repeatDaysOfWeek].sort((a, b) => a - b) }
                      : null
                    : repeatType === 'monthly'
                      ? repeatDaysOfMonth.length
                        ? { type: repeatType, dayOfMonth: [...repeatDaysOfMonth].sort((a, b) => a - b) }
                        : null
                      : { type: repeatType };

              const normalizedSchedule = applyScheduleInvariants({
                dueDate,
                time,
                reminder: reminderEnabled ? toRelativeReminder(reminderOffsetMinutes) : null,
              });

              onSave(task.id, {
                title: title.trim() || task.title,
                dueDate: normalizedSchedule.dueDate,
                time: normalizedSchedule.time,
                reminder: normalizedSchedule.reminder,
                repeat: nextRepeat,
              });
              onClose();
            }}
            className="rounded-lg bg-linkflow-accent px-3 py-2 text-sm text-white transition hover:opacity-90"
          >
            保存
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
