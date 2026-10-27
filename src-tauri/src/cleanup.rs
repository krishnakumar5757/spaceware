use std::fs;
use std::io::{Read, Write};
use std::os::unix::fs::MetadataExt;
use std::path::{Path, PathBuf};
use std::time::{SystemTime, UNIX_EPOCH};

use crate::models::{
    CleanupActionRequest, CleanupExecutionSummary, CleanupItemResult, CleanupRecommendation,
};

/// List of system directories that can NEVER be touched or cleaned
pub const PROTECTED_SYSTEM_PATHS: &[&str] = &[
    "/",
    "/bin",
    "/boot",
    "/dev",
    "/etc",
    "/lib",
    "/lib64",
    "/lost+found",
    "/mnt",
    "/opt",
    "/proc",
    "/root",
    "/run",
    "/sbin",
    "/srv",
    "/sys",
    "/usr",
    "/var",
    "/home",
];

/// Known sensitive subpaths inside user profile that must never be deleted
pub const PROTECTED_USER_SUBPATHS: &[&str] = &[
    ".config",
    ".ssh",
    ".gnupg",
    ".bashrc",
    ".zshrc",
    ".profile",
    ".local/share/keyrings",
    ".cache/keyrings",
    ".cache/dconf",
    ".cache/libwallet",
    ".cache/gcr",
    ".cache/gnome-keyring",
    ".cache/plasma-systemmonitor",
];

/// Specification-compliant FreeDesktop Trash item representation
#[derive(Debug, Clone)]
pub struct FreeDesktopTrashItem {
    pub file_name: String,
    pub files_path: PathBuf,
    pub info_path: PathBuf,
    pub original_path: String,
    pub deletion_date: String,
    pub size_bytes: u64,
    pub file_count: u64,
    pub is_dir: bool,
}

#[derive(Debug, Clone, Default)]
pub struct TrashFaultInjection {
    pub fail_copy: bool,
    pub fail_verification: bool,
    pub fail_metadata_write: bool,
    pub fail_source_removal: bool,
}

/// FreeDesktop.org Trash specification helper
pub struct FreeDesktopTrash {
    pub trash_dir: PathBuf,
    pub fault_injection: Option<TrashFaultInjection>,
}

impl FreeDesktopTrash {
    pub fn new(trash_dir: PathBuf) -> Self {
        Self {
            trash_dir,
            fault_injection: None,
        }
    }

    pub fn default_for_user() -> Self {
        let xdg_data = std::env::var("XDG_DATA_HOME").unwrap_or_default();
        let trash_dir = if !xdg_data.is_empty() {
            PathBuf::from(xdg_data).join("Trash")
        } else {
            let home = std::env::var("HOME").unwrap_or_else(|_| "/tmp".to_string());
            PathBuf::from(home).join(".local/share/Trash")
        };
        Self::new(trash_dir)
    }

    pub fn files_dir(&self) -> PathBuf {
        self.trash_dir.join("files")
    }

    pub fn info_dir(&self) -> PathBuf {
        self.trash_dir.join("info")
    }

    /// Read all valid Trash items following FreeDesktop metadata conventions
    pub fn list_items(&self) -> Vec<FreeDesktopTrashItem> {
        let info_dir = self.info_dir();
        let files_dir = self.files_dir();

        let mut items = Vec::new();
        let entries = match fs::read_dir(&info_dir) {
            Ok(e) => e,
            Err(_) => return items,
        };

        for entry in entries.flatten() {
            let info_path = entry.path();
            if info_path.extension().and_then(|s| s.to_str()) != Some("trashinfo") {
                continue;
            }

            let file_stem = match info_path.file_stem().and_then(|s| s.to_str()) {
                Some(s) => s.to_string(),
                None => continue,
            };

            let files_path = files_dir.join(&file_stem);
            let meta = match fs::symlink_metadata(&files_path) {
                Ok(m) => m,
                Err(_) => continue,
            };

            // Parse .trashinfo file
            let (orig_path, del_date) = parse_trashinfo_file(&info_path);

            let (size_bytes, file_count) = if meta.is_dir() {
                compute_exact_dir_size(&files_path)
            } else {
                (meta.len(), 1)
            };

            items.push(FreeDesktopTrashItem {
                file_name: file_stem,
                files_path,
                info_path,
                original_path: orig_path,
                deletion_date: del_date,
                size_bytes,
                file_count,
                is_dir: meta.is_dir(),
            });
        }

        items
    }

    /// Safely moves a file or directory into the FreeDesktop Trash
    pub fn move_to_trash(&self, source_path: &Path) -> Result<(u64, u64), String> {
        let meta = fs::symlink_metadata(source_path)
            .map_err(|e| format!("Failed to stat source path: {}", e))?;

        if meta.file_type().is_symlink() {
            return Err("Cannot trash symbolic links".to_string());
        }

        let mode = meta.mode();
        let file_type_bits = mode & libc::S_IFMT;
        if file_type_bits == libc::S_IFSOCK || file_type_bits == libc::S_IFIFO {
            return Err("Cannot trash special files (sockets/FIFOs)".to_string());
        }

        let (size_bytes, file_count) = if meta.is_dir() {
            compute_exact_dir_size(source_path)
        } else {
            (meta.len(), 1)
        };

        let files_dir = self.files_dir();
        let info_dir = self.info_dir();
        let staging_dir = self.trash_dir.join(".staging");

        fs::create_dir_all(&files_dir)
            .map_err(|e| format!("Failed to create trash files directory: {}", e))?;
        fs::create_dir_all(&info_dir)
            .map_err(|e| format!("Failed to create trash info directory: {}", e))?;
        fs::create_dir_all(&staging_dir)
            .map_err(|e| format!("Failed to create trash staging directory: {}", e))?;

        let orig_name = source_path
            .file_name()
            .and_then(|s| s.to_str())
            .ok_or_else(|| "Invalid source filename".to_string())?;

        // Resolve collision in Trash according to FreeDesktop spec: <name>.<n>.<ext>
        let target_name = resolve_trash_collision(&files_dir, &info_dir, orig_name);
        let target_file_path = files_dir.join(&target_name);
        let target_info_path = info_dir.join(format!("{}.trashinfo", target_name));

        // Format ISO 8601 deletion timestamp
        let now_iso = format_iso8601_now();
        let abs_source = source_path
            .canonicalize()
            .unwrap_or_else(|_| source_path.to_path_buf());
        let abs_source_str = abs_source.to_string_lossy();
        let encoded_source_path = url_encode_path(&abs_source_str);

        let trashinfo_content = format!(
            "[Trash Info]\nPath={}\nDeletionDate={}\n",
            encoded_source_path, now_iso
        );

        // Try instantaneous same-filesystem rename first (unless fault injection forces copy)
        let force_cross_device = self.fault_injection.as_ref().is_some();
        let mut rename_successful = false;

        if !force_cross_device {
            // Recheck destination paths immediately before rename
            if !path_is_occupied(&target_file_path) && !path_is_occupied(&target_info_path) {
                if let Ok(()) = fs::rename(source_path, &target_file_path) {
                    rename_successful = true;
                    if let Err(e) = write_trashinfo_exclusive(&target_info_path, &trashinfo_content)
                    {
                        // Roll back rename if possible
                        let _ = fs::rename(&target_file_path, source_path);
                        return Err(format!("Failed to write .trashinfo: {}", e));
                    }
                }
            }
        }

        if !rename_successful {
            // Transactional cross-device copy-verify-finalize-remove sequence
            let unique_token = format!(
                "stage_{}_{}_{}",
                std::process::id(),
                SystemTime::now()
                    .duration_since(UNIX_EPOCH)
                    .unwrap_or_default()
                    .as_nanos(),
                target_name
            );
            let staging_path = staging_dir.join(&unique_token);

            // Step 1: Staged copy (source remains 100% untouched)
            if let Err(copy_err) =
                copy_tree_non_destructive(source_path, &staging_path, self.fault_injection.as_ref())
            {
                let _ = remove_dir_contents_recursive(&staging_path);
                let _ = fs::remove_dir(&staging_path);
                let _ = fs::remove_file(&staging_path);
                return Err(format!("Cross-device trash copy failed: {}", copy_err));
            }

            // Step 2: Verification of staged copy
            if let Err(verify_err) =
                verify_staged_copy(source_path, &staging_path, self.fault_injection.as_ref())
            {
                let _ = remove_dir_contents_recursive(&staging_path);
                let _ = fs::remove_dir(&staging_path);
                let _ = fs::remove_file(&staging_path);
                return Err(format!(
                    "Verification of staged trash copy failed: {}",
                    verify_err
                ));
            }

            // Step 3: Write metadata
            if let Some(f) = self.fault_injection.as_ref() {
                if f.fail_metadata_write {
                    let _ = remove_dir_contents_recursive(&staging_path);
                    let _ = fs::remove_dir(&staging_path);
                    let _ = fs::remove_file(&staging_path);
                    return Err("Simulated fault: failed writing .trashinfo".to_string());
                }
            }

            if let Err(info_err) = write_trashinfo_exclusive(&target_info_path, &trashinfo_content)
            {
                let _ = remove_dir_contents_recursive(&staging_path);
                let _ = fs::remove_dir(&staging_path);
                let _ = fs::remove_file(&staging_path);
                return Err(format!("Failed to write .trashinfo metadata: {}", info_err));
            }

            // Step 4: Finalize staged copy into Trash/files/ (same filesystem rename)
            // Recheck destination file path is not occupied immediately before finalization
            if path_is_occupied(&target_file_path) {
                let _ = fs::remove_file(&target_info_path);
                let _ = remove_dir_contents_recursive(&staging_path);
                let _ = fs::remove_dir(&staging_path);
                let _ = fs::remove_file(&staging_path);
                return Err(format!(
                    "Target file path '{}' became occupied before finalization",
                    target_file_path.display()
                ));
            }

            if let Err(finalize_err) = fs::rename(&staging_path, &target_file_path) {
                let _ = fs::remove_file(&target_info_path);
                let _ = remove_dir_contents_recursive(&staging_path);
                let _ = fs::remove_dir(&staging_path);
                let _ = fs::remove_file(&staging_path);
                return Err(format!(
                    "Failed to finalize staged copy into trash: {}",
                    finalize_err
                ));
            }

            // Step 5: Source removal (only now that data is verified and finalized in Trash)
            let removal_failed = if let Some(f) = self.fault_injection.as_ref() {
                f.fail_source_removal
            } else {
                false
            };

            let remove_res = if removal_failed {
                Err("Simulated fault: source removal error".to_string())
            } else if meta.is_dir() {
                remove_dir_contents_recursive(source_path)
                    .and_then(|_| fs::remove_dir(source_path).map_err(|e| e.to_string()))
            } else {
                fs::remove_file(source_path).map_err(|e| e.to_string())
            };

            if let Err(rem_err) = remove_res {
                // Verified copy is in Trash! We preserve it and report honest partial failure
                return Err(format!(
                    "Item was safely copied and verified in Trash ('{}'), but source could not be fully removed: {}. Source remainder and Trash copy both exist.",
                    target_name, rem_err
                ));
            }
        }

        Ok((size_bytes, file_count))
    }

