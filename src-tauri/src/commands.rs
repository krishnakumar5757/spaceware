use std::path::PathBuf;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;
use tauri::{AppHandle, Emitter, State};

use crate::cleanup::{discover_real_cleanup_candidates, execute_validated_cleanup};
use crate::filesystem::{get_mounted_filesystems, get_storage_summary_for_path};
use crate::models::{
    CleanupActionRequest, CleanupExecutionSummary, CleanupRecommendation, MountedFilesystem,
    ScanOptions, ScanProgress, ScanResult, StorageSummary,
};
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

#[tauri::command]
pub fn get_cleanup_candidates() -> Result<Vec<CleanupRecommendation>, String> {
    Ok(discover_real_cleanup_candidates())
}

use crate::explorer::{
    execute_selective_cleanup_targets, get_user_home, list_directory_contents,
    preview_selective_cleanup_targets, reveal_path_in_file_manager, DirectoryListingResult,
    SelectiveCleanupPreview, SelectiveCleanupRequest,
};

#[tauri::command]
pub async fn execute_cleanup(
    request: CleanupActionRequest,
) -> Result<CleanupExecutionSummary, String> {
    tauri::async_runtime::spawn_blocking(move || {
        execute_validated_cleanup(request, None)
    })
    .await
    .map_err(|e| format!("Cleanup execution failed: {}", e))?
}

#[tauri::command]
pub fn get_home_directory() -> Result<String, String> {
    Ok(get_user_home().to_string_lossy().to_string())
}

#[tauri::command]
pub fn list_directory(
    path: Option<String>,
    page: Option<usize>,
    page_size: Option<usize>,
    show_hidden: Option<bool>,
) -> Result<DirectoryListingResult, String> {
    let p = path.unwrap_or_default();
    let pg = page.unwrap_or(1);
    let ps = page_size.unwrap_or(500);
    let sh = show_hidden.unwrap_or(false);
    list_directory_contents(&p, pg, ps, sh)
}

#[tauri::command]
pub async fn scan_targets(
    app: AppHandle,
    state: State<'_, ScannerState>,
    targets: Vec<String>,
) -> Result<ScanResult, String> {
    if targets.is_empty() {
        return Err("No targets provided for scan".to_string());
    }

    if state.is_scanning.load(Ordering::Relaxed) {
        return Err("A storage scan is already in progress".to_string());
    }

    state.cancel_flag.store(false, Ordering::Relaxed);
    state.is_scanning.store(true, Ordering::Relaxed);

    let cancel_flag = Arc::clone(&state.cancel_flag);
    let is_scanning = Arc::clone(&state.is_scanning);

    let primary = targets[0].clone();
    let scan_opts = ScanOptions {
        path: primary,
        max_tree_depth: Some(3),
        exclude_paths: vec![".git".to_string(), "proc".to_string(), "sys".to_string()],
        same_filesystem: true,
        large_file_threshold_mb: Some(500),
    };

    let target_paths: Vec<PathBuf> = targets.into_iter().map(PathBuf::from).collect();
    let app_clone = app.clone();

    let res = tauri::async_runtime::spawn_blocking(move || {
        let mut scanner = match DirectoryScanner::new(scan_opts, cancel_flag) {
            Ok(s) => s,
            Err(e) => {
                is_scanning.store(false, Ordering::Relaxed);
                return Err(e);
            }
        };

        let scan_outcome = scanner.scan_multiple_targets(&target_paths, Some(|progress: ScanProgress| {
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
pub fn reveal_in_file_manager(path: String) -> Result<(), String> {
    reveal_path_in_file_manager(&path)
}

#[tauri::command]
pub fn preview_selective_cleanup(paths: Vec<String>) -> Result<SelectiveCleanupPreview, String> {
    preview_selective_cleanup_targets(&paths)
}

#[tauri::command]
pub async fn execute_selective_cleanup(
    request: SelectiveCleanupRequest,
) -> Result<CleanupExecutionSummary, String> {
    tauri::async_runtime::spawn_blocking(move || {
        execute_selective_cleanup_targets(request, None)
    })
    .await
    .map_err(|e| format!("Selective cleanup execution failed: {}", e))?
}
