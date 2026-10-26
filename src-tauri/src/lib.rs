pub mod cleanup;
pub mod commands;
pub mod explorer;
pub mod filesystem;
pub mod models;
pub mod scanner;

use commands::{
    ScannerState, cancel_scan, execute_cleanup, execute_selective_cleanup, get_cleanup_candidates,
    get_home_directory, get_mounts, get_scan_status, get_storage_summary, list_directory,
    preview_selective_cleanup, reveal_in_file_manager, scan_targets, start_scan,
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
            get_scan_status,
            get_cleanup_candidates,
            execute_cleanup,
            get_home_directory,
            list_directory,
            scan_targets,
            reveal_in_file_manager,
            preview_selective_cleanup,
            execute_selective_cleanup
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
