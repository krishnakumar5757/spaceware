use serde::{Deserialize, Serialize};
use std::fs;
use std::os::unix::fs::MetadataExt;
use std::path::{Path, PathBuf};

use crate::cleanup::{
    FreeDesktopTrash, PROTECTED_SYSTEM_PATHS, PROTECTED_USER_SUBPATHS, compute_exact_dir_size,
    get_validated_home_dir, remove_dir_contents_recursive,
};
use crate::models::CleanupExecutionSummary;
use crate::scanner::{classify_file, format_epoch_date};

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ExplorerItem {
    pub id: String,
    pub name: String,
    pub path: String,
    pub size_bytes: u64,
    pub is_dir: bool,
    pub is_symlink: bool,
    pub symlink_target: Option<String>,
    pub extension: String,
    pub file_type: String, // "folder" | "media" | "developer" | "archive" | "document" | "apps" | "system" | "symlink" | "file"
    pub category: String,
    pub last_modified: String,
    pub last_modified_epoch: u64,
    pub is_hidden: bool,
    pub is_readonly: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DirectoryListingResult {
    pub current_path: String,
    pub parent_path: Option<String>,
    pub canonical_path: String,
    pub items: Vec<ExplorerItem>,
    pub total_count: usize,
    pub total_dirs: usize,
    pub total_files: usize,
    pub total_bytes: u64,
    pub is_readable: bool,
    pub error_message: Option<String>,
    pub page: usize,
    pub page_size: usize,
    pub total_pages: usize,
    pub has_more: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SelectiveCleanupTargetPreview {
    pub path: String,
    pub name: String,
    pub is_dir: bool,
    pub is_symlink: bool,
    pub size_bytes: u64,
    pub file_count: u64,
    pub is_eligible: bool,
    pub ineligibility_reason: Option<String>,
    pub warning: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SelectiveCleanupPreview {
    pub targets: Vec<SelectiveCleanupTargetPreview>,
    pub total_eligible_bytes: u64,
    pub total_eligible_files: u64,
    pub total_targets: usize,
    pub eligible_count: usize,
    pub ineligible_count: usize,
    pub recommended_action: String, // "trash"
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SelectiveCleanupRequest {
    pub paths: Vec<String>,
    pub action: String, // "trash" | "permanent_delete"
}

/// Retrieves the current user's home directory safely
pub fn get_user_home() -> PathBuf {
    get_validated_home_dir().unwrap_or_else(|_| PathBuf::from("/"))
}

/// Lists directory contents safely with pagination, sorting, and symlink protection
pub fn list_directory_contents(
    path_str: &str,
    page: usize,
    page_size: usize,
    show_hidden: bool,
) -> Result<DirectoryListingResult, String> {
    let target_path = if path_str.trim().is_empty() {
        get_user_home()
    } else {
        PathBuf::from(path_str.trim())
    };

    // Path traversal check on input
    if path_str.contains("..") {
        return Err("Path traversal (..) is not permitted".to_string());
    }

    let canonical = match target_path.canonicalize() {
        Ok(c) => c,
        Err(e) => {
            return Err(format!(
                "Directory path does not exist or cannot be accessed: {}",
                e
            ));
        }
    };

    let canonical_str = canonical.to_string_lossy().to_string();

    let parent_path = if canonical == Path::new("/") {
        None
    } else {
        canonical.parent().map(|p| p.to_string_lossy().to_string())
    };

    // Read directory entries safely without crashing on permission errors
    let read_dir_result = fs::read_dir(&canonical);
    let dir_entries = match read_dir_result {
        Ok(entries) => entries,
        Err(e) => {
            let is_perm = e.kind() == std::io::ErrorKind::PermissionDenied;
            let msg = if is_perm {
                format!(
                    "Permission denied: You do not have permission to read '{}'.",
                    canonical_str
                )
            } else {
                format!("Failed to open directory: {}", e)
            };

            return Ok(DirectoryListingResult {
                current_path: canonical_str.clone(),
                parent_path,
                canonical_path: canonical_str,
                items: Vec::new(),
                total_count: 0,
                total_dirs: 0,
                total_files: 0,
                total_bytes: 0,
                is_readable: false,
                error_message: Some(msg),
                page: 1,
                page_size: page_size.max(1),
                total_pages: 0,
                has_more: false,
            });
        }
    };

    let mut items = Vec::new();
    let mut total_dirs = 0usize;
    let mut total_files = 0usize;
    let mut total_bytes = 0u64;

    for entry_res in dir_entries {
        let entry = match entry_res {
            Ok(e) => e,
            Err(_) => continue, // Skip unreadable individual entry safely
        };

        let file_name = entry.file_name().to_string_lossy().to_string();
        let is_hidden = file_name.starts_with('.');

        if !show_hidden && is_hidden {
            continue;
        }

        let entry_path = entry.path();
        let entry_path_str = entry_path.to_string_lossy().to_string();

        // Use symlink_metadata so symlinks are NOT followed!
        let sym_meta = match fs::symlink_metadata(&entry_path) {
            Ok(m) => m,
            Err(_) => continue,
        };

        let is_symlink = sym_meta.file_type().is_symlink();
        let symlink_target = if is_symlink {
            fs::read_link(&entry_path)
                .ok()
                .map(|p| p.to_string_lossy().to_string())
        } else {
            None
        };

        let is_dir = if is_symlink {
            // Symlinks are treated as symlinks, not traversed as dirs
            false
        } else {
            sym_meta.is_dir()
        };

        let size_bytes = if is_dir { 0 } else { sym_meta.len() };

        if is_dir {
            total_dirs += 1;
        } else {
            total_files += 1;
            total_bytes += size_bytes;
        }

        let extension = entry_path
            .extension()
            .and_then(|e| e.to_str())
            .unwrap_or("")
            .to_string();

        let (category, category_label) = if is_dir {
            ("folder", "Folder")
        } else if is_symlink {
            ("symlink", "Symbolic Link")
        } else {
            classify_file(&extension, &entry_path_str)
        };

        let file_type = if is_dir {
            "folder".to_string()
        } else if is_symlink {
            "symlink".to_string()
        } else {
            category.to_string()
        };

        let mtime_epoch = sym_meta.mtime() as u64;
        let last_modified = format_epoch_date(mtime_epoch);

        let is_readonly = sym_meta.permissions().readonly();

        items.push(ExplorerItem {
            id: entry_path_str.clone(),
            name: file_name,
            path: entry_path_str,
            size_bytes,
            is_dir,
            is_symlink,
            symlink_target,
            extension,
            file_type,
            category: category_label.to_string(),
            last_modified,
            last_modified_epoch: mtime_epoch,
            is_hidden,
            is_readonly,
        });
    }

    // Default sorting: directories first (alphabetical case-insensitive), then files (alphabetical case-insensitive)
    items.sort_by(|a, b| match (a.is_dir, b.is_dir) {
        (true, false) => std::cmp::Ordering::Less,
        (false, true) => std::cmp::Ordering::Greater,
        _ => a.name.to_lowercase().cmp(&b.name.to_lowercase()),
    });

    let total_count = items.len();
    let effective_page_size = if page_size == 0 { 500 } else { page_size };
    let current_page = if page == 0 { 1 } else { page };
    let total_pages = if total_count == 0 {
        1
    } else {
        (total_count + effective_page_size - 1) / effective_page_size
    };

    let offset = (current_page - 1) * effective_page_size;
    let paginated_items = if offset >= total_count {
        Vec::new()
    } else {
        let end = (offset + effective_page_size).min(total_count);
        items[offset..end].to_vec()
    };

    let has_more = offset + effective_page_size < total_count;

    Ok(DirectoryListingResult {
        current_path: canonical_str.clone(),
        parent_path,
        canonical_path: canonical_str,
        items: paginated_items,
        total_count,
        total_dirs,
        total_files,
        total_bytes,
        is_readable: true,
        error_message: None,
        page: current_page,
        page_size: effective_page_size,
        total_pages,
        has_more,
    })
}

/// Validates that a path is safe for selective cleanup operations with an explicit home root
pub fn validate_selective_path_with_home(
    path: &Path,
    home_canonical: &Path,
) -> Result<PathBuf, String> {
    let path_str = path.to_string_lossy();

    // 1. Reject empty
    if path_str.trim().is_empty() {
        return Err("Selective path cannot be empty".to_string());
    }

    // 2. Reject relative paths
    if !path.is_absolute() {
        return Err("Relative paths are strictly prohibited for selective cleanup".to_string());
    }

    // 3. Reject path traversal
    if path_str.contains("..") {
        return Err("Path traversal (..) is strictly rejected".to_string());
    }

    // 4. Reject symlinks: symlinks cannot be target of deletion to prevent deleting target content unexpectedly
    let orig_meta = fs::symlink_metadata(path)
        .map_err(|e| format!("Failed to read metadata for {}: {}", path.display(), e))?;

    if orig_meta.file_type().is_symlink() {
        return Err(
            "Symbolic links cannot be the target of cleanup operations to protect linked targets"
                .to_string(),
        );
    }

    // 5. Canonicalize
    let canonical = path
        .canonicalize()
        .map_err(|e| format!("Failed to canonicalize path {}: {}", path.display(), e))?;

    let canonical_str = canonical.to_string_lossy();

    // 6. Reject protected system paths
    if canonical_str == "/" {
        return Err("Protected system root cannot be cleaned: /".to_string());
    }
    for &sys_path in PROTECTED_SYSTEM_PATHS {
        if canonical_str == sys_path {
            return Err(format!(
                "Protected system root cannot be cleaned: {}",
                sys_path
            ));
        }
    }

    // 7. Verify not symlink after canonicalization
    let canonical_meta = fs::symlink_metadata(&canonical)
        .map_err(|e| format!("Failed to read metadata for {}: {}", canonical.display(), e))?;

    if canonical_meta.file_type().is_symlink() {
        return Err(
            "Symbolic links cannot be the target of cleanup operations to protect linked targets"
                .to_string(),
        );
    }

    // 8. User home root check
    if canonical == *home_canonical {
        return Err("User home root cannot be cleaned directly".to_string());
    }

    // 9. Check protected user subpaths (.config, .ssh, etc.)
    for &sub in PROTECTED_USER_SUBPATHS {
        let protected = home_canonical.join(sub);
        if canonical == protected || canonical.starts_with(&protected) {
            return Err(format!(
                "Protected user configuration path cannot be cleaned: {}",
                sub
            ));
        }
    }

    // 10. Prevent deleting critical top-level folders directly
    let local_share = home_canonical.join(".local/share");
    if canonical == local_share || canonical == home_canonical.join(".local") {
        return Err("Protected user data root cannot be cleaned directly".to_string());
    }

    // 11. Must be in user home or user-owned /tmp
    let tmp_root = PathBuf::from("/tmp");
    let is_in_home = canonical.starts_with(home_canonical);
    let is_in_tmp = !is_in_home && canonical.starts_with(&tmp_root) && canonical != tmp_root;

    if is_in_tmp {
        let euid = unsafe { libc::geteuid() };
        if orig_meta.uid() != euid || canonical_meta.uid() != euid {
            return Err(format!(
                "Refusing to target file in /tmp not owned by current user (UID {})",
                euid
            ));
        }
        let mode = canonical_meta.mode();
        let file_type_bits = mode & libc::S_IFMT;
        if file_type_bits == libc::S_IFSOCK || file_type_bits == libc::S_IFIFO {
            return Err("Special files (sockets/FIFOs) in /tmp cannot be cleaned".to_string());
        }
    }

    if !is_in_home && !is_in_tmp {
        return Err(format!(
            "Path is outside permitted user home and /tmp boundaries: {}",
            canonical.display()
        ));
    }

    Ok(canonical)
}

/// Validates that a path is safe for selective cleanup operations
pub fn validate_selective_path(path: &Path) -> Result<PathBuf, String> {
    // 1. Root check
    unsafe {
        if libc::geteuid() == 0 {
            return Err("Spacewise must not be executed with root/sudo privileges".to_string());
        }
    }

    let home = get_validated_home_dir()?;
    validate_selective_path_with_home(path, &home)
}

/// Generates a preview for selective cleanup targets without modifying anything
pub fn preview_selective_cleanup_targets(
    paths: &[String],
) -> Result<SelectiveCleanupPreview, String> {
    let mut targets = Vec::new();
    let mut total_eligible_bytes = 0u64;
    let mut total_eligible_files = 0u64;
    let mut eligible_count = 0usize;
    let mut ineligible_count = 0usize;

    for path_str in paths {
        let path = PathBuf::from(path_str);
        let name = path
            .file_name()
            .and_then(|s| s.to_str())
            .unwrap_or(path_str)
            .to_string();

        let sym_meta = fs::symlink_metadata(&path);
        let (is_dir, is_symlink) = match sym_meta {
            Ok(m) => (m.is_dir(), m.file_type().is_symlink()),
            Err(_) => (false, false),
        };

        match validate_selective_path(&path) {
            Ok(validated) => {
                let (size_bytes, file_count) = if is_dir {
                    compute_exact_dir_size(&validated)
                } else if let Ok(m) = fs::metadata(&validated) {
                    (m.len(), 1)
                } else {
                    (0, 0)
                };

                let warning = if is_dir && file_count > 100 {
                    Some(format!(
                        "Directory contains {} items. Double-check before executing.",
                        file_count
                    ))
                } else {
                    None
                };

                targets.push(SelectiveCleanupTargetPreview {
                    path: validated.to_string_lossy().to_string(),
                    name,
                    is_dir,
                    is_symlink,
                    size_bytes,
                    file_count,
                    is_eligible: true,
                    ineligibility_reason: None,
                    warning,
                });

                total_eligible_bytes += size_bytes;
                total_eligible_files += file_count;
                eligible_count += 1;
            }
            Err(reason) => {
                let size_bytes = fs::symlink_metadata(&path).map(|m| m.len()).unwrap_or(0);

                targets.push(SelectiveCleanupTargetPreview {
                    path: path_str.clone(),
                    name,
                    is_dir,
                    is_symlink,
                    size_bytes,
                    file_count: if is_dir { 0 } else { 1 },
                    is_eligible: false,
                    ineligibility_reason: Some(reason),
                    warning: None,
                });

                ineligible_count += 1;
            }
        }
    }

    Ok(SelectiveCleanupPreview {
        total_targets: paths.len(),
        targets,
        total_eligible_bytes,
        total_eligible_files,
        eligible_count,
        ineligible_count,
        recommended_action: "trash".to_string(),
    })
}

/// Executes selective cleanup on validated user targets
pub fn execute_selective_cleanup_targets(
    request: SelectiveCleanupRequest,
    trash_override: Option<&Path>,
) -> Result<CleanupExecutionSummary, String> {
    unsafe {
        if libc::geteuid() == 0 {
            return Err("Spacewise must not be executed with root/sudo privileges".to_string());
        }
    }

    if request.action != "trash" && request.action != "permanent_delete" {
        return Err(format!(
            "Unknown or invalid selective cleanup action '{}'. Allowed actions are 'trash' and 'permanent_delete'",
            request.action
        ));
    }

    let trash = match trash_override {
        Some(p) => FreeDesktopTrash::new(p.to_path_buf()),
        None => FreeDesktopTrash::default_for_user(),
    };

    let mut item_results = Vec::new();
    let mut total_bytes_freed: u64 = 0;
    let mut total_files_removed: u64 = 0;
    let mut success_count = 0;
    let mut failure_count = 0;

    for path_str in request.paths {
        let target_path = PathBuf::from(&path_str);

        // Immediate re-validation before any action
        let validated_path = match validate_selective_path(&target_path) {
            Ok(p) => p,
            Err(e) => {
                failure_count += 1;
                item_results.push(crate::models::CleanupItemResult {
                    id: path_str.clone(),
                    path: path_str,
                    success: false,
                    bytes_freed: 0,
                    files_removed: 0,
                    error: Some(format!("Validation rejected path: {}", e)),
                });
                continue;
            }
        };

        let meta = match fs::symlink_metadata(&validated_path) {
            Ok(m) => m,
            Err(e) => {
                failure_count += 1;
                item_results.push(crate::models::CleanupItemResult {
                    id: path_str.clone(),
                    path: path_str,
                    success: false,
                    bytes_freed: 0,
                    files_removed: 0,
                    error: Some(format!("Target no longer exists or changed: {}", e)),
                });
                continue;
            }
        };

        if meta.file_type().is_symlink() {
            failure_count += 1;
            item_results.push(crate::models::CleanupItemResult {
                id: path_str.clone(),
                path: path_str,
                success: false,
                bytes_freed: 0,
                files_removed: 0,
                error: Some("Target is a symbolic link; deletion rejected".to_string()),
            });
            continue;
        }

        let is_trash_root = validated_path.starts_with(trash.files_dir());

        let (bytes_freed, files_removed, error) = if request.action == "trash" && !is_trash_root {
            match trash.move_to_trash(&validated_path) {
                Ok((b, f)) => (b, f, None),
                Err(e) => (0, 0, Some(format!("Failed to move to Trash: {}", e))),
            }
        } else if request.action == "permanent_delete"
            || (request.action == "trash" && is_trash_root)
        {
            if is_trash_root {
                let file_name = validated_path
                    .file_name()
                    .and_then(|s| s.to_str())
                    .unwrap_or_default();
                match trash.delete_permanently(file_name) {
                    Ok((b, f)) => (b, f, None),
                    Err(e) => (0, 0, Some(format!("Failed to delete from trash: {}", e))),
                }
            } else if meta.is_dir() {
                match remove_dir_contents_recursive(&validated_path) {
                    Ok((b, f)) => {
                        // After contents removed, remove the empty directory itself
                        if let Err(e) = fs::remove_dir(&validated_path) {
                            (
                                b,
                                f,
                                Some(format!(
                                    "Removed contents but failed to remove directory itself: {}",
                                    e
                                )),
                            )
                        } else {
                            (b, f + 1, None)
                        }
                    }
                    Err(e) => (
                        0,
                        0,
                        Some(format!("Failed to remove directory contents: {}", e)),
                    ),
                }
            } else {
                let len = meta.len();
                match fs::remove_file(&validated_path) {
                    Ok(_) => (len, 1, None),
                    Err(e) => (0, 0, Some(format!("Failed to delete file: {}", e))),
                }
            }
        } else {
            (0, 0, Some("Unrecognized cleanup action".to_string()))
        };

        if let Some(err_msg) = error {
            failure_count += 1;
            item_results.push(crate::models::CleanupItemResult {
                id: path_str.clone(),
                path: path_str,
                success: false,
                bytes_freed,
                files_removed,
                error: Some(err_msg),
            });
        } else {
            success_count += 1;
            total_bytes_freed += bytes_freed;
            total_files_removed += files_removed;
            item_results.push(crate::models::CleanupItemResult {
                id: path_str.clone(),
                path: path_str,
                success: true,
                bytes_freed,
                files_removed,
                error: None,
            });
        }
    }

    Ok(CleanupExecutionSummary {
        total_bytes_freed,
        total_files_removed,
        item_results,
        success_count,
        failure_count,
    })
}

/// Reveals a file or directory in the system's native desktop file manager
pub fn reveal_path_in_file_manager(path_str: &str) -> Result<(), String> {
    let p = Path::new(path_str);
    if !p.exists() {
        return Err("File or folder does not exist".to_string());
    }

    let canonical = p
        .canonicalize()
        .map_err(|e| format!("Failed to canonicalize path: {}", e))?;

    // If it's a file, open its parent directory so the user sees the file in its containing folder
    let target_to_open = if canonical.is_file() {
        canonical.parent().unwrap_or(&canonical)
    } else {
        &canonical
    };

    // Use direct argv invocation of xdg-open. Never construct shell strings.
    std::process::Command::new("xdg-open")
        .arg(target_to_open)
        .spawn()
        .map_err(|e| format!("Failed to launch file manager: {}", e))?;

    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::io::Write;
    use std::os::unix::fs::symlink;
    use std::time::UNIX_EPOCH;

    #[test]
    fn test_list_directory_navigation_and_metadata() {
        let temp_dir = std::env::temp_dir().join(format!(
            "sw_test_nav_{}",
            std::time::SystemTime::now()
                .duration_since(UNIX_EPOCH)
                .unwrap()
                .as_nanos()
        ));
        fs::create_dir_all(&temp_dir).unwrap();

        let sub_dir = temp_dir.join("subfolder");
        fs::create_dir_all(&sub_dir).unwrap();

        let file1 = temp_dir.join("sample.txt");
        let mut f1 = fs::File::create(&file1).unwrap();
        f1.write_all(b"Hello Spacewise!").unwrap();

        let result = list_directory_contents(temp_dir.to_str().unwrap(), 1, 50, true).unwrap();
        assert_eq!(result.total_count, 2);
        assert_eq!(result.total_dirs, 1);
        assert_eq!(result.total_files, 1);
        assert!(result.total_bytes >= 16);
        assert!(result.is_readable);
        assert!(result.parent_path.is_some());

        // Subfolder is first due to directory sorting
        assert!(result.items[0].is_dir);
        assert_eq!(result.items[0].name, "subfolder");

        // File is second
        assert!(!result.items[1].is_dir);
        assert_eq!(result.items[1].name, "sample.txt");
        assert_eq!(result.items[1].size_bytes, 16);

        let _ = fs::remove_dir_all(&temp_dir);
    }

    #[test]
    fn test_list_directory_empty_folder() {
        let temp_dir = std::env::temp_dir().join(format!(
            "sw_test_empty_{}",
            std::time::SystemTime::now()
                .duration_since(UNIX_EPOCH)
                .unwrap()
                .as_nanos()
        ));
        fs::create_dir_all(&temp_dir).unwrap();

        let result = list_directory_contents(temp_dir.to_str().unwrap(), 1, 50, true).unwrap();
        assert_eq!(result.total_count, 0);
        assert_eq!(result.items.len(), 0);
        assert!(result.is_readable);
        assert!(result.error_message.is_none());

        let _ = fs::remove_dir_all(&temp_dir);
    }

    #[test]
    fn test_list_directory_sorting() {
        let temp_dir = std::env::temp_dir().join(format!(
            "sw_test_sort_{}",
            std::time::SystemTime::now()
                .duration_since(UNIX_EPOCH)
                .unwrap()
                .as_nanos()
        ));
        fs::create_dir_all(&temp_dir).unwrap();

        fs::create_dir_all(temp_dir.join("z_folder")).unwrap();
        fs::create_dir_all(temp_dir.join("a_folder")).unwrap();
        fs::File::create(temp_dir.join("z_file.txt")).unwrap();
        fs::File::create(temp_dir.join("a_file.txt")).unwrap();

        let result = list_directory_contents(temp_dir.to_str().unwrap(), 1, 50, true).unwrap();
        assert_eq!(result.items.len(), 4);

        // Folders come first in alphabetical order
        assert!(result.items[0].is_dir);
        assert_eq!(result.items[0].name, "a_folder");
        assert!(result.items[1].is_dir);
        assert_eq!(result.items[1].name, "z_folder");

        // Files come after in alphabetical order
        assert!(!result.items[2].is_dir);
        assert_eq!(result.items[2].name, "a_file.txt");
        assert!(!result.items[3].is_dir);
        assert_eq!(result.items[3].name, "z_file.txt");

        let _ = fs::remove_dir_all(&temp_dir);
    }

    #[test]
    fn test_list_directory_symlink_not_followed() {
        let temp_dir = std::env::temp_dir().join(format!(
            "sw_test_sym_{}",
            std::time::SystemTime::now()
                .duration_since(UNIX_EPOCH)
                .unwrap()
                .as_nanos()
        ));
        fs::create_dir_all(&temp_dir).unwrap();

        let target_dir = temp_dir.join("real_folder");
        fs::create_dir_all(&target_dir).unwrap();
        fs::File::create(target_dir.join("nested.txt")).unwrap();

        let link_path = temp_dir.join("symlink_to_folder");
        symlink(&target_dir, &link_path).unwrap();

        let result = list_directory_contents(temp_dir.to_str().unwrap(), 1, 50, true).unwrap();
        let sym_item = result
            .items
            .iter()
            .find(|i| i.name == "symlink_to_folder")
            .unwrap();

        assert!(sym_item.is_symlink);
        assert!(!sym_item.is_dir); // Treated as link, not directory
        assert!(sym_item.symlink_target.is_some());

        let _ = fs::remove_dir_all(&temp_dir);
    }

    #[test]
    fn test_path_traversal_attempts_rejected() {
        let err = list_directory_contents("/tmp/../etc", 1, 50, false);
        assert!(err.is_err());
        assert!(err.unwrap_err().contains("Path traversal"));
    }

    #[test]
    fn test_selective_cleanup_preview_eligible_and_ineligible() {
        let temp_dir = std::env::temp_dir().join(format!(
            "sw_test_clean_prev_{}",
            std::time::SystemTime::now()
                .duration_since(UNIX_EPOCH)
                .unwrap()
                .as_nanos()
        ));
        fs::create_dir_all(&temp_dir).unwrap();

        let file = temp_dir.join("deleteme.tmp");
        let mut f = fs::File::create(&file).unwrap();
        f.write_all(b"12345678").unwrap();

        // System path should be ineligible
        let preview = preview_selective_cleanup_targets(&[
            file.to_str().unwrap().to_string(),
            "/etc/passwd".to_string(),
        ])
        .unwrap();

        assert_eq!(preview.total_targets, 2);
        assert_eq!(preview.eligible_count, 1);
        assert_eq!(preview.ineligible_count, 1);

        let eligible_item = preview.targets.iter().find(|t| t.is_eligible).unwrap();
        assert_eq!(eligible_item.size_bytes, 8);

        let ineligible_item = preview.targets.iter().find(|t| !t.is_eligible).unwrap();
        assert!(ineligible_item.ineligibility_reason.is_some());

        let _ = fs::remove_dir_all(&temp_dir);
    }

    #[test]
    fn test_selective_cleanup_trash_and_permanent_delete() {
        let temp_dir = std::env::temp_dir().join(format!(
            "sw_test_clean_exec_{}",
            std::time::SystemTime::now()
                .duration_since(UNIX_EPOCH)
                .unwrap()
                .as_nanos()
        ));
        let trash_dir = temp_dir.join("Trash");
        fs::create_dir_all(&trash_dir).unwrap();

        let file_for_trash = temp_dir.join("trashme.txt");
        fs::File::create(&file_for_trash)
            .unwrap()
            .write_all(b"trash-content")
            .unwrap();

        let file_for_delete = temp_dir.join("deleteme.txt");
        fs::File::create(&file_for_delete)
            .unwrap()
            .write_all(b"permanent-content")
            .unwrap();

        // 1. Move to trash
        let trash_req = SelectiveCleanupRequest {
            paths: vec![file_for_trash.to_str().unwrap().to_string()],
            action: "trash".to_string(),
        };
        let trash_res = execute_selective_cleanup_targets(trash_req, Some(&trash_dir)).unwrap();
        assert_eq!(trash_res.success_count, 1);
        assert_eq!(trash_res.failure_count, 0);
        assert!(!file_for_trash.exists());

        // 2. Permanent delete
        let del_req = SelectiveCleanupRequest {
            paths: vec![file_for_delete.to_str().unwrap().to_string()],
            action: "permanent_delete".to_string(),
        };
        let del_res = execute_selective_cleanup_targets(del_req, Some(&trash_dir)).unwrap();
        assert_eq!(del_res.success_count, 1);
        assert_eq!(del_res.failure_count, 0);
        assert!(!file_for_delete.exists());

        let _ = fs::remove_dir_all(&temp_dir);
    }

    #[test]
    fn test_selective_cleanup_unknown_action_rejected() {
        let invalid_actions = vec!["", "clean", "delete", "destroy", "trash "];
        for action in invalid_actions {
            let req = SelectiveCleanupRequest {
                paths: vec!["/tmp/dummy".to_string()],
                action: action.to_string(),
            };
            let res = execute_selective_cleanup_targets(req, None);
            assert!(res.is_err(), "Action '{}' must be rejected", action);
            assert!(
                res.unwrap_err()
                    .contains("Unknown or invalid selective cleanup action")
            );
        }
    }

    #[test]
    fn test_validate_selective_path_boundaries() {
        let temp_dir = std::env::temp_dir().join(format!(
            "sw_test_sel_bound_{}",
            std::time::SystemTime::now()
                .duration_since(UNIX_EPOCH)
                .unwrap()
                .as_nanos()
        ));
        fs::create_dir_all(&temp_dir).unwrap();

        let fake_home = temp_dir.join("home");
        fs::create_dir_all(&fake_home).unwrap();
        let fake_home_canonical = fake_home.canonicalize().unwrap();

        // Empty path rejected
        assert!(validate_selective_path_with_home(Path::new(""), &fake_home_canonical).is_err());

        // Relative path rejected
        assert!(
            validate_selective_path_with_home(Path::new("file.txt"), &fake_home_canonical).is_err()
        );

        // Path traversal rejected
        assert!(
            validate_selective_path_with_home(
                Path::new("/tmp/../etc/passwd"),
                &fake_home_canonical
            )
            .is_err()
        );

        // Home root rejected
        assert!(
            validate_selective_path_with_home(&fake_home_canonical, &fake_home_canonical).is_err()
        );

        // Protected subpaths rejected
        let ssh_dir = fake_home_canonical.join(".ssh");
        fs::create_dir_all(&ssh_dir).unwrap();
        assert!(validate_selective_path_with_home(&ssh_dir, &fake_home_canonical).is_err());

        let _ = fs::remove_dir_all(&temp_dir);
    }
}
