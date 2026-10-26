pub mod commands;
pub mod filesystem;
pub mod models;
pub mod scanner;

use commands::{
    cancel_scan, get_mounts, get_scan_status, get_storage_summary, start_scan, ScannerState,
};

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .manage(ScannerState::default())
        .plugin(tauri_plugin_opener::init())
        .invoke_handler(tauri::generate_handler![
            get_mounts,
            get_storage_summary,
            start_scan,
            cancel_scan,
            get_scan_status
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
