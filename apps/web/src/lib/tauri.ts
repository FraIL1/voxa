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

/**
 * Интерфейс готов: приложение закрывает окно запуска и показывает главное.
 * Пока это не вызвано, пользователь видит заставку, а не пустое окно.
 */
export async function notifyAppReady(): Promise<void> {
  if (!isTauri()) return;
  const { invoke } = await import('@tauri-apps/api/core');
  await invoke('app_ready').catch(() => undefined);
}

/** Глобальные хоткеи (работают даже когда окно свёрнуто): mute / deafen */
/**
 * Системные сочетания: работают, даже когда окно не в фокусе.
 * Список приходит из настроек — что человек назначил, то и регистрируем.
 */
export async function registerGlobalShortcuts(
  binds: { accelerator: string; run: () => void }[],
): Promise<() => void> {
  if (!isTauri()) return () => undefined;

  const { register, unregister } = await import('@tauri-apps/plugin-global-shortcut');
  const registered: string[] = [];

  for (const { accelerator, run } of binds) {
    await register(accelerator, (event) => {
      if (event.state === 'Pressed') run();
    })
      .then(() => registered.push(accelerator))
      // Сочетание может быть занято другой программой — молча пропускаем
      .catch(() => undefined);
  }

  return () => {
    registered.forEach((accelerator) => void unregister(accelerator).catch(() => undefined));
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
