import { invoke, isTauri } from '@tauri-apps/api/core';
import { open } from '@tauri-apps/plugin-shell';
import type { TaskActionBinding, UrlScheme } from '../types/models';

export function buildActionUrl(template: string, params: string[] = []): string {
  return params.reduce((url, param) => url.replace('{param}', param), template);
}

export async function executeTaskAction(binding: TaskActionBinding, scheme?: UrlScheme): Promise<void> {
  if (!scheme) {
    throw new Error('Action scheme not found');
  }

  if (scheme.kind === 'script') {
    const scriptPath = (binding.params?.[0] ?? scheme.template).trim();
    if (!scriptPath) {
      throw new Error('Script path is empty');
    }
    if (!isTauri()) {
      throw new Error('Script execution only works in Tauri desktop app');
    }
    await invoke('run_script', { path: scriptPath });
    return;
  }

  const finalUrl = buildActionUrl(scheme.template, binding.params ?? []);

  if (!finalUrl) {
    throw new Error('Action URL is empty');
  }

  if (isTauri()) {
    await open(finalUrl);
    return;
  }

  window.location.href = finalUrl;
}
