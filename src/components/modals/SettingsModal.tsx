import { Plus, Trash2, X } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import type { DragEvent } from 'react';
import { createPortal } from 'react-dom';
import { isTauri } from '@tauri-apps/api/core';
import { open } from '@tauri-apps/plugin-dialog';
import type { UrlScheme } from '../../types/models';

type SchemeDraft = Omit<UrlScheme, 'id'>;

const emptyDraft: SchemeDraft = {
  name: '',
  icon: '🔗',
  template: '',
  kind: 'url',
  paramType: 'string',
};

const isAbsolutePath = (value: string): boolean => /^\/|^[A-Za-z]:\\/.test(value);

interface SettingsModalProps {
  isOpen: boolean;
  schemes: UrlScheme[];
  onClose: () => void;
  onCreate: (input: SchemeDraft) => void;
  onUpdate: (schemeId: string, patch: SchemeDraft) => void;
  onDelete: (schemeId: string) => void;
}

export function SettingsModal({
  isOpen,
  schemes,
  onClose,
  onCreate,
  onUpdate,
  onDelete,
}: SettingsModalProps) {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [draft, setDraft] = useState<SchemeDraft>(emptyDraft);
  const [savedNotice, setSavedNotice] = useState('');

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

  const isScript = draft.kind === 'script';
  const isPathValid = !isScript || isAbsolutePath(draft.template.trim());
  const isValid = draft.name.trim().length > 0 && draft.template.trim().length > 0 && isPathValid;

  const handleDropPath = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    event.stopPropagation();

    const droppedText = event.dataTransfer.getData('text/plain')?.trim();
    if (droppedText.startsWith('/')) {
      setDraft((prev) => ({ ...prev, template: droppedText }));
      return;
    }

    const droppedFile = event.dataTransfer.files?.[0] as File & { path?: string };
    const droppedPath = droppedFile?.path?.trim();
    if (droppedPath && droppedPath.startsWith('/')) {
      setDraft((prev) => ({ ...prev, template: droppedPath }));
    }
  };

  const chooseScriptPath = async () => {
    if (!isTauri()) {
      window.alert('脚本文件选择仅支持 Tauri 桌面端。请直接粘贴绝对路径。');
      return;
    }

    try {
      const selected = await open({
        multiple: false,
        directory: false,
      });
      const filePath = Array.isArray(selected) ? selected[0] : selected;
      if (typeof filePath === 'string' && filePath.trim()) {
        setDraft((prev) => ({ ...prev, template: filePath.trim() }));
      }
    } catch (error) {
      console.error('Failed to pick script path', error);
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
              <select
                value={draft.kind ?? 'url'}
                onChange={(event) =>
                  setDraft((prev) => ({
                    ...prev,
                    kind: event.target.value as SchemeDraft['kind'],
                    paramType: event.target.value === 'script' ? 'string' : prev.paramType,
                  }))
                }
                className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm text-gray-800 outline-none ring-linkflow-accent/20 focus:ring"
              >
                <option value="url">URL Scheme</option>
                <option value="script">本地脚本</option>
              </select>
            </label>

            {draft.kind !== 'script' ? (
              <>
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
                  <select
                    value={draft.paramType}
                    onChange={(event) =>
                      setDraft((prev) => ({
                        ...prev,
                        paramType: event.target.value as SchemeDraft['paramType'],
                      }))
                    }
                    className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm text-gray-800 outline-none ring-linkflow-accent/20 focus:ring"
                  >
                    <option value="string">文本</option>
                    <option value="number">仅数字</option>
                  </select>
                </label>
              </>
            ) : (
              <div className="sm:col-span-2 space-y-2">
                <label className="block">
                  <span className="mb-1 block text-xs text-gray-400">脚本绝对路径</span>
                  <input
                    value={draft.template}
                    onChange={(event) =>
                      setDraft((prev) => ({
                        ...prev,
                        template: event.target.value,
                      }))
                    }
                    className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm text-gray-800 outline-none ring-linkflow-accent/20 focus:ring"
                    placeholder="/Users/you/scripts/run.sh"
                  />
                  <p className="mt-1 text-xs text-gray-400">仅支持绝对路径，示例：/Users/name/scripts/run.sh</p>
                  {!isPathValid ? (
                    <p className="mt-1 text-xs text-red-500">请填写绝对路径（例如 /Users/...）</p>
                  ) : null}
                </label>

                <div
                  onDragOver={(event) => event.preventDefault()}
                  onDrop={handleDropPath}
                  className="rounded-lg border border-dashed border-gray-300 bg-gray-50 px-3 py-3 text-xs text-gray-500"
                >
                  拖拽脚本文件到此处（将读取绝对路径）
                </div>

                <button
                  type="button"
                  onClick={chooseScriptPath}
                  className="rounded-lg border border-gray-200 px-3 py-2 text-sm text-gray-700 transition hover:bg-gray-50"
                >
                  从文件管理器选择
                </button>
              </div>
            )}
          </div>

          <div className="mt-auto flex items-center justify-between border-t border-gray-100 pt-4">
            <button
              type="button"
              disabled={!selectedId}
              onClick={() => {
                if (!selectedId) {
                  return;
                }

                onDelete(selectedId);
                setSelectedId(null);
                setDraft(emptyDraft);
              }}
              className="inline-flex items-center gap-1 rounded-lg px-3 py-2 text-sm text-red-500 transition enabled:hover:bg-red-50 disabled:cursor-not-allowed disabled:text-gray-300"
            >
              <Trash2 size={14} />
              删除
            </button>

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
                disabled={!isValid}
                onClick={() => {
                  if (!isValid) {
                    return;
                  }

                  if (selectedId) {
                    onUpdate(selectedId, draft);
                    setSavedNotice('已保存修改');
                  } else {
                    onCreate(draft);
                    setSavedNotice('已创建动作');
                  }
                }}
                className="rounded-lg bg-linkflow-accent px-3 py-2 text-sm text-white transition enabled:hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
              >
                保存
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
