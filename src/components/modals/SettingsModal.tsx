import { Plus, Trash2, X } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { isTauri } from '@tauri-apps/api/core';
import { open, save } from '@tauri-apps/plugin-dialog';
import { AppSelect } from '../common/AppSelect';
import type { UrlScheme } from '../../types/models';

type SchemeDraft = Omit<UrlScheme, 'id'>;

const emptyDraft: SchemeDraft = {
  name: '',
  icon: '🔗',
  template: '',
  kind: 'url',
  paramType: 'string',
};

interface SettingsModalProps {
  isOpen: boolean;
  schemes: UrlScheme[];
  onClose: () => void;
  onCreate: (input: SchemeDraft) => Promise<void>;
  onUpdate: (schemeId: string, patch: SchemeDraft) => Promise<void>;
  onDelete: (schemeId: string) => Promise<void>;
  onExportBackup: (path: string) => Promise<string>;
  onImportBackup: (path: string) => Promise<void>;
}

export function SettingsModal({
  isOpen,
  schemes,
  onClose,
  onCreate,
  onUpdate,
  onDelete,
  onExportBackup,
  onImportBackup,
}: SettingsModalProps) {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [draft, setDraft] = useState<SchemeDraft>(emptyDraft);
  const [savedNotice, setSavedNotice] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const selectedScheme = useMemo(
    () => schemes.find((scheme) => scheme.id === selectedId),
    [schemes, selectedId],
  );

  useEffect(() => {
    if (!isOpen) {
      return;
    }

    setSavedNotice('');
    setSelectedId((prev) => prev ?? schemes[0]?.id ?? null);
  }, [isOpen, schemes]);

  useEffect(() => {
    if (!selectedScheme) {
      setDraft(emptyDraft);
      return;
    }

    setDraft({
      name: selectedScheme.name,
      icon: selectedScheme.icon,
      template: selectedScheme.template,
      kind: selectedScheme.kind ?? 'url',
      paramType: selectedScheme.paramType,
    });
  }, [selectedScheme]);

  if (!isOpen) {
    return null;
  }

  const isValid = draft.name.trim().length > 0 && draft.template.trim().length > 0;

  const handleDelete = async () => {
    if (!selectedId) {
      return;
    }
    setIsSubmitting(true);
    try {
      await onDelete(selectedId);
      setSelectedId(null);
      setDraft(emptyDraft);
      setSavedNotice('已删除动作');
    } catch (error) {
      console.error('Failed to delete scheme', error);
      window.alert('删除动作失败，请稍后重试。');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleSave = async () => {
    if (!isValid) {
      return;
    }
    setIsSubmitting(true);
    try {
      if (selectedId) {
        await onUpdate(selectedId, draft);
        setSavedNotice('已保存修改');
      } else {
        await onCreate(draft);
        setSavedNotice('已创建动作');
      }
    } catch (error) {
      console.error('Failed to save scheme', error);
      window.alert('保存动作失败，请稍后重试。');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleExportBackup = async () => {
    if (!isTauri()) {
      window.alert('导出备份仅支持 Tauri 桌面端。');
      return;
    }

    const datePart = new Date().toISOString().slice(0, 10);
    const selected = await save({
      title: '导出备份',
      defaultPath: `linkflow-backup-${datePart}.json`,
      filters: [{ name: 'JSON', extensions: ['json'] }],
    });

    if (!selected || Array.isArray(selected)) {
      return;
    }

    setIsSubmitting(true);
    try {
      const outputPath = await onExportBackup(selected);
      setSavedNotice(`备份已导出：${outputPath}`);
    } catch (error) {
      console.error('Failed to export backup', error);
      window.alert('导出备份失败，请稍后重试。');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleImportBackup = async () => {
    if (!isTauri()) {
      window.alert('导入备份仅支持 Tauri 桌面端。');
      return;
    }

    const selected = await open({
      multiple: false,
      directory: false,
      filters: [{ name: 'JSON', extensions: ['json'] }],
    });
    const filePath = Array.isArray(selected) ? selected[0] : selected;
    if (typeof filePath !== 'string' || !filePath.trim()) {
      return;
    }

    const confirm = window.confirm('导入会覆盖当前全部数据，是否继续？');
    if (!confirm) {
      return;
    }

    setIsSubmitting(true);
    try {
      await onImportBackup(filePath.trim());
      setSavedNotice('备份导入成功');
    } catch (error) {
      console.error('Failed to import backup', error);
      window.alert('导入备份失败，请检查文件格式。');
    } finally {
      setIsSubmitting(false);
    }
  };

  const content = (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4">
      <div className="flex h-[70vh] w-full max-w-4xl overflow-hidden rounded-xl bg-white shadow-lg">
        <aside className="flex w-72 shrink-0 flex-col border-r border-gray-200 bg-gray-50 p-3">
          <div className="mb-2 flex items-center justify-between px-1">
            <h3 className="text-sm font-semibold text-gray-700">动作模板</h3>
            <button
              type="button"
              onClick={() => {
                setSelectedId(null);
                setDraft(emptyDraft);
              }}
              className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs text-linkflow-accent transition hover:bg-blue-50"
            >
              <Plus size={12} />
              新建
            </button>
          </div>

          <div className="space-y-1 overflow-y-auto">
            {schemes.map((scheme) => (
              <button
                key={scheme.id}
                type="button"
                onClick={() => setSelectedId(scheme.id)}
                className={`flex w-full items-center gap-2 rounded-lg px-2 py-2 text-left text-sm ${
                  selectedId === scheme.id
                    ? 'bg-white text-linkflow-accent shadow-sm'
                    : 'text-gray-700 hover:bg-white/80'
                }`}
              >
                <span>{scheme.icon}</span>
                <span className="truncate">{scheme.name}</span>
              </button>
            ))}
          </div>
        </aside>

        <section className="flex min-w-0 flex-1 flex-col p-5">
          <div className="mb-4 flex items-center justify-between">
            <h3 className="text-lg font-semibold text-gray-800">
              {selectedId ? '编辑动作' : '新建动作'}
            </h3>
            <button
              type="button"
              onClick={onClose}
              className="rounded-md p-1 text-gray-400 transition hover:bg-gray-100 hover:text-gray-500"
            >
              <X size={16} />
            </button>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <label className="block">
              <span className="mb-1 block text-xs text-gray-400">动作名称</span>
              <input
                value={draft.name}
                onChange={(event) => setDraft((prev) => ({ ...prev, name: event.target.value }))}
                className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm text-gray-800 outline-none ring-linkflow-accent/20 focus:ring"
                placeholder="例如：腾讯会议"
              />
            </label>

            <label className="block">
              <span className="mb-1 block text-xs text-gray-400">图标（Emoji）</span>
              <input
                value={draft.icon}
                onChange={(event) => setDraft((prev) => ({ ...prev, icon: event.target.value }))}
                className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm text-gray-800 outline-none ring-linkflow-accent/20 focus:ring"
                placeholder="🔗"
              />
            </label>

            <label className="sm:col-span-2">
              <span className="mb-1 block text-xs text-gray-400">动作类型</span>
              <AppSelect
                value={draft.kind ?? 'url'}
                onChange={(value) =>
                  setDraft((prev) => ({
                    ...prev,
                    kind: value as SchemeDraft['kind'],
                  }))
                }
                options={[{ value: 'url', label: 'URL Scheme' }]}
                className="w-full"
              />
            </label>

            <label className="sm:col-span-2">
              <span className="mb-1 block text-xs text-gray-400">URL 模板</span>
              <input
                value={draft.template}
                onChange={(event) =>
                  setDraft((prev) => ({
                    ...prev,
                    template: event.target.value,
                  }))
                }
                className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm text-gray-800 outline-none ring-linkflow-accent/20 focus:ring"
                placeholder="例如：wemeet://inmeeting?code={param} 或 wechat://"
              />
              <p className="mt-1 text-xs text-gray-400">模板可包含或不包含 {'{param}'} 占位符。</p>
            </label>

            <label className="block">
              <span className="mb-1 block text-xs text-gray-400">参数类型</span>
              <AppSelect
                value={draft.paramType}
                onChange={(value) =>
                  setDraft((prev) => ({
                    ...prev,
                    paramType: value as SchemeDraft['paramType'],
                  }))
                }
                options={[
                  { value: 'string', label: '文本' },
                  { value: 'number', label: '仅数字' },
                ]}
                className="w-full"
              />
            </label>
          </div>

          <div className="mt-auto flex items-center justify-between border-t border-gray-100 pt-4">
            <div className="flex items-center gap-2">
              <button
                type="button"
                disabled={isSubmitting}
                onClick={() => void handleExportBackup()}
                className="rounded-lg border border-gray-200 px-3 py-2 text-sm text-gray-600 transition enabled:hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50"
              >
                导出备份
              </button>
              <button
                type="button"
                disabled={isSubmitting}
                onClick={() => void handleImportBackup()}
                className="rounded-lg border border-gray-200 px-3 py-2 text-sm text-gray-600 transition enabled:hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50"
              >
                导入备份
              </button>
              <button
                type="button"
                disabled={!selectedId || isSubmitting}
                onClick={() => void handleDelete()}
                className="inline-flex items-center gap-1 rounded-lg px-3 py-2 text-sm text-red-500 transition enabled:hover:bg-red-50 disabled:cursor-not-allowed disabled:text-gray-300"
              >
                <Trash2 size={14} />
                删除
              </button>
            </div>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={onClose}
                className="rounded-lg px-3 py-2 text-sm text-gray-500 transition hover:bg-gray-100"
              >
                取消
              </button>
              <button
                type="button"
                disabled={!isValid || isSubmitting}
                onClick={() => void handleSave()}
                className="rounded-lg bg-linkflow-accent px-3 py-2 text-sm text-white transition enabled:hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {isSubmitting ? '保存中...' : '保存'}
              </button>
            </div>
          </div>
          {savedNotice ? <p className="mt-2 text-right text-xs text-green-600">{savedNotice}</p> : null}
        </section>
      </div>
    </div>
  );

  return createPortal(content, document.body);
}
