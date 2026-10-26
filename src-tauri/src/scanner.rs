use std::cmp::Ordering as CmpOrdering;
use std::collections::BinaryHeap;
use std::fs;
use std::os::unix::fs::MetadataExt;
use std::path::{Path, PathBuf};
use std::sync::Arc;
use std::sync::atomic::{AtomicBool, Ordering};
use std::time::{Instant, SystemTime, UNIX_EPOCH};

use crate::filesystem::get_storage_summary_for_path;
use crate::models::{
    CleanupRecommendation, DirectoryNode, FileItem, ScanOptions, ScanProgress, ScanResult,
    StorageCategory,
};

#[derive(Debug, Clone)]
struct TrackedFile {
    path: PathBuf,
    name: String,
    size: u64,
    extension: String,
    category: String,
    mtime: u64,
    atime: u64,
}

impl PartialEq for TrackedFile {
    fn eq(&self, other: &Self) -> bool {
        self.size == other.size
    }
}

impl Eq for TrackedFile {}

impl PartialOrd for TrackedFile {
    fn partial_cmp(&self, other: &Self) -> Option<CmpOrdering> {
        Some(self.cmp(other))
    }
}

// Min-heap ordering so smallest of top N is at root
impl Ord for TrackedFile {
    fn cmp(&self, other: &Self) -> CmpOrdering {
        other.size.cmp(&self.size)
    }
}

struct CategoryStats {
    id: &'static str,
    name: &'static str,
    color: &'static str,
    icon: &'static str,
    description: &'static str,
    size: u64,
    count: u64,
}

pub fn classify_file(ext: &str, path_str: &str) -> (&'static str, &'static str) {
    let lower_ext = ext.to_lowercase();
    let lower_path = path_str.to_lowercase();

    if lower_path.contains("/target/")
        || lower_path.contains("/node_modules/")
        || lower_path.contains("/.cargo/")
        || lower_path.contains("/.gradle/")
        || [
            "rs", "ts", "tsx", "js", "jsx", "py", "go", "c", "cpp", "h", "hpp", "java", "json",
            "toml", "yaml", "yml", "html", "css", "lock", "rlib",
        ]
        .contains(&lower_ext.as_str())
    {
        return ("developer", "Developer & Builds");
    }

    if [
        "mov", "mp4", "mkv", "avi", "webm", "flac", "wav", "mp3", "aac", "ogg", "png", "jpg",
        "jpeg", "gif", "webp", "raw", "braw", "svg", "tiff",
    ]
    .contains(&lower_ext.as_str())
    {
        return ("media", "Media & Videos");
    }

    if lower_path.starts_with("/usr/")
        || lower_path.starts_with("/lib")
        || lower_path.starts_with("/boot")
        || lower_path.starts_with("/etc")
        || ["ko", "sys", "efi", "img"].contains(&lower_ext.as_str())
    {
        return ("system", "System & Core");
    }

    if [
        "bin", "exe", "appimage", "flatpak", "so", "vpk", "pak", "apk",
    ]
    .contains(&lower_ext.as_str())
        || lower_path.contains("/.local/share/flatpak/")
        || lower_path.contains("/steamapps/")
    {
        return ("apps", "Apps & Flatpaks");
    }

    if [
        "pdf", "doc", "docx", "xls", "xlsx", "ppt", "pptx", "txt", "md", "zip", "gz", "bz2", "7z",
        "rar", "iso", "tar", "zst", "csv",
    ]
    .contains(&lower_ext.as_str())
    {
        return ("documents", "Documents & Archives");
    }

    ("other", "Other / Unsorted")
}

pub const MAX_PERMISSION_DENIED_PATHS: usize = 500;

pub struct DirectoryScanner {
    options: ScanOptions,
    cancel_flag: Arc<AtomicBool>,
    total_files: u64,
    total_dirs: u64,
    total_bytes: u64,
    root_dev: u64,
    largest_files: BinaryHeap<TrackedFile>,
    max_largest: usize,
    categories: Vec<CategoryStats>,
    permission_denied_count: u64,
    permission_denied_paths: Vec<String>,
    start_time: Instant,
    last_progress_emit: Instant,
}

