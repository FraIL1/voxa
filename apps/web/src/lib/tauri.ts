/**
 * Интеграция с Tauri-обёрткой. Все вызовы защищены isTauri() и динамическими
 * импортами: в обычном браузере этот код не исполняется.
 */

export function isTauri(): boolean {
  return '__TAURI_INTERNALS__' in window;
}

/** Глобальные хоткеи (работают даже когда окно свёрнуто): mute / deafen */
export async function registerGlobalShortcuts(actions: {
  toggleMute: () => void;
  toggleDeafen: () => void;
}): Promise<() => void> {
  if (!isTauri()) return () => undefined;

  const { register, unregister } = await import('@tauri-apps/plugin-global-shortcut');
  // PRD 7.4: mute Ctrl+Shift+M, deafen Ctrl+Shift+D
  await register('CommandOrControl+Shift+M', (event) => {
    if (event.state === 'Pressed') actions.toggleMute();
  }).catch(() => undefined);
  await register('CommandOrControl+Shift+D', (event) => {
    if (event.state === 'Pressed') actions.toggleDeafen();
  }).catch(() => undefined);

  return () => {
    void unregister('CommandOrControl+Shift+M').catch(() => undefined);
    void unregister('CommandOrControl+Shift+D').catch(() => undefined);
  };
}

/** Автозапуск при входе в систему (только Tauri) */
export async function getAutostart(): Promise<boolean> {
  if (!isTauri()) return false;
  const { isEnabled } = await import('@tauri-apps/plugin-autostart');
  return isEnabled().catch(() => false);
}

export async function setAutostart(enabled: boolean): Promise<void> {
  if (!isTauri()) return;
  const { enable, disable } = await import('@tauri-apps/plugin-autostart');
  await (enabled ? enable() : disable()).catch(() => undefined);
}
