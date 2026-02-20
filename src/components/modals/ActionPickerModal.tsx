import { X } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { isTauri } from '@tauri-apps/api/core';
import { open } from '@tauri-apps/plugin-dialog';
import type { TaskActionBinding, UrlScheme } from '../../types/models';

interface ActionPickerModalProps {
  isOpen: boolean;
  schemes: UrlScheme[];
  initialActions?: TaskActionBinding[];
  onClose: () => void;
  onConfirm: (payload: { actions: TaskActionBinding[] }) => void;
}

const getExpectedParamCount = (scheme?: UrlScheme): number => {
  if (!scheme) {
    return 0;
  }
  if (scheme.kind === 'script') {
    return 1;
  }
  return (scheme.template.match(/\{param\}/g) ?? []).length;
};

const normalizeParams = (scheme: UrlScheme | undefined, params: string[] | undefined): string[] => {
  const expectedCount = getExpectedParamCount(scheme);
  return Array.from({ length: expectedCount }, (_, index) => params?.[index] ?? '');
};

export function ActionPickerModal({
  isOpen,
  schemes,
  initialActions,
  onClose,
  onConfirm,
}: ActionPickerModalProps) {
  const [query, setQuery] = useState('');
  const [selectedActions, setSelectedActions] = useState<TaskActionBinding[]>([]);

  useEffect(() => {
    if (!isOpen) {
      return;
    }

    const normalized = (initialActions ?? [])
      .filter((action) => schemes.some((scheme) => scheme.id === action.schemeId))
      .map((action) => ({
        schemeId: action.schemeId,
        params: normalizeParams(
          schemes.find((scheme) => scheme.id === action.schemeId),
          action.params,
        ),
      }));

    setSelectedActions(normalized);
    setQuery('');
  }, [initialActions, isOpen, schemes]);

  const selectedSchemeIds = useMemo(
    () => new Set(selectedActions.map((action) => action.schemeId)),
    [selectedActions],
  );

  const filteredSchemes = useMemo(() => {
    const keyword = query.trim().toLowerCase();

    return schemes.filter((scheme) => {
      if (selectedSchemeIds.has(scheme.id)) {
        return false;
      }
      if (!keyword) {
        return true;
      }

      return `${scheme.name} ${scheme.template} ${scheme.icon}`.toLowerCase().includes(keyword);
    });
  }, [query, schemes, selectedSchemeIds]);

  const isActionInvalid = (action: TaskActionBinding) => {
    const scheme = schemes.find((item) => item.id === action.schemeId);
    if (!scheme) {
      return true;
    }

    const expectedCount = getExpectedParamCount(scheme);
    if (expectedCount === 0) {
      return false;
    }

    if (scheme.kind === 'script') {
      const scriptPath = (action.params[0] ?? '').trim();
      const isAbsolutePath = /^\/|^[A-Za-z]:\\/.test(scriptPath);
      return !scriptPath || !isAbsolutePath;
    }

    return action.params.some((value) => value.trim() === '');
  };

  const confirmDisabled = selectedActions.length === 0 || selectedActions.some(isActionInvalid);

  const addAction = (scheme: UrlScheme) => {
    setSelectedActions((prev) => [
      ...prev,
      {
        schemeId: scheme.id,
        params: normalizeParams(scheme, []),
      },
    ]);
    setQuery('');
  };

  const removeAction = (schemeId: string) => {
    setSelectedActions((prev) => prev.filter((action) => action.schemeId !== schemeId));
  };

  const updateActionParam = (schemeId: string, index: number, value: string) => {
    const scheme = schemes.find((item) => item.id === schemeId);
    const normalizedValue =
      scheme?.kind !== 'script' && scheme?.paramType === 'number' ? value.replace(/\D/g, '') : value;

    setSelectedActions((prev) =>
      prev.map((action) =>
        action.schemeId === schemeId
          ? {
              ...action,
              params: action.params.map((item, itemIndex) =>
                itemIndex === index ? normalizedValue : item,
              ),
            }
          : action,
      ),
    );
  };

  const chooseScriptPath = async (schemeId: string) => {
    if (!isTauri()) {
      window.alert('文件选择仅支持 Tauri 桌面端。你也可以直接输入绝对路径。');
      return;
    }

    try {
      const selected = await open({
        multiple: false,
        directory: false,
      });
      const filePath = Array.isArray(selected) ? selected[0] : selected;
      if (typeof filePath === 'string' && filePath.trim()) {
        updateActionParam(schemeId, 0, filePath.trim());
      }
    } catch (error) {
      console.error('Failed to pick script path', error);
    }
  };

  if (!isOpen) {
    return null;
  }

  const content = (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4">
      <div className="w-full max-w-3xl rounded-xl bg-white p-5 shadow-lg">
        <div className="mb-4 flex items-center justify-between">
          <h3 className="text-lg font-semibold text-gray-800">配置动作</h3>
          <button
            type="button"
            onClick={onClose}
            className="rounded-md p-1 text-gray-400 transition hover:bg-gray-100 hover:text-gray-500"
          >
            <X size={16} />
          </button>
        </div>

        <div className="grid gap-4 md:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)]">
          <section className="min-h-0 rounded-lg border border-gray-200 p-3">
            <p className="mb-2 text-xs text-gray-400">搜索动作</p>
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="输入名称或 URL Scheme，例如 map / tel / wechat"
              className="mb-3 w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-800 outline-none ring-linkflow-accent/20 focus:ring"
            />

            <div className="max-h-72 space-y-1 overflow-y-auto">
              {filteredSchemes.length === 0 ? (
                <p className="px-2 py-1 text-xs text-gray-400">没有可添加的动作</p>
              ) : (
                filteredSchemes.map((scheme) => (
                  <button
                    key={scheme.id}
                    type="button"
                    onClick={() => addAction(scheme)}
                    className="flex w-full items-center justify-between rounded-md px-2 py-2 text-left transition hover:bg-gray-50"
                  >
                    <span className="truncate text-sm text-gray-700">
                      {scheme.icon} {scheme.name}
                      {scheme.kind === 'script' ? '（脚本）' : ''}
                    </span>
                    <span className="text-xs text-linkflow-accent">添加</span>
                  </button>
                ))
              )}
            </div>
          </section>

          <section className="min-h-0 rounded-lg border border-gray-200 p-3">
            <p className="mb-2 text-xs text-gray-400">已绑定动作（可共存）</p>
            <div className="max-h-72 space-y-3 overflow-y-auto pr-1">
              {selectedActions.length === 0 ? (
                <p className="text-xs text-gray-400">请从左侧搜索并添加至少一个动作</p>
              ) : (
                selectedActions.map((action) => {
                  const scheme = schemes.find((item) => item.id === action.schemeId);
                  if (!scheme) {
                    return null;
                  }

                  const isInvalid = isActionInvalid(action);
                  const isScriptAction = scheme.kind === 'script';
                  const templateParts = scheme.template.split('{param}');
                  const expectedParamCount = getExpectedParamCount(scheme);

                  return (
                    <div key={action.schemeId} className="rounded-lg border border-gray-200 bg-gray-50 p-2.5">
                      <div className="mb-2 flex items-center justify-between gap-2">
                        <p className="truncate text-sm font-medium text-gray-700">
                          {scheme.icon} {scheme.name}
                          {scheme.kind === 'script' ? ' · 脚本' : ''}
                        </p>
                        <button
                          type="button"
                          onClick={() => removeAction(scheme.id)}
                          className="rounded-md px-2 py-1 text-xs text-gray-500 transition hover:bg-gray-100"
                        >
                          移除
                        </button>
                      </div>

                      {isScriptAction ? (
                        <div className="space-y-2">
                          <input
                            value={action.params[0] ?? ''}
                            onChange={(event) => updateActionParam(scheme.id, 0, event.target.value)}
                            placeholder={scheme.template || '/Users/you/scripts/run.sh'}
                            className="w-full rounded-md border border-blue-100 bg-blue-50 px-2 py-1.5 text-sm text-linkflow-accent outline-none ring-linkflow-accent/20 focus:ring"
                          />
                          <button
                            type="button"
                            onClick={() => void chooseScriptPath(scheme.id)}
                            className="rounded-md border border-gray-200 bg-white px-2 py-1 text-xs text-gray-700 transition hover:bg-gray-50"
                          >
                            选择脚本文件
                          </button>
                        </div>
                      ) : expectedParamCount > 0 ? (
                        <div className="flex flex-wrap items-center gap-2 text-sm">
                          {templateParts.map((part, index) => (
                            <div key={`${part}-${index}`} className="flex items-center gap-2">
                              {part ? <span className="break-all text-gray-500">{part}</span> : null}
                              {index < expectedParamCount ? (
                                <input
                                  value={action.params[index] ?? ''}
                                  onChange={(event) =>
                                    updateActionParam(scheme.id, index, event.target.value)
                                  }
                                  placeholder={`参数 ${index + 1}`}
                                  className="w-36 rounded-md border border-blue-100 bg-blue-50 px-2 py-1 text-sm text-linkflow-accent outline-none ring-linkflow-accent/20 focus:ring"
                                />
                              ) : null}
                            </div>
                          ))}
                        </div>
                      ) : (
                        <p className="text-xs text-gray-500">无需参数</p>
                      )}

                      {isInvalid ? (
                        <p className="mt-2 text-xs text-red-500">
                          {isScriptAction ? '请填写脚本绝对路径' : '请填写完整参数'}
                        </p>
                      ) : null}
                    </div>
                  );
                })
              )}
            </div>
          </section>
        </div>

        <div className="mt-5 flex items-center justify-end gap-2">
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
              onConfirm({
                actions: selectedActions,
              });
              onClose();
            }}
            disabled={confirmDisabled}
            className="rounded-lg bg-linkflow-accent px-3 py-2 text-sm text-white transition enabled:hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
          >
            确认
          </button>
        </div>
      </div>
    </div>
  );

  return createPortal(content, document.body);
}
