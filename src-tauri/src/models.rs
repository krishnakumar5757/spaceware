use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MountedFilesystem {
    pub device: String,
    pub mount_point: String,
    pub fs_type: String,
    pub total_bytes: u64,
    pub used_bytes: u64,
    pub free_bytes: u64,
    pub available_bytes: u64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct StorageSummary {
    pub drive_name: String,
    pub mount_point: String,
    pub filesystem: String,
    pub total_bytes: u64,
    pub used_bytes: u64,
    pub free_bytes: u64,
    #[serde(default)]
    pub available_bytes: u64,
    pub reclaimable_bytes: u64,
    pub last_scanned: String,
    #[serde(default)]
    pub is_live_data: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct StorageCategory {
    pub id: String,
    pub name: String,
    pub size_bytes: u64,
    pub file_count: u64,
    pub color: String,
    pub icon_name: String,
    pub description: String,
    pub percentage_of_used: f64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct FileItem {
    pub id: String,
    pub name: String,
    pub path: String,
    pub size_bytes: u64,
    pub category: String,
    pub extension: String,
    pub last_modified: String,
    pub last_accessed: String,
    #[serde(default)]
    pub is_locked: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CleanupRecommendation {
    pub id: String,
    pub title: String,
    pub category: String, // "cache" | "developer" | "logs" | "trash" | "package_cache" | "old_files"
    pub description: String,
    pub reclaimable_bytes: u64,
    pub file_count: u64,
    pub risk_level: String, // "safe" | "caution" | "manual_review"
    pub path: String,
    #[serde(default = "default_checked")]
    pub checked: bool,
    #[serde(default)]
    pub reason: Option<String>,
    #[serde(default)]
    pub action_type: Option<String>, // "trash" | "permanent_delete" | "manual_instruction"
    #[serde(default)]
    pub manual_command: Option<String>,
}

fn default_checked() -> bool {
    true
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CleanupActionRequest {
    pub candidate_ids: Vec<String>,
    pub action: String, // "trash" | "permanent_delete"
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CleanupItemResult {
    pub id: String,
    pub path: String,
    pub success: bool,
    pub bytes_freed: u64,
    pub files_removed: u64,
    pub error: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CleanupExecutionSummary {
    pub total_bytes_freed: u64,
    pub total_files_removed: u64,
    pub item_results: Vec<CleanupItemResult>,
    pub success_count: usize,
    pub failure_count: usize,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DirectoryNode {
    pub id: String,
    pub name: String,
    pub path: String,
    pub size_bytes: u64,
    #[serde(rename = "type")]
    pub node_type: String, // "folder" | "file"
    pub file_count: Option<u64>,
    pub category: Option<String>,
    pub children: Option<Vec<DirectoryNode>>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ScanOptions {
    pub path: String,
    pub max_tree_depth: Option<usize>,
    pub exclude_paths: Vec<String>,
    pub same_filesystem: bool,
    pub large_file_threshold_mb: Option<u64>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ScanProgress {
    pub is_scanning: bool,
    pub progress_percent: u8,
    pub current_path: String,
    pub files_scanned_count: u64,
    pub bytes_scanned: u64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ScanResult {
    pub root_path: String,
    pub summary: StorageSummary,
    pub categories: Vec<StorageCategory>,
    pub largest_files: Vec<FileItem>,
    pub recommendations: Vec<CleanupRecommendation>,
    pub directory_tree: DirectoryNode,
    pub total_files_scanned: u64,
    pub total_dirs_scanned: u64,
    pub total_bytes_scanned: u64,
    pub permission_denied_count: u64,
    pub permission_denied_paths: Vec<String>,
    pub scan_duration_ms: u64,
    pub is_live_data: bool,
}
