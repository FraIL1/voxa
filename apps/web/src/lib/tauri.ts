/**
 * Интеграция с Tauri-обёрткой. Все вызовы защищены isTauri() и динамическими
 * импортами: в обычном браузере этот код не исполняется.
 */

export function isTauri(): boolean {
  return '__TAURI_INTERNALS__' in window;
}

/** Окно приложения; в браузере методов окна нет */
async function mainWindow() {
  if (!isTauri()) return null;
  const { getCurrentWindow } = await import('@tauri-apps/api/window');
  return getCurrentWindow();
}

export async function minimizeWindow(): Promise<void> {
  await (await mainWindow())?.minimize();
}

export async function toggleMaximizeWindow(): Promise<void> {
  await (await mainWindow())?.toggleMaximize();
}

/** Закрытие окна прячет приложение в трей, а не завершает его */
export async function hideWindow(): Promise<void> {
  await (await mainWindow())?.hide();
}

/** Показ окна после загрузки интерфейса — чтобы не мигало пустым */
export async function revealWindow(): Promise<void> {
  const window = await mainWindow();
  if (!window) return;
  await window.show();
  await window.setFocus();
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
