fn main() {
    // За папкой с иконками tauri_build не следит: без этой строки сборка не
    // пересобиралась после замены иконок и приложение оставалось со старой
    println!("cargo:rerun-if-changed=icons");
    tauri_build::build()
}
