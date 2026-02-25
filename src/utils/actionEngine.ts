import { isTauri } from '@tauri-apps/api/core';
import { open } from '@tauri-apps/plugin-shell';
import type { TaskActionBinding, UrlScheme } from '../types/models';

export function buildActionUrl(template: string, params: string[] = []): string {
  return params.reduce((url, param) => url.replace('{param}', param), template);
}

export async function executeTaskAction(binding: TaskActionBinding, scheme?: UrlScheme): Promise<void> {
  if (!scheme) {
    throw new Error('Action scheme not found');
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
