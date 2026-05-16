#[tauri::command]
fn reload_window(webview_window: tauri::WebviewWindow) {
    if let Ok(url) = webview_window.url() {
        let _ = webview_window.navigate(url);
    }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_sql::Builder::default().build())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .invoke_handler(tauri::generate_handler![reload_window])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