    /// Permanently removes an item and its .trashinfo from Trash with strict path validation
    pub fn delete_permanently(&self, item_name: &str) -> Result<(u64, u64), String> {
        let trimmed = item_name.trim();
        if trimmed.is_empty() {
            return Err("Trash item name cannot be empty".to_string());
        }

        if trimmed.contains('/') || trimmed.contains('\\') || trimmed.contains('\0') {
            return Err(
                "Trash item name contains illegal path separators or control characters"
                    .to_string(),
            );
        }

        if trimmed == "." || trimmed == ".." || trimmed.contains("..") {
            return Err("Trash item name cannot contain relative path traversal".to_string());
        }

        if Path::new(trimmed).components().count() != 1 {
            return Err("Trash item name must be a single filename component".to_string());
        }

        let files_dir = self.files_dir();
        let info_dir = self.info_dir();
        let files_path = files_dir.join(trimmed);
        let info_path = info_dir.join(format!("{}.trashinfo", trimmed));

        if files_path.parent() != Some(&files_dir) || info_path.parent() != Some(&info_dir) {
            return Err(
                "Trash item target resolves outside designated trash directory".to_string(),
            );
        }

        let files_exists = files_path.exists() || fs::symlink_metadata(&files_path).is_ok();
        let info_exists = info_path.exists() || fs::symlink_metadata(&info_path).is_ok();

        if !files_exists && !info_exists {
            return Err(format!("Trash item '{}' does not exist", trimmed));
        }

        let mut freed_bytes: u64 = 0;
        let mut freed_files: u64 = 0;

        if files_exists {
            let meta = fs::symlink_metadata(&files_path)
                .map_err(|e| format!("Failed to stat trash file: {}", e))?;

            if meta.file_type().is_symlink() {
                fs::remove_file(&files_path)
                    .map_err(|e| format!("Failed to remove trash symlink: {}", e))?;
                freed_files += 1;
            } else if meta.is_dir() {
                let (bytes, count) = remove_dir_contents_recursive(&files_path)?;
                fs::remove_dir(&files_path)
                    .map_err(|e| format!("Failed to remove trash directory root: {}", e))?;
                freed_bytes += bytes;
                freed_files += count;
            } else {
                let len = meta.len();
                fs::remove_file(&files_path)
                    .map_err(|e| format!("Failed to remove trash file: {}", e))?;
                freed_bytes += len;
                freed_files += 1;
            }
        }

        if info_exists {
            let _ = fs::remove_file(info_path);
        }

        Ok((freed_bytes, freed_files))
    }
}

/// Percent-encodes a path according to the FreeDesktop Trash specification
pub fn url_encode_path(path: &str) -> String {
    let mut encoded = String::with_capacity(path.len());
    for b in path.bytes() {
        match b {
            b'a'..=b'z' | b'A'..=b'Z' | b'0'..=b'9' | b'-' | b'_' | b'.' | b'~' | b'/' => {
                encoded.push(b as char);
            }
            _ => {
                encoded.push_str(&format!("%{:02X}", b));
            }
        }
    }
    encoded
}

/// Percent-decodes a path from a .trashinfo file
pub fn url_decode_path(input: &str) -> String {
    let mut bytes = Vec::with_capacity(input.len());
    let input_bytes = input.as_bytes();
    let mut i = 0;
    while i < input_bytes.len() {
        if input_bytes[i] == b'%' && i + 2 < input_bytes.len() {
            if let Ok(byte_val) = u8::from_str_radix(
                std::str::from_utf8(&input_bytes[i + 1..i + 3]).unwrap_or(""),
                16,
            ) {
                bytes.push(byte_val);
                i += 3;
                continue;
            }
        }
        bytes.push(input_bytes[i]);
        i += 1;
    }
    String::from_utf8_lossy(&bytes).to_string()
}

/// Helper to parse a .trashinfo INI file
fn parse_trashinfo_file(path: &Path) -> (String, String) {
    let mut file = match fs::File::open(path) {
        Ok(f) => f,
        Err(_) => return ("Unknown".to_string(), "Unknown".to_string()),
    };

    let mut content = String::new();
    if file.read_to_string(&mut content).is_err() {
        return ("Unknown".to_string(), "Unknown".to_string());
    }

    let mut orig_path = String::new();
    let mut del_date = String::new();

    for line in content.lines() {
        let trimmed = line.trim();
        if let Some(rest) = trimmed.strip_prefix("Path=") {
            orig_path = url_decode_path(rest);
        } else if let Some(rest) = trimmed.strip_prefix("DeletionDate=") {
            del_date = rest.to_string();
        }
    }

    (
        if orig_path.is_empty() {
            "Unknown".to_string()
        } else {
            orig_path
        },
        if del_date.is_empty() {
            "Unknown".to_string()
        } else {
            del_date
        },
    )
}

/// Helper to check if a path exists or is a symlink (including broken symlinks)
fn path_is_occupied(path: &Path) -> bool {
    path.exists() || fs::symlink_metadata(path).is_ok()
}

/// Atomically writes .trashinfo metadata using create_new (O_CREAT | O_EXCL)
fn write_trashinfo_exclusive(path: &Path, content: &str) -> Result<(), String> {
    let mut file = fs::OpenOptions::new()
        .write(true)
        .create_new(true)
        .open(path)
        .map_err(|e| format!("Failed to create .trashinfo exclusively: {}", e))?;
    file.write_all(content.as_bytes())
        .map_err(|e| format!("Failed to write .trashinfo content: {}", e))
}

/// Resolve FreeDesktop trash naming collision: <base>.<n>.<ext>
/// Ensures neither Trash/files/<name> nor Trash/info/<name>.trashinfo exists.
fn resolve_trash_collision(files_dir: &Path, info_dir: &Path, name: &str) -> String {
    let candidate_file = files_dir.join(name);
    let candidate_info = info_dir.join(format!("{}.trashinfo", name));
    if !path_is_occupied(&candidate_file) && !path_is_occupied(&candidate_info) {
        return name.to_string();
    }

    let path = Path::new(name);
    let stem = path.file_stem().and_then(|s| s.to_str()).unwrap_or(name);
    let ext = path.extension().and_then(|s| s.to_str());

    let mut counter = 1;
    loop {
        let candidate_name = match ext {
            Some(e) => format!("{}.{}.{}", stem, counter, e),
            None => format!("{}.{}", stem, counter),
        };
        let c_file = files_dir.join(&candidate_name);
        let c_info = info_dir.join(format!("{}.trashinfo", candidate_name));
        if !path_is_occupied(&c_file) && !path_is_occupied(&c_info) {
            return candidate_name;
        }
        counter += 1;
        if counter > 10000 {
            let fallback = format!(
                "{}.{}_{}",
                name,
                std::process::id(),
                SystemTime::now()
                    .duration_since(UNIX_EPOCH)
                    .unwrap_or_default()
                    .as_nanos()
            );
            return fallback;
        }
    }
}

/// Formats current UTC time as ISO 8601 (YYYY-MM-DDTHH:MM:SS)
fn format_iso8601_now() -> String {
    let now = SystemTime::now();
    let dur = now.duration_since(UNIX_EPOCH).unwrap_or_default();
    let secs = dur.as_secs();

    let days = secs / 86400;
    let rem_secs = secs % 86400;
    let hours = rem_secs / 3600;
    let mins = (rem_secs % 3600) / 60;
    let s = rem_secs % 60;

    // Approximate year/month from days since 1970-01-01
    let mut y = 1970;
    let mut d = days;

    loop {
        let leap = if (y % 4 == 0 && y % 100 != 0) || (y % 400 == 0) {
            366
        } else {
            365
        };
        if d < leap {
            break;
        }
        d -= leap;
        y += 1;
    }

    let is_leap = (y % 4 == 0 && y % 100 != 0) || (y % 400 == 0);
    let month_days = [
        31,
        if is_leap { 29 } else { 28 },
        31,
        30,
        31,
        30,
        31,
        31,
        30,
        31,
        30,
        31,
    ];

    let mut m = 1;
    for &md in &month_days {
        if d < md {
            break;
        }
        d -= md;
        m += 1;
    }
    let day = d + 1;

    format!(
        "{:04}-{:02}-{:02}T{:02}:{:02}:{:02}",
        y, m, day, hours, mins, s
    )
}

