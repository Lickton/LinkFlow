import { Bell, Calendar, ChevronDown, Clock3, Link2, Repeat2 } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { AppSelect } from '../common/AppSelect';
import type { List, RepeatType } from '../../types/models';

interface ActionPreview {
  key: string;
  label: string;
  params: string[];
}

interface TaskInputAreaProps {
  value: string;
  detail?: string;
  date?: string;
  time?: string;
  reminder?: boolean;
  reminderOffsetMinutes?: number;
  repeatType: RepeatType | 'none';
  repeatDaysOfWeek: number[];
  repeatDaysOfMonth: number[];
  actions?: ActionPreview[];
  showListPicker?: boolean;
  lists?: List[];
  selectedListId?: string | null;
  onChange: (value: string) => void;
  onDetailChange: (value: string) => void;
  onDateChange: (value?: string) => void;
  onTimeChange: (value?: string) => void;
  onReminderChange: (value: boolean) => void;
  onReminderOffsetChange: (value: number) => void;
  onRepeatTypeChange: (value: RepeatType | 'none') => void;
  onToggleRepeatWeekDay: (value: number) => void;
  onSetRepeatMonthDays: (value: number[]) => void;
  onSelectedListChange?: (value: string | null) => void;
  onSubmit: () => void;
  onOpenActionPicker: () => void;
}

const WEEK_LABELS = ['一', '二', '三', '四', '五', '六', '日'];
const QUICK_MONTH_DAYS = [1, 5, 10, 15, 20, 25, 31];
const REMINDER_PRESETS = [0, 1, 2, 5, 10];