impl DirectoryScanner {
    pub fn new(options: ScanOptions, cancel_flag: Arc<AtomicBool>) -> Result<Self, String> {
        let root = Path::new(&options.path);
        let root_meta =
            fs::symlink_metadata(root).map_err(|e| format!("Failed to access root path: {}", e))?;
        let root_dev = root_meta.dev();

        let categories = vec![
            CategoryStats {
                id: "media",
                name: "Media & Videos",
                color: "#38BDF8",
                icon: "Film",
                description: "Videos, audio recordings, RAW photos, design renders",
                size: 0,
                count: 0,
            },
            CategoryStats {
                id: "apps",
                name: "Apps & Flatpaks",
                color: "#A78BFA",
                icon: "Boxes",
                description: "Executable binaries, flatpak runtimes, Steam packages",
                size: 0,
                count: 0,
            },
            CategoryStats {
                id: "system",
                name: "System & Core",
                color: "#F472B6",
                icon: "Cpu",
                description: "Shared libraries, kernel modules, system configs",
                size: 0,
                count: 0,
            },
            CategoryStats {
                id: "developer",
                name: "Developer & Builds",
                color: "#C7F36B",
                icon: "Code2",
                description: "Codebases, target builds, node_modules, cache artifacts",
                size: 0,
                count: 0,
            },
            CategoryStats {
                id: "documents",
                name: "Documents & Archives",
                color: "#FBBF24",
                icon: "FileArchive",
                description: "PDFs, compressed archives, datasets, ISO images",
                size: 0,
                count: 0,
            },
            CategoryStats {
                id: "other",
                name: "Other / Unsorted",
                color: "#94A3B8",
                icon: "FolderMinus",
                description: "Browser sandbox caches, thumbnails, temporary files",
                size: 0,
                count: 0,
            },
        ];

        Ok(Self {
            options,
            cancel_flag,
            total_files: 0,
            total_dirs: 0,
            total_bytes: 0,
            root_dev,
            largest_files: BinaryHeap::with_capacity(100),
            max_largest: 50,
            categories,
            permission_denied_count: 0,
            permission_denied_paths: Vec::new(),
            start_time: Instant::now(),
            last_progress_emit: Instant::now(),
        })
    }

    /// Records a permission-denied error, capping the path list to prevent unbounded memory usage
    fn record_permission_denied(&mut self, path_str: String) {
        self.permission_denied_count += 1;
        if self.permission_denied_paths.len() < MAX_PERMISSION_DENIED_PATHS {
            self.permission_denied_paths.push(path_str);
        }
    }

    pub fn scan<F>(&mut self, progress_cb: Option<F>) -> Result<ScanResult, String>
    where
        F: Fn(ScanProgress),
    {
        let root_path = PathBuf::from(&self.options.path);
        let max_tree_depth = self.options.max_tree_depth.unwrap_or(3);

        let tree_node = self.scan_dir_recursive(&root_path, 0, max_tree_depth, &progress_cb)?;

        let scan_duration_ms = self.start_time.elapsed().as_millis() as u64;

        // Build summary from real mounted storage
        let mut summary = get_storage_summary_for_path(&root_path).unwrap_or_else(|_| {
            crate::models::StorageSummary {
                drive_name: "Local Volume".to_string(),
                mount_point: self.options.path.clone(),
                filesystem: "Local".to_string(),
                total_bytes: self.total_bytes,
                used_bytes: self.total_bytes,
                free_bytes: 0,
                available_bytes: 0,
                reclaimable_bytes: 0,
                last_scanned: "Just now".to_string(),
                is_live_data: true,
            }
        });

        // Compute categories
        let total_used = if summary.used_bytes > 0 {
            summary.used_bytes
        } else {
            self.total_bytes.max(1)
        };

        let storage_categories: Vec<StorageCategory> = self
            .categories
            .iter()
            .map(|c| {
                let pct = (c.size as f64 / total_used as f64) * 100.0;
                StorageCategory {
                    id: c.id.to_string(),
                    name: c.name.to_string(),
                    size_bytes: c.size,
                    file_count: c.count,
                    color: c.color.to_string(),
                    icon_name: c.icon.to_string(),
                    description: c.description.to_string(),
                    percentage_of_used: (pct * 10.0).round() / 10.0,
                }
            })
            .collect();

        // Sort largest files by size descending
        let mut sorted_largest: Vec<TrackedFile> = self.largest_files.clone().into_vec();
        sorted_largest.sort_by(|a, b| b.size.cmp(&a.size));

        let largest_file_items: Vec<FileItem> = sorted_largest
            .into_iter()
            .enumerate()
            .map(|(idx, f)| {
                let mtime_str = format_epoch_date(f.mtime);
                let atime_str = format_epoch_date(f.atime);
                FileItem {
                    id: format!("real-file-{}", idx + 1),
                    name: f.name,
                    path: f.path.to_string_lossy().to_string(),
                    size_bytes: f.size,
                    category: f.category,
                    extension: f.extension,
                    last_modified: mtime_str,
                    last_accessed: atime_str,
                    is_locked: false,
                }
            })
            .collect();

        // Discover real cleanup recommendations on disk
        let recommendations = self.detect_cleanup_recommendations();
        let reclaimable_sum = recommendations.iter().map(|r| r.reclaimable_bytes).sum();
        summary.reclaimable_bytes = reclaimable_sum;

        Ok(ScanResult {
            root_path: self.options.path.clone(),
            summary,
            categories: storage_categories,
            largest_files: largest_file_items,
            recommendations,
            directory_tree: tree_node,
            total_files_scanned: self.total_files,
            total_dirs_scanned: self.total_dirs,
            total_bytes_scanned: self.total_bytes,
            permission_denied_count: self.permission_denied_count,
            permission_denied_paths: self.permission_denied_paths.clone(),
            scan_duration_ms,
            is_live_data: true,
        })
    }