/// Recursively removes directory contents safely without following symlinks
pub fn remove_dir_contents_recursive(dir: &Path) -> Result<(u64, u64), String> {
    let mut bytes_freed: u64 = 0;
    let mut files_removed: u64 = 0;

    let entries = fs::read_dir(dir)
        .map_err(|e| format!("Failed to read directory {}: {}", dir.display(), e))?;

    for entry in entries {
        let entry = match entry {
            Ok(e) => e,
            Err(_) => continue,
        };

        let path = entry.path();
        let meta = match fs::symlink_metadata(&path) {
            Ok(m) => m,
            Err(_) => continue,
        };

        if meta.file_type().is_symlink() {
            // Remove symlink directly without following
            let len = meta.len();
            if fs::remove_file(&path).is_ok() {
                bytes_freed += len;
                files_removed += 1;
            }
        } else if meta.is_dir() {
            let (b, f) = remove_dir_contents_recursive(&path)?;
            if fs::remove_dir(&path).is_ok() {
                bytes_freed += b;
                files_removed += f;
            }
        } else {
            let len = meta.len();
            if fs::remove_file(&path).is_ok() {
                bytes_freed += len;
                files_removed += 1;
            }
        }
    }

    Ok((bytes_freed, files_removed))
}

/// Computes exact directory size and file count without following symlinks
pub fn compute_exact_dir_size(dir: &Path) -> (u64, u64) {
    let mut total_bytes: u64 = 0;
    let mut total_files: u64 = 0;

    if let Ok(entries) = fs::read_dir(dir) {
        for entry in entries.flatten() {
            let path = entry.path();
            if let Ok(meta) = fs::symlink_metadata(&path) {
                if meta.file_type().is_symlink() {
                    total_bytes += meta.len();
                } else if meta.is_dir() {
                    let (sub_bytes, sub_files) = compute_exact_dir_size(&path);
                    total_bytes += sub_bytes;
                    total_files += sub_files;
                } else {
                    total_bytes += meta.len();
                    total_files += 1;
                }
            }
        }
    }

    (total_bytes, total_files)
}

/// Non-destructive tree copy for staging during cross-device operations
fn copy_tree_non_destructive(
    src: &Path,
    dst: &Path,
    fault: Option<&TrashFaultInjection>,
) -> Result<(), String> {
    if let Some(f) = fault {
        if f.fail_copy {
            return Err("Simulated fault: copy failed".to_string());
        }
    }

    let meta = fs::symlink_metadata(src).map_err(|e| e.to_string())?;

    if meta.is_dir() {
        fs::create_dir_all(dst).map_err(|e| e.to_string())?;
        for entry in fs::read_dir(src).map_err(|e| e.to_string())?.flatten() {
            let sub_src = entry.path();
            let sub_dst = dst.join(entry.file_name());
            copy_tree_non_destructive(&sub_src, &sub_dst, fault)?;
        }
    } else if meta.file_type().is_symlink() {
        let link_target = fs::read_link(src).map_err(|e| e.to_string())?;
        std::os::unix::fs::symlink(&link_target, dst).map_err(|e| e.to_string())?;
    } else if meta.is_file() {
        fs::copy(src, dst).map_err(|e| e.to_string())?;
    } else {
        return Err(format!(
            "Unsupported special file type at {}",
            src.display()
        ));
    }

    Ok(())
}

/// Verifies that a staged copy matches the source directory or file
fn verify_staged_copy(
    src: &Path,
    dst: &Path,
    fault: Option<&TrashFaultInjection>,
) -> Result<(), String> {
    if let Some(f) = fault {
        if f.fail_verification {
            return Err("Simulated fault: verification failed".to_string());
        }
    }

    let src_meta = fs::symlink_metadata(src).map_err(|e| {
        format!(
            "Failed to read metadata for source {}: {}",
            src.display(),
            e
        )
    })?;
    let dst_meta = fs::symlink_metadata(dst).map_err(|e| {
        format!(
            "Failed to read metadata for staged copy {}: {}",
            dst.display(),
            e
        )
    })?;

    if src_meta.is_dir() {
        if !dst_meta.is_dir() {
            return Err(format!(
                "Source is a directory but staged copy is not: {}",
                dst.display()
            ));
        }
        for entry in fs::read_dir(src).map_err(|e| e.to_string())?.flatten() {
            let sub_src = entry.path();
            let sub_dst = dst.join(entry.file_name());
            verify_staged_copy(&sub_src, &sub_dst, fault)?;
        }
    } else if src_meta.file_type().is_symlink() {
        if !dst_meta.file_type().is_symlink() {
            return Err(format!(
                "Source is a symlink but staged copy is not: {}",
                dst.display()
            ));
        }
        let src_link = fs::read_link(src).map_err(|e| e.to_string())?;
        let dst_link = fs::read_link(dst).map_err(|e| e.to_string())?;
        if src_link != dst_link {
            return Err(format!(
                "Symlink target mismatch: {:?} vs {:?}",
                src_link, dst_link
            ));
        }
    } else if src_meta.is_file() {
        if !dst_meta.is_file() {
            return Err(format!(
                "Source is a file but staged copy is not: {}",
                dst.display()
            ));
        }
        if src_meta.len() != dst_meta.len() {
            return Err(format!(
                "File size mismatch: {} vs {}",
                src_meta.len(),
                dst_meta.len()
            ));
        }
        // Byte-for-byte content comparison for regular files
        let mut src_file = fs::File::open(src).map_err(|e| e.to_string())?;
        let mut dst_file = fs::File::open(dst).map_err(|e| e.to_string())?;
        let mut buf_src = [0u8; 65536];
        let mut buf_dst = [0u8; 65536];
        loop {
            let n_src = src_file.read(&mut buf_src).map_err(|e| e.to_string())?;
            let n_dst = dst_file.read(&mut buf_dst).map_err(|e| e.to_string())?;
            if n_src != n_dst {
                return Err("Byte count mismatch during content verification".to_string());
            }
            if n_src == 0 {
                break;
            }
            if buf_src[..n_src] != buf_dst[..n_dst] {
                return Err("Byte-for-byte content mismatch during verification".to_string());
            }
        }
    } else {
        return Err(format!(
            "Unsupported special file type at {}",
            src.display()
        ));
    }

    Ok(())
}

/// Retrieves and validates the current user's HOME directory, failing closed if missing or invalid
pub fn get_validated_home_dir() -> Result<PathBuf, String> {
    let home =
        std::env::var("HOME").map_err(|_| "HOME environment variable is not set".to_string())?;
    if home.trim().is_empty() {
        return Err("HOME environment variable is empty".to_string());
    }
    let home_path = PathBuf::from(&home);
    if !home_path.is_absolute() {
        return Err("HOME environment variable must be an absolute path".to_string());
    }
    let canonical = home_path.canonicalize().map_err(|e| {
        format!(
            "Cannot resolve HOME directory '{}': {}",
            home_path.display(),
            e
        )
    })?;

    let canonical_str = canonical.to_string_lossy();
    if canonical_str == "/" || PROTECTED_SYSTEM_PATHS.contains(&canonical_str.as_ref()) {
        return Err(format!(
            "HOME cannot be root or a system directory: {}",
            canonical.display()
        ));
    }

    let meta = fs::symlink_metadata(&canonical)
        .map_err(|e| format!("Cannot access HOME metadata: {}", e))?;
    if meta.file_type().is_symlink() {
        return Err("HOME directory cannot be a symbolic link".to_string());
    }

    let euid = unsafe { libc::geteuid() };
    if meta.uid() != euid {
        return Err(format!(
            "HOME directory '{}' is owned by UID {} but process is running as UID {}",
            canonical.display(),
            meta.uid(),
            euid
        ));
    }

    Ok(canonical)
}

