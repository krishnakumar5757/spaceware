use std::path::PathBuf;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;
use tauri::{AppHandle, Emitter, State};

use crate::filesystem::{get_mounted_filesystems, get_storage_summary_for_path};
use crate::models::{MountedFilesystem, ScanOptions, ScanProgress, ScanResult, StorageSummary};
use crate::scanner::DirectoryScanner;

pub struct ScannerState {
    pub cancel_flag: Arc<AtomicBool>,
    pub is_scanning: Arc<AtomicBool>,
}

impl Default for ScannerState {
    fn default() -> Self {
        Self {
            cancel_flag: Arc::new(AtomicBool::new(false)),
            is_scanning: Arc::new(AtomicBool::new(false)),
        }
    }
}

#[tauri::command]
pub fn get_mounts() -> Result<Vec<MountedFilesystem>, String> {
    get_mounted_filesystems()
}

#[tauri::command]
pub fn get_storage_summary(path: Option<String>) -> Result<StorageSummary, String> {
    let target = match path {
        Some(p) if !p.is_empty() => PathBuf::from(p),
        _ => {
            let home = std::env::var("HOME").unwrap_or_else(|_| "/".to_string());
            PathBuf::from(home)
        }
    };

    get_storage_summary_for_path(&target)
}

#[tauri::command]
pub async fn start_scan(
    app: AppHandle,
    state: State<'_, ScannerState>,
    options: Option<ScanOptions>,
) -> Result<ScanResult, String> {
    if state.is_scanning.load(Ordering::Relaxed) {
        return Err("A storage scan is already in progress".to_string());
    }

    state.cancel_flag.store(false, Ordering::Relaxed);
    state.is_scanning.store(true, Ordering::Relaxed);

    let cancel_flag = Arc::clone(&state.cancel_flag);
    let is_scanning = Arc::clone(&state.is_scanning);

    let scan_opts = match options {
        Some(mut opts) => {
            if opts.path.trim().is_empty() {
                opts.path = std::env::var("HOME").unwrap_or_else(|_| "/".to_string());
            }
            opts
        }
        _ => {
            let home = std::env::var("HOME").unwrap_or_else(|_| "/".to_string());
            ScanOptions {
                path: home,
                max_tree_depth: Some(3),
                exclude_paths: vec![".git".to_string(), "proc".to_string(), "sys".to_string()],
                same_filesystem: true,
                large_file_threshold_mb: Some(500),
            }
        }
    };

    let app_clone = app.clone();
    let res = tauri::async_runtime::spawn_blocking(move || {
        let mut scanner = match DirectoryScanner::new(scan_opts, cancel_flag) {
            Ok(s) => s,
            Err(e) => {
                is_scanning.store(false, Ordering::Relaxed);
                return Err(e);
            }
        };

        let scan_outcome = scanner.scan(Some(|progress: ScanProgress| {
            let _ = app_clone.emit("scan-progress", &progress);
        }));

        is_scanning.store(false, Ordering::Relaxed);
        scan_outcome
    })
    .await
    .map_err(|e| format!("Task execution failed: {}", e))?;

    res
}

#[tauri::command]
pub fn cancel_scan(state: State<'_, ScannerState>) -> Result<bool, String> {
    state.cancel_flag.store(true, Ordering::Relaxed);
    Ok(true)
}

#[tauri::command]
pub fn get_scan_status(state: State<'_, ScannerState>) -> Result<bool, String> {
    Ok(state.is_scanning.load(Ordering::Relaxed))
}