    pub fn scan_multiple_targets<F>(
        &mut self,
        targets: &[PathBuf],
        progress_cb: Option<F>,
    ) -> Result<ScanResult, String>
    where
        F: Fn(ScanProgress),
    {
        if targets.is_empty() {
            return Err("No targets provided for scan".to_string());
        }

        let max_tree_depth = self.options.max_tree_depth.unwrap_or(3);
        let mut child_nodes = Vec::new();
        let mut total_root_size = 0u64;
        let mut total_root_files = 0u64;

        for target in targets {
            if self.cancel_flag.load(Ordering::Relaxed) {
                return Err("Scan was cancelled by user".to_string());
            }

            let meta = match fs::symlink_metadata(target) {
                Ok(m) => m,
                Err(e) => {
                    self.record_permission_denied(format!("{}: {}", target.display(), e));
                    continue;
                }
            };

            if meta.file_type().is_symlink() {
                // Do not follow symlinks
                continue;
            }

            if meta.is_dir() {
                let node = self.scan_dir_recursive(target, 0, max_tree_depth, &progress_cb)?;
                total_root_size += node.size_bytes;
                total_root_files += node.file_count.unwrap_or(0);
                child_nodes.push(node);
            } else {
                let size = meta.len();
                let name = target
                    .file_name()
                    .and_then(|s| s.to_str())
                    .unwrap_or("file")
                    .to_string();
                let ext = target
                    .extension()
                    .and_then(|s| s.to_str())
                    .unwrap_or("")
                    .to_string();
                let path_str = target.to_string_lossy().to_string();
                let (cat_id, _) = classify_file(&ext, &path_str);

                if let Some(cat) = self.categories.iter_mut().find(|c| c.id == cat_id) {
                    cat.size += size;
                    cat.count += 1;
                }

                self.total_files += 1;
                self.total_bytes += size;
                total_root_size += size;
                total_root_files += 1;

                let mtime = meta.mtime() as u64;
                let atime = meta.atime() as u64;

                let tracked = TrackedFile {
                    path: target.clone(),
                    name: name.clone(),
                    size,
                    extension: ext.clone(),
                    category: cat_id.to_string(),
                    mtime,
                    atime,
                };

                if self.largest_files.len() < self.max_largest {
                    self.largest_files.push(tracked);
                } else if let Some(smallest) = self.largest_files.peek() {
                    if tracked.size > smallest.size {
                        self.largest_files.pop();
                        self.largest_files.push(tracked);
                    }
                }

                child_nodes.push(DirectoryNode {
                    id: format!("node-{}", path_str),
                    name,
                    path: path_str,
                    size_bytes: size,
                    node_type: "file".to_string(),
                    file_count: Some(1),
                    category: Some(cat_id.to_string()),
                    children: None,
                });

                if let Some(ref cb) = progress_cb {
                    cb(ScanProgress {
                        is_scanning: true,
                        progress_percent: 50,
                        current_path: target.to_string_lossy().to_string(),
                        files_scanned_count: self.total_files,
                        bytes_scanned: self.total_bytes,
                    });
                }
            }
        }

        let root_title = if targets.len() == 1 {
            targets[0]
                .file_name()
                .and_then(|s| s.to_str())
                .unwrap_or("Selected Target")
                .to_string()
        } else {
            format!("Selected Items ({} targets)", targets.len())
        };

        let root_path_str = if targets.len() == 1 {
            targets[0].to_string_lossy().to_string()
        } else {
            targets[0]
                .parent()
                .map(|p| p.to_string_lossy().to_string())
                .unwrap_or_else(|| "/".to_string())
        };

        let tree_node = DirectoryNode {
            id: "root-selected-targets".to_string(),
            name: root_title,
            path: root_path_str.clone(),
            size_bytes: total_root_size,
            node_type: "folder".to_string(),
            file_count: Some(total_root_files),
            category: None,
            children: Some(child_nodes),
        };

        let scan_duration_ms = self.start_time.elapsed().as_millis() as u64;

        let primary_path = &targets[0];
        let mut summary = get_storage_summary_for_path(primary_path).unwrap_or_else(|_| {
            crate::models::StorageSummary {
                drive_name: "Local Volume".to_string(),
                mount_point: root_path_str.clone(),
                filesystem: "Local".to_string(),
                total_bytes: self.total_bytes,
                used_bytes: self.total_bytes,
                free_bytes: 0,
                available_bytes: 0,
                reclaimable_bytes: 0,
                last_scanned: "Just now".to_string(),
                is_live_data: true,
            }
        });

        let total_used = if summary.used_bytes > 0 {
            summary.used_bytes
        } else {
            self.total_bytes.max(1)
        };

        let storage_categories: Vec<StorageCategory> = self
            .categories
            .iter()
            .map(|c| {
                let pct = (c.size as f64 / total_used as f64) * 100.0;
                StorageCategory {
                    id: c.id.to_string(),
                    name: c.name.to_string(),
                    size_bytes: c.size,
                    file_count: c.count,
                    color: c.color.to_string(),
                    icon_name: c.icon.to_string(),
                    description: c.description.to_string(),
                    percentage_of_used: (pct * 10.0).round() / 10.0,
                }
            })
            .collect();

        let mut sorted_largest: Vec<TrackedFile> = self.largest_files.clone().into_vec();
        sorted_largest.sort_by(|a, b| b.size.cmp(&a.size));

        let largest_file_items: Vec<FileItem> = sorted_largest
            .into_iter()
            .enumerate()
            .map(|(idx, f)| {
                let mtime_str = format_epoch_date(f.mtime);
                let atime_str = format_epoch_date(f.atime);
                FileItem {
                    id: format!("real-file-{}", idx + 1),
                    name: f.name,
                    path: f.path.to_string_lossy().to_string(),
                    size_bytes: f.size,
                    category: f.category,
                    extension: f.extension,
                    last_modified: mtime_str,
                    last_accessed: atime_str,
                    is_locked: false,
                }
            })
            .collect();

        let recommendations = self.detect_cleanup_recommendations();
        let reclaimable_sum = recommendations.iter().map(|r| r.reclaimable_bytes).sum();
        summary.reclaimable_bytes = reclaimable_sum;

        Ok(ScanResult {
            root_path: root_path_str,
            summary,
            categories: storage_categories,
            largest_files: largest_file_items,
            recommendations,
            directory_tree: tree_node,
            total_files_scanned: self.total_files,
            total_dirs_scanned: self.total_dirs,
            total_bytes_scanned: self.total_bytes,
            permission_denied_count: self.permission_denied_count,
            permission_denied_paths: self.permission_denied_paths.clone(),
            scan_duration_ms,
            is_live_data: true,
        })
    }