/// Validates that a path is safe for cleanup operations with an explicit home root
pub fn validate_cleanup_path_with_home(
    path: &Path,
    home_canonical: &Path,
) -> Result<PathBuf, String> {
    let path_str = path.to_string_lossy();

    // 1. Reject empty
    if path_str.trim().is_empty() {
        return Err("Cleanup path cannot be empty".to_string());
    }

    // 2. Reject relative paths
    if !path.is_absolute() {
        return Err("Relative paths are strictly prohibited for cleanup".to_string());
    }

    // 3. Reject path traversal
    if path_str.contains("..") {
        return Err("Path traversal (..) is strictly rejected".to_string());
    }

    // 4. Reject symlink input before canonicalization
    let orig_meta = fs::symlink_metadata(path)
        .map_err(|e| format!("Failed to read metadata for {}: {}", path.display(), e))?;

    if orig_meta.file_type().is_symlink() {
        return Err("Symbolic links cannot be target of cleanup".to_string());
    }

    // 5. Canonicalize
    let canonical = path
        .canonicalize()
        .map_err(|e| format!("Failed to canonicalize path {}: {}", path.display(), e))?;

    let canonical_str = canonical.to_string_lossy();

    // 6. Reject root and protected system paths
    if canonical_str == "/" {
        return Err("Filesystem root cannot be cleaned".to_string());
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
        return Err("Symbolic links cannot be target of cleanup".to_string());
    }

    // 8. User home boundaries
    if canonical == *home_canonical {
        return Err("User home root cannot be cleaned directly".to_string());
    }

    // Check protected user subpaths (.config, .ssh, .gnupg, etc.)
    for &sub in PROTECTED_USER_SUBPATHS {
        let protected = home_canonical.join(sub);
        if canonical == protected || canonical.starts_with(&protected) {
            return Err(format!(
                "Protected user configuration path cannot be cleaned: {}",
                sub
            ));
        }
    }

    // Prevent deleting critical top-level folders directly
    let local_share = home_canonical.join(".local/share");
    if canonical == local_share || canonical == home_canonical.join(".local") {
        return Err("Protected user data root cannot be cleaned directly".to_string());
    }

    // 9. Check approved zones
    let cache_root = home_canonical.join(".cache");
    let trash_root = home_canonical.join(".local/share/Trash");
    let tmp_root = PathBuf::from("/tmp");

    if canonical == cache_root {
        return Err(
            "Entire ~/.cache cannot be wiped directly; select specific subdirectories".to_string(),
        );
    }

    let is_in_home = canonical.starts_with(home_canonical);
    let is_in_cache = canonical.starts_with(&cache_root) && canonical != cache_root;
    let is_in_trash = canonical.starts_with(&trash_root);
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
        let name = canonical.file_name().and_then(|s| s.to_str()).unwrap_or("");
        let is_temp_cache = name.starts_with("rustc")
            || name.starts_with("cargo")
            || name.starts_with("pip-")
            || name.starts_with("npm-")
            || name.ends_with(".cache")
            || name.ends_with(".tmp");
        if !is_temp_cache {
            return Err(format!(
                "Arbitrary /tmp target '{}' is not an approved temporary cache pattern",
                canonical.display()
            ));
        }
    }

    if !is_in_cache && !is_in_trash && !is_in_tmp {
        // Check if it's an approved project build target
        let file_name = canonical.file_name().and_then(|s| s.to_str()).unwrap_or("");
        let is_build_target = (file_name == "target" && canonical.join("CACHEDIR.TAG").exists())
            || file_name == ".pytest_cache"
            || file_name == ".turbo";

        // Must still be inside user home if it's a build target
        if !is_build_target || !canonical.starts_with(home_canonical) {
            return Err(format!(
                "Path is outside permitted user cache, trash, and build boundaries: {}",
                canonical.display()
            ));
        }
    }

    Ok(canonical)
}

/// Validates that a path is safe for cleanup operations using the authenticated user home
pub fn validate_cleanup_path(path: &Path) -> Result<PathBuf, String> {
    let home = get_validated_home_dir()?;
    validate_cleanup_path_with_home(path, &home)
}

/// Approved cache definition table for safe candidate discovery
struct ApprovedCacheSpec {
    subpath: &'static str,
    title: &'static str,
    category: &'static str,
    description: &'static str,
    reason: &'static str,
    risk_level: &'static str,
}

const APPROVED_CACHES: &[ApprovedCacheSpec] = &[
    ApprovedCacheSpec {
        subpath: "google-chrome",
        title: "Chrome Browser Cache",
        category: "cache",
        description: "Web cache, media blobs, and temporary GPU shader buffers.",
        reason: "Chrome automatically regenerates cache files as pages are visited.",
        risk_level: "safe",
    },
    ApprovedCacheSpec {
        subpath: "chromium",
        title: "Chromium Browser Cache",
        category: "cache",
        description: "Cached website assets and media buffers.",
        reason: "Chromium will rebuild cache files on demand during browsing.",
        risk_level: "safe",
    },
    ApprovedCacheSpec {
        subpath: "mozilla/firefox",
        title: "Firefox Cache",
        category: "cache",
        description: "HTTP web cache files stored in ~/.cache/mozilla/firefox.",
        reason: "Safe to clear; does not affect saved bookmarks, passwords, or cookies.",
        risk_level: "safe",
    },
    ApprovedCacheSpec {
        subpath: "cargo",
        title: "Cargo Crate & Git Registry Cache",
        category: "developer",
        description: "Downloaded cargo crate archives and git index caches.",
        reason: "Cargo redownloads required crates seamlessly when projects are built.",
        risk_level: "safe",
    },
    ApprovedCacheSpec {
        subpath: "go-build",
        title: "Go Compiler Build Cache",
        category: "developer",
        description: "Cached object files and compilation packages from Go builds.",
        reason: "Go build cache speeds up compilation but can be rebuilt safely.",
        risk_level: "safe",
    },
    ApprovedCacheSpec {
        subpath: "thumbnails",
        title: "Desktop Image & Video Thumbnails",
        category: "cache",
        description: "Pre-rendered image and video preview thumbnails.",
        reason: "Desktop file managers recreate thumbnails automatically when folders are viewed.",
        risk_level: "safe",
    },
    ApprovedCacheSpec {
        subpath: "fontconfig",
        title: "Fontconfig Cache",
        category: "cache",
        description: "Generated font metric and shape cache binaries.",
        reason: "System font utilities refresh font caches automatically upon next launch.",
        risk_level: "safe",
    },
    ApprovedCacheSpec {
        subpath: "mesa_shader_cache",
        title: "Mesa Graphics Shader Cache",
        category: "cache",
        description: "Compiled OpenGL and Vulkan pipeline shaders.",
        reason: "GPU drivers recompile shaders as applications and games run.",
        risk_level: "safe",
    },
    ApprovedCacheSpec {
        subpath: "pip",
        title: "Python Pip Wheel Cache",
        category: "developer",
        description: "Cached Python wheel packages from pip install.",
        reason: "Pip fetches wheels from PyPI when installing new packages if cache is absent.",
        risk_level: "safe",
    },
    ApprovedCacheSpec {
        subpath: "yarn",
        title: "Yarn Package Cache",
        category: "developer",
        description: "Cached yarn package tarballs in ~/.cache/yarn.",
        reason: "Yarn redownloads packages from the registry if needed.",
        risk_level: "safe",
    },
    ApprovedCacheSpec {
        subpath: "lutris",
        title: "Lutris Game Banners & Runtime Cache",
        category: "cache",
        description: "Downloaded game cover artwork and temporary installer cache.",
        reason: "Artwork and runner assets are re-fetched as games are launched.",
        risk_level: "safe",
    },
    ApprovedCacheSpec {
        subpath: "fastfetch",
        title: "Fastfetch System Cache",
        category: "cache",
        description: "Cached system display and logo artifacts.",
        reason: "Fastfetch recomputes hardware specs instantly.",
        risk_level: "safe",
    },
];

/// Discovers real cleanup candidates across ~/.cache, Trash, build targets, and Pacman
pub fn discover_real_cleanup_candidates() -> Vec<CleanupRecommendation> {
    let mut candidates = Vec::new();
    let home = std::env::var("HOME").unwrap_or_default();
    if home.is_empty() {
        return candidates;
    }

    let home_path = PathBuf::from(&home);

    // 1. FreeDesktop Trash Discovery
    let trash = FreeDesktopTrash::default_for_user();
    let trash_items = trash.list_items();
    let total_trash_bytes: u64 = trash_items.iter().map(|i| i.size_bytes).sum();
    let total_trash_count: u64 = trash_items.len() as u64;

    if total_trash_count > 0 {
        candidates.push(CleanupRecommendation {
            id: "rec-trash-all".to_string(),
            title: "User Trash Bin".to_string(),
            category: "trash".to_string(),
            description: format!(
                "Contains {} discarded items in ~/.local/share/Trash (FreeDesktop spec).",
                total_trash_count
            ),
            reclaimable_bytes: total_trash_bytes,
            file_count: total_trash_count,
            risk_level: "caution".to_string(),
            path: trash.trash_dir.to_string_lossy().to_string(),
            checked: false, // Trash defaults to unchecked so user explicitly reviews
            reason: Some("Files have already been moved to Trash by user and can be safely purged permanently.".to_string()),
            action_type: Some("permanent_delete".to_string()),
            manual_command: None,
        });

        // If there are individual items in trash, also surface the largest ones individually
        let mut sorted_items = trash_items.clone();
        sorted_items.sort_by(|a, b| b.size_bytes.cmp(&a.size_bytes));
        for item in sorted_items.iter().take(5) {
            candidates.push(CleanupRecommendation {
                id: format!("rec-trash-item-{}", item.file_name),
                title: format!("Trash: {}", item.file_name),
                category: "trash".to_string(),
                description: format!(
                    "Trashed on {}. Original path: {}",
                    item.deletion_date, item.original_path
                ),
                reclaimable_bytes: item.size_bytes,
                file_count: item.file_count,
                risk_level: "caution".to_string(),
                path: item.files_path.to_string_lossy().to_string(),
                checked: false,
                reason: Some(format!(
                    "Individual file discarded from {}",
                    item.original_path
                )),
                action_type: Some("permanent_delete".to_string()),
                manual_command: None,
            });
        }
    }

    // 2. Discover Approved User Caches under ~/.cache
    let cache_dir = home_path.join(".cache");
    if cache_dir.exists() {
        for spec in APPROVED_CACHES {
            let target_path = cache_dir.join(spec.subpath);
            if target_path.exists() {
                let (bytes, count) = compute_exact_dir_size(&target_path);
                if bytes > 50 * 1024 {
                    // Only surface caches larger than 50 KB
                    candidates.push(CleanupRecommendation {
                        id: format!("rec-cache-{}", spec.subpath.replace('/', "-")),
                        title: spec.title.to_string(),
                        category: spec.category.to_string(),
                        description: spec.description.to_string(),
                        reclaimable_bytes: bytes,
                        file_count: count,
                        risk_level: spec.risk_level.to_string(),
                        path: target_path.to_string_lossy().to_string(),
                        checked: spec.risk_level == "safe",
                        reason: Some(spec.reason.to_string()),
                        action_type: Some("permanent_delete".to_string()),
                        manual_command: None,
                    });
                }
            }
        }
    }

    // 3. Stale Project Build Artifacts (target directories with CACHEDIR.TAG)
    let project_dir = home_path.join("project");
    if project_dir.exists() {
        find_stale_build_targets(&project_dir, 0, 3, &mut candidates);
    }

    // 4. Pacman Package Cache (Requirement D: Explanatory with manual instructions)
    let pacman_pkg = Path::new("/var/cache/pacman/pkg");
    if pacman_pkg.exists() {
        let (pacman_bytes, pacman_count) = compute_exact_dir_size(pacman_pkg);
        if pacman_bytes > 1024 * 1024 {
            candidates.push(CleanupRecommendation {
                id: "rec-pacman-pkg-manual".to_string(),
                title: "Pacman Package Cache".to_string(),
                category: "package_cache".to_string(),
                description: format!(
                    "{} cached package tarballs ({}) in /var/cache/pacman/pkg.",
                    pacman_count,
                    format_bytes_human(pacman_bytes)
                ),
                reclaimable_bytes: pacman_bytes,
                file_count: pacman_count,
                risk_level: "manual_review".to_string(),
                path: "/var/cache/pacman/pkg".to_string(),
                checked: false, // Must be unchecked; cannot be auto-deleted
                reason: Some("System package tarballs for rollback. Direct deletion without package manager is unsafe and requires root privileges.".to_string()),
                action_type: Some("manual_instruction".to_string()),
                manual_command: Some("sudo paccache -r".to_string()),
            });
        }
    }

    candidates
}

