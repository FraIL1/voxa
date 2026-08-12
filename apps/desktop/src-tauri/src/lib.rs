use tauri::{
    menu::{Menu, MenuItem},
    tray::{MouseButton, TrayIconBuilder, TrayIconEvent},
    Manager,
};

/// Интерфейс загрузился: гасим окно запуска и показываем главное.
/// Вызывается фронтендом, когда рисовать уже есть что.
#[tauri::command]
fn app_ready(app: tauri::AppHandle) {
    if let Some(splash) = app.get_webview_window("splash") {
        let _ = splash.close();
    }
    show_main_window(&app);
}

fn show_main_window(app: &tauri::AppHandle) {
    if let Some(window) = app.get_webview_window("main") {
        let _ = window.show();
        let _ = window.unminimize();
        let _ = window.set_focus();
    }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_global_shortcut::Builder::new().build())
        .plugin(tauri_plugin_notification::init())
        .plugin(tauri_plugin_autostart::init(
            tauri_plugin_autostart::MacosLauncher::LaunchAgent,
            None,
        ))
        .invoke_handler(tauri::generate_handler![app_ready])
        .setup(|app| {
            // Иконку окна ставим крупной: Windows сама уменьшит её под панель
            // задач, а из мелкой она получалась рассыпанной на пиксели
            if let Some(window) = app.get_webview_window("main") {
                if let Ok(icon) =
                    tauri::image::Image::from_bytes(include_bytes!("../icons/256x256.png"))
                {
                    let _ = window.set_icon(icon);
                }
            }

            // Трей: клик — показать окно; меню — открыть/выход
            let show = MenuItem::with_id(app, "show", "Открыть Voxa", true, None::<&str>)?;
            let quit = MenuItem::with_id(app, "quit", "Выход", true, None::<&str>)?;
            let menu = Menu::with_items(app, &[&show, &quit])?;

            // Иконку трея берём крупную: на экранах с высокой плотностью
            // мелкая растягивалась и рассыпалась на пиксели
            let tray_icon = tauri::image::Image::from_bytes(include_bytes!(
                "../icons/128x128.png"
            ))?;

            TrayIconBuilder::with_id("main")
                .icon(tray_icon)
                .tooltip("Voxa")
                .menu(&menu)
                .show_menu_on_left_click(false)
                .on_menu_event(|app, event| match event.id.as_ref() {
                    "show" => show_main_window(app),
                    "quit" => app.exit(0),
                    _ => {}
                })
                .on_tray_icon_event(|tray, event| {
                    if let TrayIconEvent::Click {
                        button: MouseButton::Left,
                        ..
                    } = event
                    {
                        show_main_window(tray.app_handle());
                    }
                })
                .build(app)?;

            Ok(())
        })
        .on_window_event(|window, event| {
            // Окно запуска закрывается по-настоящему, в трей прячется только главное
            if window.label() != "main" {
                return;
            }
            // Закрытие окна = сворачивание в трей; настоящий выход — из меню трея
            if let tauri::WindowEvent::CloseRequested { api, .. } = event {
                let _ = window.hide();
                api.prevent_close();
            }
        })
        .run(tauri::generate_context!())
        .expect("не удалось запустить Voxa");
}