    fn scan_dir_recursive<F>(
        &mut self,
        current_dir: &Path,
        current_depth: usize,
        max_tree_depth: usize,
        progress_cb: &Option<F>,
    ) -> Result<DirectoryNode, String>
    where
        F: Fn(ScanProgress),
    {
        if self.cancel_flag.load(Ordering::Relaxed) {
            return Err("Scan cancelled by user".to_string());
        }

        self.total_dirs += 1;

        let dir_entries = match fs::read_dir(current_dir) {
            Ok(entries) => entries,
            Err(e) => {
                if e.kind() == std::io::ErrorKind::PermissionDenied {
                    self.record_permission_denied(current_dir.to_string_lossy().to_string());
                }
                return Ok(DirectoryNode {
                    id: format!("node-{}", self.total_dirs),
                    name: current_dir
                        .file_name()
                        .unwrap_or_default()
                        .to_string_lossy()
                        .to_string(),
                    path: current_dir.to_string_lossy().to_string(),
                    size_bytes: 0,
                    node_type: "folder".to_string(),
                    file_count: Some(0),
                    category: None,
                    children: None,
                });
            }
        };

        let mut child_nodes = Vec::new();
        let mut dir_size: u64 = 0;
        let mut dir_file_count: u64 = 0;

        for entry_res in dir_entries {
            if self.cancel_flag.load(Ordering::Relaxed) {
                return Err("Scan cancelled by user".to_string());
            }

            let entry = match entry_res {
                Ok(e) => e,
                Err(e) => {
                    if e.kind() == std::io::ErrorKind::PermissionDenied {
                        self.record_permission_denied(current_dir.to_string_lossy().to_string());
                    }
                    continue;
                }
            };

            let file_path = entry.path();
            let file_name = entry.file_name().to_string_lossy().to_string();

            // Check exclusions
            if self
                .options
                .exclude_paths
                .iter()
                .any(|ex| file_name == *ex || file_path.to_string_lossy().contains(ex))
            {
                continue;
            }

            // CRITICAL: NEVER follow symlinks! Use symlink_metadata
            let meta = match fs::symlink_metadata(&file_path) {
                Ok(m) => m,
                Err(e) => {
                    if e.kind() == std::io::ErrorKind::PermissionDenied {
                        self.record_permission_denied(file_path.to_string_lossy().to_string());
                    }
                    continue;
                }
            };

            let file_type = meta.file_type();

            // If it is a symlink, DO NOT recurse. Count it as a single symlink entry.
            if file_type.is_symlink() {
                let size = meta.len();
                dir_size += size;
                self.total_bytes += size;
                continue;
            }

            // CRITICAL: Do not cross filesystem boundaries if same_filesystem is true
            if self.options.same_filesystem && meta.dev() != self.root_dev {
                continue;
            }

            if file_type.is_dir() {
                let should_collect_tree = current_depth < max_tree_depth;
                let child_node = self.scan_dir_recursive(
                    &file_path,
                    current_depth + 1,
                    max_tree_depth,
                    progress_cb,
                )?;
                dir_size += child_node.size_bytes;
                dir_file_count += child_node.file_count.unwrap_or(0);

                if should_collect_tree {
                    child_nodes.push(child_node);
                }
            } else if file_type.is_file() {
                let size = meta.len();
                let ext = file_path
                    .extension()
                    .and_then(|e| e.to_str())
                    .unwrap_or("")
                    .to_string();
                let path_str = file_path.to_string_lossy().to_string();

                dir_size += size;
                dir_file_count += 1;
                self.total_files += 1;
                self.total_bytes += size;

                // Category classification
                let (cat_id, _) = classify_file(&ext, &path_str);
                if let Some(cat) = self.categories.iter_mut().find(|c| c.id == cat_id) {
                    cat.size += size;
                    cat.count += 1;
                }

                // Track largest files
                let mtime = meta.mtime() as u64;
                let atime = meta.atime() as u64;

                let tracked = TrackedFile {
                    path: file_path.clone(),
                    name: file_name,
                    size,
                    extension: ext,
                    category: cat_id.to_string(),
                    mtime,
                    atime,
                };

                if self.largest_files.len() < self.max_largest {
                    self.largest_files.push(tracked);
                } else if let Some(min_top) = self.largest_files.peek() {
                    if size > min_top.size {
                        self.largest_files.pop();
                        self.largest_files.push(tracked);
                    }
                }

                // Progress update every 250 files or 100ms
                if self.total_files % 250 == 0 && self.last_progress_emit.elapsed().as_millis() > 80
                {
                    self.last_progress_emit = Instant::now();
                    if let Some(cb) = progress_cb {
                        cb(ScanProgress {
                            is_scanning: true,
                            progress_percent: ((self.total_files % 100) as u8).max(1),
                            current_path: path_str,
                            files_scanned_count: self.total_files,
                            bytes_scanned: self.total_bytes,
                        });
                    }
                }
            }
        }

        // Sort children by size descending for clean drill-down
        child_nodes.sort_by(|a, b| b.size_bytes.cmp(&a.size_bytes));
        // Keep top 20 children per folder node
        child_nodes.truncate(20);

        let name = current_dir
            .file_name()
            .map(|n| n.to_string_lossy().to_string())
            .unwrap_or_else(|| current_dir.to_string_lossy().to_string());

        Ok(DirectoryNode {
            id: format!("dir-node-{}", self.total_dirs),
            name,
            path: current_dir.to_string_lossy().to_string(),
            size_bytes: dir_size,
            node_type: "folder".to_string(),
            file_count: Some(dir_file_count),
            category: None,
            children: if child_nodes.is_empty() {
                None
            } else {
                Some(child_nodes)
            },
        })
    }