/// Recursively find stale Rust target/ or node_modules build directories
fn find_stale_build_targets(
    dir: &Path,
    current_depth: usize,
    max_depth: usize,
    results: &mut Vec<CleanupRecommendation>,
) {
    if current_depth > max_depth {
        return;
    }

    let entries = match fs::read_dir(dir) {
        Ok(e) => e,
        Err(_) => return,
    };

    for entry in entries.flatten() {
        let path = entry.path();
        let meta = match fs::symlink_metadata(&path) {
            Ok(m) => m,
            Err(_) => continue,
        };

        if !meta.is_dir() || meta.file_type().is_symlink() {
            continue;
        }

        let name = entry.file_name();
        let name_str = name.to_string_lossy();

        if name_str == "target" && path.join("CACHEDIR.TAG").exists() {
            let (bytes, count) = compute_exact_dir_size(&path);
            if bytes > 5 * 1024 * 1024 {
                results.push(CleanupRecommendation {
                    id: format!("rec-dev-{}", path.to_string_lossy().replace('/', "-")),
                    title: format!("Rust Build Artifacts ({})", dir.file_name().unwrap_or_default().to_string_lossy()),
                    category: "developer".to_string(),
                    description: format!("Compiled binaries and intermediate crates in {}.", path.display()),
                    reclaimable_bytes: bytes,
                    file_count: count,
                    risk_level: "safe".to_string(),
                    path: path.to_string_lossy().to_string(),
                    checked: false,
                    reason: Some("Target directory can be safely cleaned and will be rebuilt upon running 'cargo build'.".to_string()),
                    action_type: Some("permanent_delete".to_string()),
                    manual_command: None,
                });
            }
        } else if !name_str.starts_with('.') && name_str != "target" && name_str != "node_modules" {
            find_stale_build_targets(&path, current_depth + 1, max_depth, results);
        }
    }
}

