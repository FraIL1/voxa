import { isTauri } from './tauri';

/**
 * Нативное уведомление (упоминание, позже — ЛС). В Tauri — системное через
 * плагин, в браузере — Notification API. Разрешение запрашивается лениво.
 */
export async function notify(title: string, body: string): Promise<void> {
  try {
    if (isTauri()) {
      const plugin = await import('@tauri-apps/plugin-notification');
      let granted = await plugin.isPermissionGranted();
      if (!granted) {
        granted = (await plugin.requestPermission()) === 'granted';
      }
      if (granted) plugin.sendNotification({ title, body });
      return;
    }

    if (!('Notification' in window)) return;
    if (Notification.permission === 'default') {
      await Notification.requestPermission();
    }
    if (Notification.permission === 'granted') {
      new Notification(title, { body });
    }
  } catch {
    // без уведомления — не критично
  }
}