    /// Checks for real, actionable cleanup candidates on disk
    fn detect_cleanup_recommendations(&self) -> Vec<CleanupRecommendation> {
        crate::cleanup::discover_real_cleanup_candidates()
    }
}

pub fn format_epoch_date(secs: u64) -> String {
    if secs == 0 {
        return "Unknown".to_string();
    }
    let dur = std::time::Duration::from_secs(secs);
    let time = UNIX_EPOCH + dur;

    if let Ok(elapsed) = SystemTime::now().duration_since(time) {
        let days = elapsed.as_secs() / 86400;
        if days == 0 {
            "Today".to_string()
        } else if days == 1 {
            "Yesterday".to_string()
        } else if days < 30 {
            format!("{} days ago", days)
        } else {
            let months = days / 30;
            format!("{} months ago", months)
        }
    } else {
        "Recent".to_string()
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::io::Write;

    #[test]
    fn test_recursive_scanning_in_temp_dir() {
        let temp_dir = std::env::temp_dir().join(format!("spacewise_test_{}", std::process::id()));
        let _ = fs::remove_dir_all(&temp_dir);
        fs::create_dir_all(&temp_dir.join("subfolder")).unwrap();

        // Create test files
        let file1_path = temp_dir.join("small.txt");
        let mut file1 = fs::File::create(&file1_path).unwrap();
        file1.write_all(&vec![b'A'; 1024]).unwrap(); // 1 KB

        let file2_path = temp_dir.join("subfolder/large.mov");
        let mut file2 = fs::File::create(&file2_path).unwrap();
        file2.write_all(&vec![b'B'; 1024 * 1024]).unwrap(); // 1 MB

        let options = ScanOptions {
            path: temp_dir.to_string_lossy().to_string(),
            max_tree_depth: Some(3),
            exclude_paths: vec![],
            same_filesystem: true,
            large_file_threshold_mb: None,
        };

        let cancel_flag = Arc::new(AtomicBool::new(false));
        let mut scanner = DirectoryScanner::new(options, cancel_flag).unwrap();
        let result = scanner.scan::<fn(ScanProgress)>(None).unwrap();

        assert_eq!(result.total_files_scanned, 2);
        assert!(result.total_bytes_scanned >= 1024 + 1024 * 1024);
        assert_eq!(result.largest_files.len(), 2);
        assert_eq!(result.largest_files[0].name, "large.mov");
        assert_eq!(result.largest_files[0].size_bytes, 1024 * 1024);

        let _ = fs::remove_dir_all(&temp_dir);
    }

    #[test]
    fn test_symlinks_are_never_followed() {
        let temp_dir =
            std::env::temp_dir().join(format!("spacewise_symlink_test_{}", std::process::id()));
        let _ = fs::remove_dir_all(&temp_dir);
        let outside_dir = temp_dir.join("outside");
        let inside_dir = temp_dir.join("inside");
        fs::create_dir_all(&outside_dir).unwrap();
        fs::create_dir_all(&inside_dir).unwrap();

        // File in outside dir
        let outside_file = outside_dir.join("secret.bin");
        let mut f = fs::File::create(&outside_file).unwrap();
        f.write_all(&vec![b'Z'; 5000]).unwrap();

        // Create symlink from inside pointing to outside
        let symlink_path = inside_dir.join("link_to_outside");
        #[cfg(unix)]
        std::os::unix::fs::symlink(&outside_dir, &symlink_path).unwrap();

        let options = ScanOptions {
            path: inside_dir.to_string_lossy().to_string(),
            max_tree_depth: Some(3),
            exclude_paths: vec![],
            same_filesystem: true,
            large_file_threshold_mb: None,
        };

        let cancel_flag = Arc::new(AtomicBool::new(false));
        let mut scanner = DirectoryScanner::new(options, cancel_flag).unwrap();
        let result = scanner.scan::<fn(ScanProgress)>(None).unwrap();

        // The file inside outside_dir MUST NOT be counted because the symlink directory was not recursed
        assert_eq!(
            result.total_files_scanned, 0,
            "Symlink directory must not be traversed"
        );

        let _ = fs::remove_dir_all(&temp_dir);
    }

    #[test]
    fn test_scan_cancellation() {
        let temp_dir =
            std::env::temp_dir().join(format!("spacewise_cancel_test_{}", std::process::id()));
        let _ = fs::remove_dir_all(&temp_dir);
        fs::create_dir_all(&temp_dir).unwrap();

        for i in 0..10 {
            let p = temp_dir.join(format!("file_{}.dat", i));
            let mut f = fs::File::create(&p).unwrap();
            f.write_all(b"test").unwrap();
        }

        let options = ScanOptions {
            path: temp_dir.to_string_lossy().to_string(),
            max_tree_depth: Some(3),
            exclude_paths: vec![],
            same_filesystem: true,
            large_file_threshold_mb: None,
        };

        let cancel_flag = Arc::new(AtomicBool::new(true)); // Pre-cancelled
        let mut scanner = DirectoryScanner::new(options, cancel_flag).unwrap();
        let result = scanner.scan::<fn(ScanProgress)>(None);

        assert!(result.is_err(), "Pre-cancelled scan must abort");

        let _ = fs::remove_dir_all(&temp_dir);
    }

    #[test]
    fn test_classify_file_types() {
        assert_eq!(classify_file("mov", "/home/user/video.mov").0, "media");
        assert_eq!(
            classify_file("rs", "/home/user/code/main.rs").0,
            "developer"
        );
        assert_eq!(classify_file("so", "/usr/lib/libtest.so").0, "system");
        assert_eq!(classify_file("pdf", "/home/user/doc.pdf").0, "documents");
        assert_eq!(
            classify_file("appimage", "/home/user/app.appimage").0,
            "apps"
        );
    }

    #[test]
    fn test_permission_denied_error_handling() {
        use std::os::unix::fs::PermissionsExt;

        let temp_dir =
            std::env::temp_dir().join(format!("spacewise_perm_test_{}", std::process::id()));
        let _ = fs::remove_dir_all(&temp_dir);
        let normal_dir = temp_dir.join("normal");
        let restricted_dir = temp_dir.join("restricted");
        fs::create_dir_all(&normal_dir).unwrap();
        fs::create_dir_all(&restricted_dir).unwrap();

        // Normal file
        let norm_file = normal_dir.join("norm.txt");
        let mut f = fs::File::create(&norm_file).unwrap();
        f.write_all(b"accessible data").unwrap();

        // File inside restricted directory
        let secret_file = restricted_dir.join("secret.txt");
        let mut f2 = fs::File::create(&secret_file).unwrap();
        f2.write_all(b"cannot read").unwrap();

        // Remove read and execute permissions on restricted dir
        let mut perms = fs::metadata(&restricted_dir).unwrap().permissions();
        perms.set_mode(0o000);
        let _ = fs::set_permissions(&restricted_dir, perms);

        let options = ScanOptions {
            path: temp_dir.to_string_lossy().to_string(),
            max_tree_depth: Some(3),
            exclude_paths: vec![],
            same_filesystem: true,
            large_file_threshold_mb: None,
        };

        let cancel_flag = Arc::new(AtomicBool::new(false));
        let mut scanner = DirectoryScanner::new(options, cancel_flag).unwrap();
        let result = scanner.scan::<fn(ScanProgress)>(None);

        // Restore permissions so we can clean up
        let mut restore = fs::metadata(&restricted_dir).unwrap().permissions();
        restore.set_mode(0o755);
        let _ = fs::set_permissions(&restricted_dir, restore);

        assert!(
            result.is_ok(),
            "Scan must succeed even with permission denied directories"
        );
        let scan_res = result.unwrap();

        // Must have recorded permission denied
        assert!(
            scan_res.permission_denied_count >= 1,
            "Must record at least 1 permission-denied path"
        );
        assert!(
            scan_res
                .permission_denied_paths
                .iter()
                .any(|p| p.contains("restricted")),
            "Restricted directory must be tracked in permission_denied_paths"
        );
        // Normal file was still scanned
        assert!(
            scan_res.total_files_scanned >= 1,
            "Accessible files must still be scanned"
        );

        let _ = fs::remove_dir_all(&temp_dir);
    }

    #[test]
    fn test_directory_aggregation_and_modification_times() {
        let temp_dir =
            std::env::temp_dir().join(format!("spacewise_agg_test_{}", std::process::id()));
        let _ = fs::remove_dir_all(&temp_dir);
        let folder1 = temp_dir.join("docs");
        let folder2 = temp_dir.join("media");
        fs::create_dir_all(&folder1).unwrap();
        fs::create_dir_all(&folder2).unwrap();

        let doc1 = folder1.join("report.pdf");
        let mut f1 = fs::File::create(&doc1).unwrap();
        f1.write_all(&vec![b'A'; 2048]).unwrap();

        let vid1 = folder2.join("clip.mp4");
        let mut f2 = fs::File::create(&vid1).unwrap();
        f2.write_all(&vec![b'B'; 4096]).unwrap();

        let options = ScanOptions {
            path: temp_dir.to_string_lossy().to_string(),
            max_tree_depth: Some(3),
            exclude_paths: vec![],
            same_filesystem: true,
            large_file_threshold_mb: None,
        };

        let cancel_flag = Arc::new(AtomicBool::new(false));
        let mut scanner = DirectoryScanner::new(options, cancel_flag).unwrap();
        let result = scanner.scan::<fn(ScanProgress)>(None).unwrap();

        assert_eq!(result.total_files_scanned, 2);
        assert_eq!(result.total_bytes_scanned, 2048 + 4096);
        assert!(result.directory_tree.size_bytes >= 2048 + 4096);
        assert_eq!(result.directory_tree.file_count, Some(2));

        // Check largest files and mtime formatting
        assert_eq!(result.largest_files.len(), 2);
        assert_eq!(result.largest_files[0].name, "clip.mp4");
        assert_eq!(result.largest_files[0].last_modified, "Today");

        let _ = fs::remove_dir_all(&temp_dir);
    }

    #[test]
    fn test_scan_single_file_target() {
        let temp_dir =
            std::env::temp_dir().join(format!("spacewise_single_file_test_{}", std::process::id()));
        fs::create_dir_all(&temp_dir).unwrap();

        let single_file = temp_dir.join("single_target.bin");
        let mut f = fs::File::create(&single_file).unwrap();
        f.write_all(&vec![b'Z'; 5120]).unwrap();

        let options = ScanOptions {
            path: temp_dir.to_string_lossy().to_string(),
            max_tree_depth: Some(3),
            exclude_paths: vec![],
            same_filesystem: true,
            large_file_threshold_mb: None,
        };

        let cancel_flag = Arc::new(AtomicBool::new(false));
        let mut scanner = DirectoryScanner::new(options, cancel_flag).unwrap();
        let result = scanner
            .scan_multiple_targets::<fn(ScanProgress)>(&[single_file], None)
            .unwrap();

        assert_eq!(result.total_files_scanned, 1);
        assert_eq!(result.total_bytes_scanned, 5120);
        assert_eq!(result.directory_tree.size_bytes, 5120);
        assert_eq!(result.directory_tree.file_count, Some(1));
        assert_eq!(result.largest_files.len(), 1);
        assert_eq!(result.largest_files[0].name, "single_target.bin");

        let _ = fs::remove_dir_all(&temp_dir);
    }

    #[test]
    fn test_scan_multiple_targets_mixed_and_cancellation() {
        let temp_dir = std::env::temp_dir().join(format!(
            "spacewise_multi_target_test_{}",
            std::process::id()
        ));
        fs::create_dir_all(&temp_dir).unwrap();

        let folder = temp_dir.join("folder_target");
        fs::create_dir_all(&folder).unwrap();
        fs::File::create(folder.join("nested.txt"))
            .unwrap()
            .write_all(b"12345")
            .unwrap();

        let file = temp_dir.join("file_target.txt");
        fs::File::create(&file)
            .unwrap()
            .write_all(b"67890")
            .unwrap();

        let options = ScanOptions {
            path: temp_dir.to_string_lossy().to_string(),
            max_tree_depth: Some(3),
            exclude_paths: vec![],
            same_filesystem: true,
            large_file_threshold_mb: None,
        };

        // 1. Successful mixed scan
        let cancel_flag = Arc::new(AtomicBool::new(false));
        let mut scanner = DirectoryScanner::new(options.clone(), cancel_flag).unwrap();
        let result = scanner
            .scan_multiple_targets::<fn(ScanProgress)>(&[folder.clone(), file.clone()], None)
            .unwrap();

        assert_eq!(result.total_files_scanned, 2);
        assert_eq!(result.total_bytes_scanned, 10);
        assert_eq!(result.directory_tree.children.as_ref().unwrap().len(), 2);

        // 2. Cancellation
        let cancel_flag2 = Arc::new(AtomicBool::new(true)); // Pre-cancelled
        let mut scanner2 = DirectoryScanner::new(options, cancel_flag2).unwrap();
        let cancel_err = scanner2.scan_multiple_targets::<fn(ScanProgress)>(&[folder, file], None);
        assert!(cancel_err.is_err());
        assert!(cancel_err.unwrap_err().contains("cancelled"));

        let _ = fs::remove_dir_all(&temp_dir);
    }

    #[test]
    fn test_scanner_permission_denied_bounded_cap() {
        let temp_dir =
            std::env::temp_dir().join(format!("spacewise_perm_bound_test_{}", std::process::id()));
        fs::create_dir_all(&temp_dir).unwrap();

        let options = ScanOptions {
            path: temp_dir.to_string_lossy().to_string(),
            max_tree_depth: Some(1),
            exclude_paths: vec![],
            same_filesystem: true,
            large_file_threshold_mb: None,
        };

        let cancel_flag = Arc::new(AtomicBool::new(false));
        let mut scanner = DirectoryScanner::new(options, cancel_flag).unwrap();

        // Simulate recording 600 permission denied paths
        for i in 0..600 {
            scanner.record_permission_denied(format!("/restricted/path/{}", i));
        }

        assert_eq!(scanner.permission_denied_count, 600);
        assert_eq!(
            scanner.permission_denied_paths.len(),
            MAX_PERMISSION_DENIED_PATHS
        );
        assert_eq!(scanner.permission_denied_paths.len(), 500);

        let _ = fs::remove_dir_all(&temp_dir);
    }
}