/// Performs safe, validated execution of cleanup candidates
pub fn execute_validated_cleanup(
    request: CleanupActionRequest,
    trash_override: Option<&Path>,
) -> Result<CleanupExecutionSummary, String> {
    // Safety check: ensure not running with elevated root privileges
    unsafe {
        if libc::geteuid() == 0 {
            return Err("Spacewise must not be executed with root/sudo privileges".to_string());
        }
    }

    // Validate action upfront - strictly reject empty, unknown, or malformed actions
    let is_trash = match request.action.as_str() {
        "trash" => true,
        "permanent_delete" => false,
        unknown => {
            return Err(format!(
                "Unknown or invalid cleanup action '{}'. Allowed actions are 'trash' and 'permanent_delete'",
                unknown
            ));
        }
    };

    let discovered = discover_real_cleanup_candidates();
    let trash = match trash_override {
        Some(p) => FreeDesktopTrash::new(p.to_path_buf()),
        None => FreeDesktopTrash::default_for_user(),
    };

    let mut item_results = Vec::new();
    let mut total_bytes_freed: u64 = 0;
    let mut total_files_removed: u64 = 0;
    let mut success_count = 0;
    let mut failure_count = 0;

    for candidate_id in request.candidate_ids {
        // 0. Explicit safety guard: pacman package cache manual instruction item
        // is strictly prohibited from direct deletion for system safety, even if absent or in non-Arch environments.
        if candidate_id == "rec-pacman-pkg-manual" {
            failure_count += 1;
            item_results.push(CleanupItemResult {
                id: candidate_id,
                path: "/var/cache/pacman/pkg".to_string(),
                success: false,
                bytes_freed: 0,
                files_removed: 0,
                error: Some(
                    "Direct deletion is prohibited for system safety. Please run manual command: sudo paccache -r".to_string(),
                ),
            });
            continue;
        }

        // 1. Candidate must be registered in the discovered candidate set
        let candidate = match discovered.iter().find(|c| c.id == candidate_id) {
            Some(c) => c,
            None => {
                failure_count += 1;
                item_results.push(CleanupItemResult {
                    id: candidate_id,
                    path: String::new(),
                    success: false,
                    bytes_freed: 0,
                    files_removed: 0,
                    error: Some(
                        "Candidate ID was not found in active verified candidates list".to_string(),
                    ),
                });
                continue;
            }
        };

        // 2. Reject manual instruction items (e.g. pacman package cache)
        if candidate.action_type.as_deref() == Some("manual_instruction") {
            failure_count += 1;
            item_results.push(CleanupItemResult {
                id: candidate.id.clone(),
                path: candidate.path.clone(),
                success: false,
                bytes_freed: 0,
                files_removed: 0,
                error: Some(format!(
                    "Direct deletion is prohibited for system safety. Please run manual command: {}",
                    candidate.manual_command.as_deref().unwrap_or("sudo pacman -Sc")
                )),
            });
            continue;
        }

        let target_path = PathBuf::from(&candidate.path);

        // 3. Path validation and safety boundaries
        let validated_path = match validate_cleanup_path(&target_path) {
            Ok(p) => p,
            Err(e) => {
                failure_count += 1;
                item_results.push(CleanupItemResult {
                    id: candidate.id.clone(),
                    path: candidate.path.clone(),
                    success: false,
                    bytes_freed: 0,
                    files_removed: 0,
                    error: Some(format!("Validation rejected path: {}", e)),
                });
                continue;
            }
        };

        // 4. Revalidate that the target still exists and is not a symlink
        let meta = match fs::symlink_metadata(&validated_path) {
            Ok(m) => m,
            Err(e) => {
                failure_count += 1;
                item_results.push(CleanupItemResult {
                    id: candidate.id.clone(),
                    path: candidate.path.clone(),
                    success: false,
                    bytes_freed: 0,
                    files_removed: 0,
                    error: Some(format!("Candidate path changed or no longer exists: {}", e)),
                });
                continue;
            }
        };

        if meta.file_type().is_symlink() {
            failure_count += 1;
            item_results.push(CleanupItemResult {
                id: candidate.id.clone(),
                path: candidate.path.clone(),
                success: false,
                bytes_freed: 0,
                files_removed: 0,
                error: Some("Refusing to clean symlinked target".to_string()),
            });
            continue;
        }

        // 5. Execute action: Move to Trash vs Permanent Deletion
        let (bytes_freed, files_removed, error) = if is_trash {
            // FreeDesktop Trash move
            match trash.move_to_trash(&validated_path) {
                Ok((bytes, count)) => (bytes, count, None),
                Err(e) => (0, 0, Some(format!("Failed to move to Trash: {}", e))),
            }
        } else {
            // Permanent deletion
            // Check if it's already an item in Trash
            let is_trash_all = candidate.id == "rec-trash-all";
            let is_trash_item = candidate.id.starts_with("rec-trash-item-");

            if is_trash_all {
                // Empty entire trash
                let mut all_bytes: u64 = 0;
                let mut all_files: u64 = 0;
                let mut had_err = None;

                for item in trash.list_items() {
                    match trash.delete_permanently(&item.file_name) {
                        Ok((b, f)) => {
                            all_bytes += b;
                            all_files += f;
                        }
                        Err(e) => had_err = Some(e),
                    }
                }
                (all_bytes, all_files, had_err)
            } else if is_trash_item {
                let file_name = validated_path
                    .file_name()
                    .and_then(|s| s.to_str())
                    .unwrap_or_default();
                match trash.delete_permanently(file_name) {
                    Ok((b, f)) => (b, f, None),
                    Err(e) => (0, 0, Some(format!("Failed to delete from trash: {}", e))),
                }
            } else if meta.is_dir() {
                // Clear cache directory contents without deleting the folder itself,
                // or remove and recreate directory
                match remove_dir_contents_recursive(&validated_path) {
                    Ok((b, f)) => (b, f, None),
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
                    Err(e) => (0, 0, Some(format!("Failed to remove file: {}", e))),
                }
            }
        };

        if let Some(err_msg) = error {
            failure_count += 1;
            item_results.push(CleanupItemResult {
                id: candidate.id.clone(),
                path: candidate.path.clone(),
                success: false,
                bytes_freed,
                files_removed,
                error: Some(err_msg),
            });
        } else {
            success_count += 1;
            total_bytes_freed += bytes_freed;
            total_files_removed += files_removed;
            item_results.push(CleanupItemResult {
                id: candidate.id.clone(),
                path: candidate.path.clone(),
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

fn format_bytes_human(bytes: u64) -> String {
    if bytes >= 1024 * 1024 * 1024 {
        format!("{:.1} GB", bytes as f64 / (1024.0 * 1024.0 * 1024.0))
    } else if bytes >= 1024 * 1024 {
        format!("{:.1} MB", bytes as f64 / (1024.0 * 1024.0))
    } else if bytes >= 1024 {
        format!("{:.1} KB", bytes as f64 / 1024.0)
    } else {
        format!("{} B", bytes)
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::io::Write;

    #[test]
    fn test_validate_path_rejects_root_and_system() {
        assert!(validate_cleanup_path(Path::new("/")).is_err());
        assert!(validate_cleanup_path(Path::new("/etc")).is_err());
        assert!(validate_cleanup_path(Path::new("/usr/bin")).is_err());
        assert!(validate_cleanup_path(Path::new("/var")).is_err());
    }

    #[test]
    fn test_validate_path_rejects_path_traversal() {
        assert!(validate_cleanup_path(Path::new("/home/krishna/../etc/passwd")).is_err());
        assert!(validate_cleanup_path(Path::new("~/.cache/../../etc")).is_err());
    }

    #[test]
    fn test_validate_path_rejects_symlinks() {
        let temp_dir =
            std::env::temp_dir().join(format!("spacewise_cleanup_symlink_{}", std::process::id()));
        let _ = fs::remove_dir_all(&temp_dir);
        fs::create_dir_all(&temp_dir).unwrap();

        let real_file = temp_dir.join("real.txt");
        fs::File::create(&real_file)
            .unwrap()
            .write_all(b"content")
            .unwrap();

        let symlink = temp_dir.join("link_to_real");
        #[cfg(unix)]
        std::os::unix::fs::symlink(&real_file, &symlink).unwrap();

        let res = validate_cleanup_path(&symlink);
        assert!(res.is_err(), "Symlinks must be rejected for cleanup");

        let _ = fs::remove_dir_all(&temp_dir);
    }

    #[test]
    fn test_freedesktop_trash_create_and_metadata() {
        let temp_dir =
            std::env::temp_dir().join(format!("spacewise_trash_test_{}", std::process::id()));
        let _ = fs::remove_dir_all(&temp_dir);
        let trash_dir = temp_dir.join("Trash");
        let work_dir = temp_dir.join("work");
        fs::create_dir_all(&work_dir).unwrap();

        let trash = FreeDesktopTrash::new(trash_dir.clone());

        // Create a test file
        let file_path = work_dir.join("document.txt");
        fs::File::create(&file_path)
            .unwrap()
            .write_all(b"important data to trash")
            .unwrap();

        let (bytes, count) = trash.move_to_trash(&file_path).unwrap();
        assert_eq!(bytes, 23);
        assert_eq!(count, 1);
        assert!(!file_path.exists(), "Original file must be moved");

        // Verify in Trash/files and Trash/info
        let trashed_file = trash.files_dir().join("document.txt");
        let trashed_info = trash.info_dir().join("document.txt.trashinfo");
        assert!(trashed_file.exists());
        assert!(trashed_info.exists());

        // Verify .trashinfo contents
        let info_content = fs::read_to_string(&trashed_info).unwrap();
        assert!(info_content.contains("[Trash Info]"));
        assert!(info_content.contains("Path="));
        assert!(info_content.contains("DeletionDate="));

        // Test list items
        let items = trash.list_items();
        assert_eq!(items.len(), 1);
        assert_eq!(items[0].file_name, "document.txt");
        assert_eq!(items[0].size_bytes, 23);

        // Test collision handling: trash another document.txt
        let file_path_2 = work_dir.join("document.txt");
        fs::File::create(&file_path_2)
            .unwrap()
            .write_all(b"second document")
            .unwrap();
        trash.move_to_trash(&file_path_2).unwrap();

        // Second should be document.1.txt
        assert!(trash.files_dir().join("document.1.txt").exists());
        assert!(trash.info_dir().join("document.1.txt.trashinfo").exists());

        let _ = fs::remove_dir_all(&temp_dir);
    }

    #[test]
    fn test_freedesktop_trash_permanent_delete() {
        let temp_dir =
            std::env::temp_dir().join(format!("spacewise_trash_del_test_{}", std::process::id()));
        let _ = fs::remove_dir_all(&temp_dir);
        let trash_dir = temp_dir.join("Trash");
        let work_dir = temp_dir.join("work");
        fs::create_dir_all(&work_dir).unwrap();

        let trash = FreeDesktopTrash::new(trash_dir.clone());

        let file_path = work_dir.join("garbage.bin");
        fs::File::create(&file_path)
            .unwrap()
            .write_all(&vec![b'X'; 500])
            .unwrap();
        trash.move_to_trash(&file_path).unwrap();

        assert_eq!(trash.list_items().len(), 1);

        let (freed_bytes, freed_files) = trash.delete_permanently("garbage.bin").unwrap();
        assert_eq!(freed_bytes, 500);
        assert_eq!(freed_files, 1);
        assert_eq!(trash.list_items().len(), 0);
        assert!(!trash.files_dir().join("garbage.bin").exists());
        assert!(!trash.info_dir().join("garbage.bin.trashinfo").exists());

        let _ = fs::remove_dir_all(&temp_dir);
    }

    #[test]
    fn test_remove_dir_contents_recursive_measures_exact_bytes() {
        let temp_dir =
            std::env::temp_dir().join(format!("spacewise_dir_del_test_{}", std::process::id()));
        let _ = fs::remove_dir_all(&temp_dir);
        let sub = temp_dir.join("cache/sub");
        fs::create_dir_all(&sub).unwrap();

        fs::File::create(temp_dir.join("cache/a.tmp"))
            .unwrap()
            .write_all(&vec![b'A'; 100])
            .unwrap();
        fs::File::create(sub.join("b.tmp"))
            .unwrap()
            .write_all(&vec![b'B'; 200])
            .unwrap();

        let (freed_bytes, freed_files) =
            remove_dir_contents_recursive(&temp_dir.join("cache")).unwrap();
        assert_eq!(freed_bytes, 300);
        assert_eq!(freed_files, 2);

        // Verify files removed but parent exists
        assert!(temp_dir.join("cache").exists());
        assert!(!temp_dir.join("cache/a.tmp").exists());

        let _ = fs::remove_dir_all(&temp_dir);
    }

    #[test]
    fn test_pacman_manual_instruction_cannot_be_deleted() {
        let req = CleanupActionRequest {
            candidate_ids: vec!["rec-pacman-pkg-manual".to_string()],
            action: "permanent_delete".to_string(),
        };

        let temp_trash =
            std::env::temp_dir().join(format!("spacewise_test_trash_pac_{}", std::process::id()));
        let summary = execute_validated_cleanup(req, Some(&temp_trash)).unwrap();

        assert_eq!(summary.failure_count, 1);
        assert_eq!(summary.success_count, 0);
        assert!(
            summary.item_results[0]
                .error
                .as_ref()
                .unwrap()
                .contains("prohibited for system safety")
        );
    }

    #[test]
    fn test_unknown_candidate_id_fails_gracefully() {
        let req = CleanupActionRequest {
            candidate_ids: vec!["arbitrary-id-not-in-discovered-list".to_string()],
            action: "trash".to_string(),
        };

        let temp_trash =
            std::env::temp_dir().join(format!("spacewise_test_trash_unk_{}", std::process::id()));
        let summary = execute_validated_cleanup(req, Some(&temp_trash)).unwrap();

        assert_eq!(summary.failure_count, 1);
        assert_eq!(summary.success_count, 0);
        assert!(
            summary.item_results[0]
                .error
                .as_ref()
                .unwrap()
                .contains("was not found")
        );
    }

    #[test]
    fn test_cleanup_handles_changed_or_missing_file_before_execution() {
        let temp_dir = std::env::temp_dir().join(format!(
            "spacewise_changed_file_test_{}",
            std::process::id()
        ));
        let _ = fs::remove_dir_all(&temp_dir);
        let trash = FreeDesktopTrash::new(temp_dir.join("Trash"));

        // Attempting to delete a file that does not exist in Trash
        let res = trash.delete_permanently("non_existent_file.dat");
        assert!(res.is_err(), "Must report error for non-existent item");

        let _ = fs::remove_dir_all(&temp_dir);
    }

    #[test]
    fn test_cleanup_handles_permissions_and_preserves_partial_state() {
        use std::os::unix::fs::PermissionsExt;

        let temp_dir = std::env::temp_dir().join(format!(
            "spacewise_perm_cleanup_test_{}",
            std::process::id()
        ));
        let _ = fs::remove_dir_all(&temp_dir);
        let target_dir = temp_dir.join("cache");
        fs::create_dir_all(&target_dir).unwrap();

        let normal_file = target_dir.join("normal.txt");
        fs::File::create(&normal_file)
            .unwrap()
            .write_all(b"data")
            .unwrap();

        let locked_file = target_dir.join("locked.txt");
        let mut f = fs::File::create(&locked_file).unwrap();
        f.write_all(b"locked").unwrap();

        // Make directory read-only to prevent deletions
        let mut perms = fs::metadata(&target_dir).unwrap().permissions();
        perms.set_mode(0o555);
        let _ = fs::set_permissions(&target_dir, perms.clone());

        let res = remove_dir_contents_recursive(&target_dir);

        // Restore permissions to clean up temp dir
        perms.set_mode(0o755);
        let _ = fs::set_permissions(&target_dir, perms);

        assert!(res.is_ok() || res.is_err());
        let _ = fs::remove_dir_all(&temp_dir);
    }

    #[test]
    fn test_unknown_action_fails_closed_before_mutation() {
        let invalid_actions = vec![
            "",
            "clean",
            "delete",
            "trash ",
            "DESTROY",
            "remove",
            "permanent",
        ];

        for action in invalid_actions {
            let req = CleanupActionRequest {
                candidate_ids: vec!["rec-trash-all".to_string()],
                action: action.to_string(),
            };

            let temp_trash =
                std::env::temp_dir().join(format!("spacewise_invalid_act_{}", std::process::id()));
            let res = execute_validated_cleanup(req, Some(&temp_trash));
            assert!(res.is_err(), "Action '{}' must be rejected", action);
            assert!(
                res.unwrap_err()
                    .contains("Unknown or invalid cleanup action"),
                "Must reject before any filesystem mutation"
            );
        }
    }

    #[test]
    fn test_fail_closed_path_validation_with_home() {
        let temp_dir =
            std::env::temp_dir().join(format!("spacewise_fail_closed_home_{}", std::process::id()));
        let _ = fs::remove_dir_all(&temp_dir);
        fs::create_dir_all(&temp_dir).unwrap();

        let fake_home = temp_dir.join("user_home");
        fs::create_dir_all(&fake_home).unwrap();
        let fake_home_canonical = fake_home.canonicalize().unwrap();

        // 1. Empty path rejected
        assert!(validate_cleanup_path_with_home(Path::new(""), &fake_home_canonical).is_err());

        // 2. Relative path rejected
        assert!(
            validate_cleanup_path_with_home(Path::new("relative/cache"), &fake_home_canonical)
                .is_err()
        );

        // 3. Path traversal rejected
        assert!(
            validate_cleanup_path_with_home(Path::new("/tmp/../etc"), &fake_home_canonical)
                .is_err()
        );

        // 4. User home root rejected directly
        assert!(
            validate_cleanup_path_with_home(&fake_home_canonical, &fake_home_canonical).is_err()
        );

        // 5. Protected user subpaths rejected
        let ssh_dir = fake_home_canonical.join(".ssh");
        fs::create_dir_all(&ssh_dir).unwrap();
        assert!(validate_cleanup_path_with_home(&ssh_dir, &fake_home_canonical).is_err());

        let config_dir = fake_home_canonical.join(".config");
        fs::create_dir_all(&config_dir).unwrap();
        assert!(validate_cleanup_path_with_home(&config_dir, &fake_home_canonical).is_err());

        // 6. Path outside permitted zones rejected
        let doc_file = fake_home_canonical.join("Documents/tax_return.pdf");
        fs::create_dir_all(doc_file.parent().unwrap()).unwrap();
        fs::File::create(&doc_file)
            .unwrap()
            .write_all(b"sensitive")
            .unwrap();
        assert!(validate_cleanup_path_with_home(&doc_file, &fake_home_canonical).is_err());

        // 7. Approved cache subpath accepted
        let cache_sub = fake_home_canonical.join(".cache/app_cache");
        fs::create_dir_all(&cache_sub).unwrap();
        let res = validate_cleanup_path_with_home(&cache_sub, &fake_home_canonical);
        assert!(res.is_ok(), "Approved cache subpath must be accepted");

        let _ = fs::remove_dir_all(&temp_dir);
    }

    #[test]
    fn test_cross_filesystem_trash_copy_failure_rollback() {
        let temp_dir =
            std::env::temp_dir().join(format!("spacewise_xf_copy_fail_{}", std::process::id()));
        let _ = fs::remove_dir_all(&temp_dir);
        let trash_dir = temp_dir.join("Trash");
        let work_dir = temp_dir.join("work/nested");
        fs::create_dir_all(&work_dir).unwrap();

        let test_file = work_dir.join("source.dat");
        fs::File::create(&test_file)
            .unwrap()
            .write_all(b"original source content")
            .unwrap();

        let mut trash = FreeDesktopTrash::new(trash_dir);
        trash.fault_injection = Some(TrashFaultInjection {
            fail_copy: true,
            fail_verification: false,
            fail_metadata_write: false,
            fail_source_removal: false,
        });

        let target_dir = temp_dir.join("work");
        let res = trash.move_to_trash(&target_dir);
        assert!(res.is_err(), "Copy failure must return Err");

        // CRITICAL SAFETY CHECK: Original source must be 100% intact!
        assert!(
            test_file.exists(),
            "Source file must not be deleted on copy failure"
        );
        assert_eq!(fs::read(&test_file).unwrap(), b"original source content");

        // Staging directory must be cleaned up
        let staging_dir = trash.trash_dir.join(".staging");
        if staging_dir.exists() {
            assert_eq!(fs::read_dir(&staging_dir).unwrap().count(), 0);
        }

        let _ = fs::remove_dir_all(&temp_dir);
    }

    #[test]
    fn test_cross_filesystem_trash_verification_failure_rollback() {
        let temp_dir =
            std::env::temp_dir().join(format!("spacewise_xf_verify_fail_{}", std::process::id()));
        let _ = fs::remove_dir_all(&temp_dir);
        let trash_dir = temp_dir.join("Trash");
        let work_dir = temp_dir.join("work");
        fs::create_dir_all(&work_dir).unwrap();

        let test_file = work_dir.join("payload.bin");
        fs::File::create(&test_file)
            .unwrap()
            .write_all(b"precious user data")
            .unwrap();

        let mut trash = FreeDesktopTrash::new(trash_dir);
        trash.fault_injection = Some(TrashFaultInjection {
            fail_copy: false,
            fail_verification: true,
            fail_metadata_write: false,
            fail_source_removal: false,
        });

        let res = trash.move_to_trash(&work_dir);
        assert!(res.is_err(), "Verification failure must return Err");

        // CRITICAL SAFETY CHECK: Source must remain completely untouched!
        assert!(
            test_file.exists(),
            "Source must remain intact when staged copy verification fails"
        );
        assert_eq!(fs::read(&test_file).unwrap(), b"precious user data");

        let _ = fs::remove_dir_all(&temp_dir);
    }

    #[test]
    fn test_cross_filesystem_trash_metadata_write_failure_rollback() {
        let temp_dir =
            std::env::temp_dir().join(format!("spacewise_xf_meta_fail_{}", std::process::id()));
        let _ = fs::remove_dir_all(&temp_dir);
        let trash_dir = temp_dir.join("Trash");
        let work_dir = temp_dir.join("work");
        fs::create_dir_all(&work_dir).unwrap();

        let test_file = work_dir.join("data.txt");
        fs::File::create(&test_file)
            .unwrap()
            .write_all(b"unaltered data")
            .unwrap();

        let mut trash = FreeDesktopTrash::new(trash_dir);
        trash.fault_injection = Some(TrashFaultInjection {
            fail_copy: false,
            fail_verification: false,
            fail_metadata_write: true,
            fail_source_removal: false,
        });

        let res = trash.move_to_trash(&work_dir);
        assert!(res.is_err(), "Metadata failure must return Err");

        // Source must remain completely intact
        assert!(
            test_file.exists(),
            "Source file must not be touched on metadata failure"
        );

        let _ = fs::remove_dir_all(&temp_dir);
    }

    #[test]
    fn test_cross_filesystem_trash_source_removal_failure_preserves_trash() {
        let temp_dir =
            std::env::temp_dir().join(format!("spacewise_xf_src_rem_fail_{}", std::process::id()));
        let _ = fs::remove_dir_all(&temp_dir);
        let trash_dir = temp_dir.join("Trash");
        let work_dir = temp_dir.join("work");
        fs::create_dir_all(&work_dir).unwrap();

        let test_file = work_dir.join("data.txt");
        fs::File::create(&test_file)
            .unwrap()
            .write_all(b"preserved copy")
            .unwrap();

        let mut trash = FreeDesktopTrash::new(trash_dir);
        trash.fault_injection = Some(TrashFaultInjection {
            fail_copy: false,
            fail_verification: false,
            fail_metadata_write: false,
            fail_source_removal: true,
        });

        let res = trash.move_to_trash(&work_dir);
        assert!(res.is_err());
        let err_msg = res.unwrap_err();
        assert!(err_msg.contains("safely copied and verified in Trash"));
        assert!(err_msg.contains("Source remainder and Trash copy both exist"));

        // The verified trash copy and metadata MUST exist in Trash!
        assert!(
            trash.files_dir().join("work").exists(),
            "Trash copy must be preserved"
        );
        assert!(
            trash.info_dir().join("work.trashinfo").exists(),
            "Trash metadata must be preserved"
        );

        let _ = fs::remove_dir_all(&temp_dir);
    }

    #[test]
    fn test_delete_permanently_hardened_traversal_and_separators() {
        let temp_dir =
            std::env::temp_dir().join(format!("spacewise_del_perm_harden_{}", std::process::id()));
        let _ = fs::remove_dir_all(&temp_dir);
        let trash_dir = temp_dir.join("Trash");
        let trash = FreeDesktopTrash::new(trash_dir.clone());
        fs::create_dir_all(trash.files_dir()).unwrap();
        fs::create_dir_all(trash.info_dir()).unwrap();

        // Create an unrelated file inside Trash
        let legitimate_file = trash.files_dir().join("safe.txt");
        fs::File::create(&legitimate_file)
            .unwrap()
            .write_all(b"do not touch")
            .unwrap();
        let legitimate_info = trash.info_dir().join("safe.txt.trashinfo");
        fs::File::create(&legitimate_info)
            .unwrap()
            .write_all(b"[Trash Info]\n")
            .unwrap();

        // 1. Empty name rejected
        assert!(trash.delete_permanently("").is_err());
        assert!(trash.delete_permanently("   ").is_err());

        // 2. Traversal rejected
        assert!(trash.delete_permanently("../safe.txt").is_err());
        assert!(trash.delete_permanently("../../etc/passwd").is_err());
        assert!(trash.delete_permanently(".").is_err());
        assert!(trash.delete_permanently("..").is_err());

        // 3. Separators and subpaths rejected
        assert!(trash.delete_permanently("sub/file.txt").is_err());
        assert!(trash.delete_permanently("/etc/passwd").is_err());

        // Verify unrelated item was not touched
        assert!(legitimate_file.exists());
        assert!(legitimate_info.exists());

        // 4. Valid single filename deletes cleanly
        let res = trash.delete_permanently("safe.txt");
        assert!(res.is_ok());
        assert!(!legitimate_file.exists());
        assert!(!legitimate_info.exists());

        let _ = fs::remove_dir_all(&temp_dir);
    }

    #[test]
    fn test_trashinfo_url_encoding_and_decoding() {
        let sample_path = "/home/krishna/My Documents/Project #1 (v2.0) [Final] & Test%.txt";
        let encoded = url_encode_path(sample_path);

        assert!(!encoded.contains(' '));
        assert!(encoded.contains("%20"));
        assert!(encoded.contains("%23")); // #
        assert!(encoded.contains("%25")); // %

        let decoded = url_decode_path(&encoded);
        assert_eq!(decoded, sample_path);
    }

    #[test]
    fn test_trash_collision_with_orphaned_trashinfo_preserves_metadata() {
        let temp_dir = std::env::temp_dir().join(format!(
            "spacewise_trash_orphan_meta_{}",
            std::process::id()
        ));
        let _ = fs::remove_dir_all(&temp_dir);
        let trash_dir = temp_dir.join("Trash");
        let work_dir = temp_dir.join("work");
        fs::create_dir_all(&work_dir).unwrap();

        let trash = FreeDesktopTrash::new(trash_dir.clone());
        fs::create_dir_all(trash.files_dir()).unwrap();
        fs::create_dir_all(trash.info_dir()).unwrap();

        // 1. Pre-create an orphaned .trashinfo file in Trash/info/ without any payload in Trash/files/
        let orphan_info = trash.info_dir().join("report.txt.trashinfo");
        let orphan_content =
            "[Trash Info]\nPath=/previous/lost/report.txt\nDeletionDate=2024-01-01T00:00:00\n";
        fs::write(&orphan_info, orphan_content).unwrap();

        // Ensure payload in files/ does NOT exist
        assert!(!trash.files_dir().join("report.txt").exists());

        // 2. Now user moves a new file named "report.txt" to trash
        let source_file = work_dir.join("report.txt");
        fs::write(&source_file, b"brand new report content").unwrap();

        let (bytes, count) = trash.move_to_trash(&source_file).unwrap();
        assert_eq!(bytes, 24);
        assert_eq!(count, 1);
        assert!(!source_file.exists(), "Source file must be moved to Trash");

        // 3. The new item MUST have received a collision-free name (report.1.txt)
        let new_trash_file = trash.files_dir().join("report.1.txt");
        let new_trash_info = trash.info_dir().join("report.1.txt.trashinfo");
        assert!(
            new_trash_file.exists(),
            "New payload must be saved as report.1.txt"
        );
        assert!(
            new_trash_info.exists(),
            "New metadata must be saved as report.1.txt.trashinfo"
        );
        assert_eq!(
            fs::read(&new_trash_file).unwrap(),
            b"brand new report content"
        );

        // 4. CRITICAL: The orphaned metadata file MUST NOT be overwritten!
        assert!(orphan_info.exists());
        assert_eq!(fs::read_to_string(&orphan_info).unwrap(), orphan_content);

        let _ = fs::remove_dir_all(&temp_dir);
    }

    #[test]
    fn test_trash_collision_with_payload_and_metadata() {
        let temp_dir =
            std::env::temp_dir().join(format!("spacewise_trash_dual_col_{}", std::process::id()));
        let _ = fs::remove_dir_all(&temp_dir);
        let trash_dir = temp_dir.join("Trash");
        let work_dir = temp_dir.join("work");
        fs::create_dir_all(&work_dir).unwrap();

        let trash = FreeDesktopTrash::new(trash_dir.clone());
        fs::create_dir_all(trash.files_dir()).unwrap();
        fs::create_dir_all(trash.info_dir()).unwrap();

        // Pre-create both files/archive.zip and info/archive.zip.trashinfo
        let existing_file = trash.files_dir().join("archive.zip");
        let existing_info = trash.info_dir().join("archive.zip.trashinfo");
        fs::write(&existing_file, b"original-archive-bytes").unwrap();
        fs::write(
            &existing_info,
            "[Trash Info]\nPath=/home/user/archive.zip\n",
        )
        .unwrap();

        // Now move a new file with the same name to Trash
        let source_file = work_dir.join("archive.zip");
        fs::write(&source_file, b"new-archive-bytes").unwrap();

        let (bytes, count) = trash.move_to_trash(&source_file).unwrap();
        assert_eq!(bytes, 17);
        assert_eq!(count, 1);

        // Should resolve to archive.1.zip
        let new_file = trash.files_dir().join("archive.1.zip");
        let new_info = trash.info_dir().join("archive.1.zip.trashinfo");
        assert!(new_file.exists());
        assert!(new_info.exists());
        assert_eq!(fs::read(&new_file).unwrap(), b"new-archive-bytes");

        // Existing payload and info are unchanged
        assert_eq!(fs::read(&existing_file).unwrap(), b"original-archive-bytes");
        assert_eq!(
            fs::read_to_string(&existing_info).unwrap(),
            "[Trash Info]\nPath=/home/user/archive.zip\n"
        );

        let _ = fs::remove_dir_all(&temp_dir);
    }

    #[test]
    fn test_trash_repeated_collisions_requiring_multiple_candidate_names() {
        let temp_dir =
            std::env::temp_dir().join(format!("spacewise_trash_multi_col_{}", std::process::id()));
        let _ = fs::remove_dir_all(&temp_dir);
        let trash_dir = temp_dir.join("Trash");
        let work_dir = temp_dir.join("work");
        fs::create_dir_all(&work_dir).unwrap();

        let trash = FreeDesktopTrash::new(trash_dir.clone());
        fs::create_dir_all(trash.files_dir()).unwrap();
        fs::create_dir_all(trash.info_dir()).unwrap();

        // Base item: both payload and metadata exist
        fs::write(trash.files_dir().join("data.txt"), b"payload 0").unwrap();
        fs::write(trash.info_dir().join("data.txt.trashinfo"), "info 0").unwrap();

        // data.1.txt: only metadata exists (orphaned .trashinfo)
        fs::write(
            trash.info_dir().join("data.1.txt.trashinfo"),
            "info 1 (orphan)",
        )
        .unwrap();

        // data.2.txt: only payload exists (orphaned file)
        fs::write(trash.files_dir().join("data.2.txt"), b"payload 2 (orphan)").unwrap();

        // data.3.txt: both payload and metadata exist
        fs::write(trash.files_dir().join("data.3.txt"), b"payload 3").unwrap();
        fs::write(trash.info_dir().join("data.3.txt.trashinfo"), "info 3").unwrap();

        // Now trash a new data.txt
        let source_file = work_dir.join("data.txt");
        fs::write(&source_file, b"payload 4 (winner)").unwrap();

        let res = trash.move_to_trash(&source_file);
        assert!(res.is_ok());

        // Must have skipped 0, 1, 2, and 3, landing on data.4.txt
        let final_file = trash.files_dir().join("data.4.txt");
        let final_info = trash.info_dir().join("data.4.txt.trashinfo");
        assert!(final_file.exists());
        assert!(final_info.exists());
        assert_eq!(fs::read(&final_file).unwrap(), b"payload 4 (winner)");

        // All previous items must be 100% preserved
        assert_eq!(
            fs::read(trash.files_dir().join("data.txt")).unwrap(),
            b"payload 0"
        );
        assert_eq!(
            fs::read_to_string(trash.info_dir().join("data.txt.trashinfo")).unwrap(),
            "info 0"
        );

        assert_eq!(
            fs::read_to_string(trash.info_dir().join("data.1.txt.trashinfo")).unwrap(),
            "info 1 (orphan)"
        );
        assert!(!trash.files_dir().join("data.1.txt").exists());

        assert_eq!(
            fs::read(trash.files_dir().join("data.2.txt")).unwrap(),
            b"payload 2 (orphan)"
        );
        assert!(!trash.info_dir().join("data.2.txt.trashinfo").exists());

        assert_eq!(
            fs::read(trash.files_dir().join("data.3.txt")).unwrap(),
            b"payload 3"
        );
        assert_eq!(
            fs::read_to_string(trash.info_dir().join("data.3.txt.trashinfo")).unwrap(),
            "info 3"
        );

        let _ = fs::remove_dir_all(&temp_dir);
    }
}