export function TaskInputArea({
  value,
  detail,
  date,
  time,
  reminder,
  reminderOffsetMinutes,
  repeatType,
  repeatDaysOfWeek,
  repeatDaysOfMonth,
  actions,
  showListPicker,
  lists,
  selectedListId,
  onChange,
  onDetailChange,
  onDateChange,
  onTimeChange,
  onReminderChange,
  onReminderOffsetChange,
  onRepeatTypeChange,
  onToggleRepeatWeekDay,
  onSetRepeatMonthDays,
  onSelectedListChange,
  onSubmit,
  onOpenActionPicker,
}: TaskInputAreaProps) {
  const dateInputRef = useRef<HTMLInputElement>(null);
  const timeInputRef = useRef<HTMLInputElement>(null);
  const [activePanel, setActivePanel] = useState<'detail' | 'time' | 'reminder' | 'repeat' | null>(
    null,
  );
  const [timeDraft, setTimeDraft] = useState(time ?? '');

  const monthDaysText = useMemo(() => repeatDaysOfMonth.join(','), [repeatDaysOfMonth]);
  const canSubmit = value.trim().length > 0;

  useEffect(() => {
    setTimeDraft(time ?? '');
  }, [time]);

  const commitTimeDraft = () => {
    const normalized = timeDraft.trim();
    onTimeChange(normalized ? normalized : undefined);
  };

  const applyTimeDraft = (nextValue: string) => {
    setTimeDraft(nextValue);
    onTimeChange(nextValue || undefined);
  };

  const repeatLabel =
    repeatType === 'none'
      ? '重复'
      : repeatType === 'daily'
        ? '每天'
        : repeatType === 'weekly'
          ? `每周(${repeatDaysOfWeek.length})`
          : `每月(${repeatDaysOfMonth.length})`;

  const reminderLabel = reminder
    ? `提醒(${reminderOffsetMinutes ?? 10}分钟前)`
    : '提醒';

  return (
    <section className="mb-6 rounded-xl border border-gray-200 bg-white p-4">
      <div className="flex items-center gap-2">
        <input
          value={value}
          onChange={(event) => onChange(event.target.value)}
          placeholder="添加新任务"
          className="flex-1 border-none bg-transparent text-sm text-gray-800 outline-none placeholder:text-gray-400"
        />
        <button
          type="button"
          onClick={() => {
            commitTimeDraft();
            onSubmit();
          }}
          disabled={!canSubmit}
          className={`rounded-xl px-3 py-2 text-xs font-medium transition ${
            canSubmit
              ? 'bg-linkflow-accent text-white hover:opacity-90'
              : 'cursor-not-allowed bg-gray-200 text-gray-400'
          }`}
        >
          创建
        </button>
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-gray-100 pt-3">
        <ToolbarButton
          icon={<ChevronDown size={14} />}
          label="详情"
          active={activePanel === 'detail' || Boolean(detail?.trim())}
          onClick={() => setActivePanel((prev) => (prev === 'detail' ? null : 'detail'))}
        />

        {repeatType === 'none' ? (
          <ToolbarButton
            icon={<Calendar size={14} />}
            label={date ? `日期 ${date}` : '日期'}
            active={Boolean(date)}
            onClick={() => {
              const input = dateInputRef.current;
              if (!input) {
                return;
              }
              input.showPicker?.();
              input.focus();
            }}
          />
        ) : null}

        <ToolbarButton
          icon={<Clock3 size={14} />}
          label={time ? `时间 ${time}` : '时间'}
          active={activePanel === 'time' || Boolean(time)}
          onClick={() => setActivePanel((prev) => (prev === 'time' ? null : 'time'))}
        />

        <ToolbarButton
          icon={<Bell size={14} />}
          label={reminderLabel}
          active={activePanel === 'reminder' || Boolean(reminder)}
          onClick={() => setActivePanel((prev) => (prev === 'reminder' ? null : 'reminder'))}
        />

        <ToolbarButton
          icon={<Repeat2 size={14} />}
          label={repeatLabel}
          active={activePanel === 'repeat' || repeatType !== 'none'}
          onClick={() => setActivePanel((prev) => (prev === 'repeat' ? null : 'repeat'))}
        />

        <ToolbarButton icon={<Link2 size={14} />} label="动作" highlight onClick={onOpenActionPicker} />

        {showListPicker ? (
          <AppSelect
            value={selectedListId ?? '__none__'}
            onChange={(value) => onSelectedListChange?.(value === '__none__' ? null : value)}
            options={[
              { value: '__none__', label: '无', icon: '∅' },
              ...((lists ?? []).map((list) => ({
                value: list.id,
                label: list.name,
                icon: list.icon,
              })) as { value: string; label: string; icon: string }[]),
            ]}
            className="ml-auto w-48"
          />
        ) : null}
      </div>

      {activePanel ? (
        <div className="mt-3 rounded-2xl border border-gray-200/70 bg-gray-50 p-3">
          {activePanel === 'detail' ? (
            <label className="flex flex-col">
              <textarea
                value={detail ?? ''}
                onChange={(event) => onDetailChange(event.target.value)}
                rows={3}
                placeholder="输入任务详情..."
                className="w-full resize-none rounded-xl border border-gray-200 bg-white px-3 py-2 text-sm text-gray-700 outline-none transition focus:ring-2 focus:ring-linkflow-accent/15"
              />
            </label>
          ) : null}

          {activePanel === 'time' ? (
            <div className="flex items-center gap-2 transition-all duration-150">
              <span className="text-xs text-gray-400">时间</span>
              <input
                ref={timeInputRef}
                type="time"
                value={timeDraft}
                onInput={(event) => applyTimeDraft((event.target as HTMLInputElement).value)}
                onChange={(event) => applyTimeDraft(event.target.value)}
                className="h-8 w-[118px] rounded-2xl border border-gray-200/60 bg-white px-3 py-2 text-[14px] font-light tracking-[0.01em] text-gray-600 outline-none transition-all duration-150 hover:border-gray-300/70 hover:bg-gray-50 focus:border-gray-300 focus:ring-2 focus:ring-linkflow-accent/15"
              />
              {timeDraft ? (
                <button
                  type="button"
                  onClick={() => {
                    setTimeDraft('');
                    onTimeChange(undefined);
                  }}
                  className="rounded-2xl border border-transparent bg-white px-3 py-2 text-xs font-medium text-gray-500 transition-all duration-150 hover:border-gray-200/70 hover:bg-gray-100"
                >
                  清除
                </button>
              ) : null}
              <button
                type="button"
                onClick={() => {
                  const committed = timeInputRef.current?.value ?? timeDraft;
                  setTimeDraft(committed);
                  onTimeChange(committed || undefined);
                  setActivePanel(null);
                }}
                className="rounded-2xl border border-transparent bg-white px-3 py-2 text-xs font-medium text-gray-600 transition-all duration-150 hover:border-gray-200/70 hover:bg-gray-100"
              >
                确认
              </button>
            </div>
          ) : null}

          {activePanel === 'reminder' ? (
            <div className="flex flex-wrap items-center gap-2 transition-all duration-150">
              <button
                type="button"
                onClick={() => onReminderChange(!reminder)}
                className={`rounded-2xl border border-transparent px-3 py-2 text-xs font-medium transition-all duration-150 ${
                  reminder
                    ? 'bg-white text-gray-600 hover:border-gray-200/70'
                    : 'bg-white text-gray-500 hover:border-gray-200/70 hover:bg-gray-100'
                }`}
              >
                {reminder ? '已开启提醒' : '提醒已关闭'}
              </button>

              {!reminder ? <span className="text-xs text-gray-400">开启后可设置提前时间</span> : null}

              <span className="text-xs text-gray-400">提前</span>
              {REMINDER_PRESETS.map((preset) => (
                <button
                  key={preset}
                  type="button"
                  onClick={() => {
                    onReminderOffsetChange(preset);
                  }}
                  disabled={!reminder}
                  className={`rounded-2xl border border-transparent px-3 py-2 text-xs font-medium transition-all duration-150 ${
                    reminderOffsetMinutes === preset
                      ? 'bg-white text-gray-700'
                      : 'bg-white text-gray-500 hover:border-gray-200/70 hover:bg-gray-100'
                  } ${!reminder ? 'cursor-not-allowed opacity-40' : ''}`}
                >
                  {preset}m
                </button>
              ))}

              <input
                type="number"
                min={0}
                value={reminderOffsetMinutes ?? 10}
                onChange={(event) => {
                  const next = Math.max(0, Number(event.target.value) || 0);
                  onReminderOffsetChange(next);
                }}
                disabled={!reminder}
                className="h-8 w-20 rounded-2xl border border-gray-200/60 bg-white px-3 py-2 text-xs font-light text-gray-600 outline-none transition-all duration-150 hover:border-gray-300/70 focus:border-gray-300 focus:ring-2 focus:ring-linkflow-accent/15"
              />
              <span className="text-xs text-gray-400">分钟</span>
            </div>
          ) : null}

          {activePanel === 'repeat' ? (
            <div className="flex flex-col gap-2">
          <div className="flex flex-wrap items-center gap-2">
            <label className="text-xs text-gray-400">重复</label>
            <AppSelect
              value={repeatType}
              onChange={(value) => onRepeatTypeChange(value as RepeatType | 'none')}
              options={[
                { value: 'none', label: '不重复' },
                { value: 'daily', label: '每天' },
                { value: 'weekly', label: '每周' },
                { value: 'monthly', label: '每月' },
              ]}
              className="w-28"
            />
          </div>

              {repeatType === 'weekly' ? (
                <div className="flex flex-wrap items-center gap-1">
                  {WEEK_LABELS.map((label, day) => {
                    const active = repeatDaysOfWeek.includes(day);
                    return (
                      <button
                        key={label}
                        type="button"
                        onClick={() => onToggleRepeatWeekDay(day)}
                        className={`rounded-md px-2 py-1 text-xs transition ${
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
                              onSetRepeatMonthDays(repeatDaysOfMonth.filter((item) => item !== day));
                            } else {
                              onSetRepeatMonthDays([...repeatDaysOfMonth, day]);
                            }
                          }}
                          className={`rounded-md px-2 py-1 text-xs transition ${
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
                        onSetRepeatMonthDays(unique);
                      }}
                      className="flex-1 rounded-md border border-gray-200 px-2 py-1 text-xs text-gray-700 outline-none focus:ring-2 focus:ring-linkflow-accent/20"
                      placeholder="例如: 1,15,28"
                    />
                  </label>
                </>
              ) : null}
            </div>
          ) : null}
        </div>
      ) : null}

      <input
        ref={dateInputRef}
        type="date"
        value={date ?? ''}
        onChange={(event) => onDateChange(event.target.value || undefined)}
        className="sr-only"
      />

      {date || time || reminder || repeatType !== 'none' ? (
        <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-gray-100 pt-3">
          {date && repeatType === 'none' ? (
            <button
              type="button"
              onClick={() => onDateChange(undefined)}
              className="rounded-full bg-gray-100 px-2 py-1 text-xs text-gray-500 transition hover:bg-gray-200"
            >
              日期: {date} ×
            </button>
          ) : null}

          {time ? (
            <button
              type="button"
              onClick={() => onTimeChange(undefined)}
              className="rounded-full bg-gray-100 px-2 py-1 text-xs text-gray-500 transition hover:bg-gray-200"
            >
              时间: {time} ×
            </button>
          ) : null}

          {reminder ? (
            <button
              type="button"
              onClick={() => onReminderChange(false)}
              className="rounded-full bg-yellow-100 px-2 py-1 text-xs text-yellow-700 transition hover:bg-yellow-200"
            >
              提醒: 提前{reminderOffsetMinutes ?? 10}m ×
            </button>
          ) : null}

          {repeatType !== 'none' ? (
            <button
              type="button"
              onClick={() => onRepeatTypeChange('none')}
              className="rounded-full bg-blue-100 px-2 py-1 text-xs text-linkflow-accent transition hover:bg-blue-200"
            >
              {repeatType === 'daily'
                ? '重复: 每天'
                : repeatType === 'weekly'
                  ? `重复: 每周${repeatDaysOfWeek.map((day) => WEEK_LABELS[day]).join('/')}`
                  : `重复: 每月${repeatDaysOfMonth.join('/') || '-'}号`}
              {' ×'}
            </button>
          ) : null}
        </div>
      ) : null}

      {(actions?.length ?? 0) > 0 ? (
        <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-gray-100 pt-3">
          {actions?.map((action) => (
            <span key={action.key} className="rounded-full bg-blue-100 px-2 py-1 text-xs text-linkflow-accent">
              {action.label}
            </span>
          ))}
        </div>
      ) : null}
    </section>
  );
}

interface ToolbarButtonProps {
  icon: ReactNode;
  label: string;
  highlight?: boolean;
  active?: boolean;
  onClick?: () => void;
}

function ToolbarButton({ icon, label, highlight = false, active = false, onClick }: ToolbarButtonProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`inline-flex h-9 items-center gap-1 rounded-2xl border border-transparent px-3 py-2 text-xs font-medium transition-all duration-150 ${
        highlight
          ? 'text-gray-600 hover:border-gray-200/70 hover:bg-gray-50'
          : active
            ? 'bg-gray-100 text-gray-600'
            : 'text-gray-400 hover:border-gray-200/70 hover:bg-gray-50 hover:text-gray-500'
      }`}
    >
      {icon}
      <span>{label}</span>
    </button>
  );
}
