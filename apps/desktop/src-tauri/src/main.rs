// Не открывать консольное окно в релизной сборке на Windows
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

fn main() {
    voxa_desktop_lib::run()
}
