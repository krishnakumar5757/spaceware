use std::fs;
use std::io::Read;
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

/// FreeDesktop.org Trash specification helper
pub struct FreeDesktopTrash {
    pub trash_dir: PathBuf,
}

impl FreeDesktopTrash {
    pub fn new(trash_dir: PathBuf) -> Self {
        Self { trash_dir }
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

        let (size_bytes, file_count) = if meta.is_dir() {
            compute_exact_dir_size(source_path)
        } else {
            (meta.len(), 1)
        };

        let files_dir = self.files_dir();
        let info_dir = self.info_dir();
        fs::create_dir_all(&files_dir)
            .map_err(|e| format!("Failed to create trash files directory: {}", e))?;
        fs::create_dir_all(&info_dir)
            .map_err(|e| format!("Failed to create trash info directory: {}", e))?;

        let orig_name = source_path
            .file_name()
            .and_then(|s| s.to_str())
            .ok_or_else(|| "Invalid source filename".to_string())?;

        // Resolve collision in Trash according to FreeDesktop spec: <name>.<n>
        let target_name = resolve_trash_collision(&files_dir, orig_name);
        let target_file_path = files_dir.join(&target_name);
        let target_info_path = info_dir.join(format!("{}.trashinfo", target_name));

        // Format ISO 8601 deletion timestamp
        let now_iso = format_iso8601_now();
        let abs_source = source_path
            .canonicalize()
            .unwrap_or_else(|_| source_path.to_path_buf());
        let abs_source_str = abs_source.to_string_lossy();

        let trashinfo_content = format!(
            "[Trash Info]\nPath={}\nDeletionDate={}\n",
            abs_source_str, now_iso
        );

        fs::write(&target_info_path, trashinfo_content)
            .map_err(|e| format!("Failed to write .trashinfo: {}", e))?;

        // Move the file or folder
        if let Err(rename_err) = fs::rename(source_path, &target_file_path) {
            // If cross-filesystem EXDEV error, copy recursively and remove original
            if rename_err.raw_os_error() == Some(libc::EXDEV) {
                if let Err(copy_err) = safe_copy_and_remove(source_path, &target_file_path) {
                    let _ = fs::remove_file(&target_info_path);
                    return Err(format!("Cross-device trash copy failed: {}", copy_err));
                }
            } else {
                let _ = fs::remove_file(&target_info_path);
                return Err(format!("Failed to move file to trash: {}", rename_err));
            }
        }

        Ok((size_bytes, file_count))
    }

    /// Permanently removes an item and its .trashinfo from Trash
    pub fn delete_permanently(&self, item_name: &str) -> Result<(u64, u64), String> {
        let files_path = self.files_dir().join(item_name);
        let info_path = self.info_dir().join(format!("{}.trashinfo", item_name));

        if !files_path.exists() && !info_path.exists() {
            return Err(format!("Trash item '{}' does not exist", item_name));
        }

        let mut freed_bytes: u64 = 0;
        let mut freed_files: u64 = 0;

        if files_path.exists() {
            let meta = fs::symlink_metadata(&files_path)
                .map_err(|e| format!("Failed to stat trash file: {}", e))?;

            if meta.is_dir() {
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

        if info_path.exists() {
            let _ = fs::remove_file(info_path);
        }

        Ok((freed_bytes, freed_files))
    }
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
            orig_path = rest.to_string();
        } else if let Some(rest) = trimmed.strip_prefix("DeletionDate=") {
            del_date = rest.to_string();
        }
    }

    (
        if orig_path.is_empty() { "Unknown".to_string() } else { orig_path },
        if del_date.is_empty() { "Unknown".to_string() } else { del_date },
    )
}

/// Resolve FreeDesktop trash naming collision: <base>.<n>.<ext>
fn resolve_trash_collision(files_dir: &Path, name: &str) -> String {
    let candidate = files_dir.join(name);
    if !candidate.exists() {
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
        if !files_dir.join(&candidate_name).exists() {
            return candidate_name;
        }
        counter += 1;
        if counter > 10000 {
            return format!("{}.{}", name, counter);
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

    let entries = fs::read_dir(dir).map_err(|e| format!("Failed to read directory {}: {}", dir.display(), e))?;

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

/// Safe copy and remove for cross-device moves without following symlinks
fn safe_copy_and_remove(src: &Path, dst: &Path) -> Result<(), String> {
    let meta = fs::symlink_metadata(src).map_err(|e| e.to_string())?;

    if meta.is_dir() {
        fs::create_dir_all(dst).map_err(|e| e.to_string())?;
        for entry in fs::read_dir(src).map_err(|e| e.to_string())?.flatten() {
            let sub_src = entry.path();
            let sub_dst = dst.join(entry.file_name());
            safe_copy_and_remove(&sub_src, &sub_dst)?;
        }
        fs::remove_dir(src).map_err(|e| e.to_string())?;
    } else if meta.file_type().is_symlink() {
        return Err("Will not copy symlinks across filesystems".to_string());
    } else {
        fs::copy(src, dst).map_err(|e| e.to_string())?;
        fs::remove_file(src).map_err(|e| e.to_string())?;
    }

    Ok(())
}

/// Validates that a path is safe for cleanup operations
pub fn validate_cleanup_path(path: &Path) -> Result<PathBuf, String> {
    let path_str = path.to_string_lossy();

    // Check path traversal
    if path_str.contains("..") {
        return Err("Path traversal (..) is strictly rejected".to_string());
    }

    // Check if the input path itself is a symlink before canonicalizing
    let orig_meta = fs::symlink_metadata(path)
        .map_err(|e| format!("Failed to read metadata for {}: {}", path.display(), e))?;

    if orig_meta.file_type().is_symlink() {
        return Err("Symbolic links cannot be target of cleanup".to_string());
    }

    let canonical = path
        .canonicalize()
        .map_err(|e| format!("Failed to canonicalize path {}: {}", path.display(), e))?;

    let canonical_str = canonical.to_string_lossy();

    // Reject root and protected system paths
    for &sys_path in PROTECTED_SYSTEM_PATHS {
        if canonical_str == sys_path {
            return Err(format!("Protected system root cannot be cleaned: {}", sys_path));
        }
    }

    let home = std::env::var("HOME").unwrap_or_default();
    if !home.is_empty() {
        let home_canonical = PathBuf::from(&home).canonicalize().unwrap_or_else(|_| PathBuf::from(&home));
        if canonical == home_canonical {
            return Err("User home root cannot be cleaned".to_string());
        }

        // Check protected user subpaths
        for &sub in PROTECTED_USER_SUBPATHS {
            let protected = home_canonical.join(sub);
            if canonical == protected || canonical.starts_with(&protected) {
                return Err(format!("Protected user configuration path cannot be cleaned: {}", sub));
            }
        }

        // Allow approved cleanup areas:
        // 1. ~/.cache/<subpath>
        // 2. ~/.local/share/Trash/<subpath>
        // 3. /tmp/<subpath> owned by user
        let cache_root = home_canonical.join(".cache");
        let trash_root = home_canonical.join(".local/share/Trash");
        let tmp_root = PathBuf::from("/tmp");

        if canonical == cache_root {
            return Err("Entire ~/.cache cannot be wiped directly; select specific subdirectories".to_string());
        }

        let is_in_cache = canonical.starts_with(&cache_root) && canonical != cache_root;
        let is_in_trash = canonical.starts_with(&trash_root);
        let is_in_tmp = canonical.starts_with(&tmp_root) && canonical != tmp_root;

        if !is_in_cache && !is_in_trash && !is_in_tmp {
            // Check if it's an approved project build target
            let file_name = canonical.file_name().and_then(|s| s.to_str()).unwrap_or("");
            let is_build_target = (file_name == "target" && canonical.join("CACHEDIR.TAG").exists())
                || file_name == ".pytest_cache"
                || file_name == ".turbo";

            if !is_build_target {
                return Err(format!("Path is outside permitted user cache, trash, and build boundaries: {}", canonical.display()));
            }
        }
    }

    // Verify not a symlink
    let meta = fs::symlink_metadata(&canonical)
        .map_err(|e| format!("Failed to read metadata for {}: {}", canonical.display(), e))?;

    if meta.file_type().is_symlink() {
        return Err("Symbolic links cannot be target of cleanup".to_string());
    }

    Ok(canonical)
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
                reason: Some(format!("Individual file discarded from {}", item.original_path)),
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
                    error: Some("Candidate ID was not found in active verified candidates list".to_string()),
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
        let (bytes_freed, files_removed, error) = if request.action == "trash" {
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
                    Err(e) => (0, 0, Some(format!("Failed to remove directory contents: {}", e))),
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
        let temp_dir = std::env::temp_dir().join(format!("spacewise_cleanup_symlink_{}", std::process::id()));
        let _ = fs::remove_dir_all(&temp_dir);
        fs::create_dir_all(&temp_dir).unwrap();

        let real_file = temp_dir.join("real.txt");
        fs::File::create(&real_file).unwrap().write_all(b"content").unwrap();

        let symlink = temp_dir.join("link_to_real");
        #[cfg(unix)]
        std::os::unix::fs::symlink(&real_file, &symlink).unwrap();

        let res = validate_cleanup_path(&symlink);
        assert!(res.is_err(), "Symlinks must be rejected for cleanup");

        let _ = fs::remove_dir_all(&temp_dir);
    }

    #[test]
    fn test_freedesktop_trash_create_and_metadata() {
        let temp_dir = std::env::temp_dir().join(format!("spacewise_trash_test_{}", std::process::id()));
        let _ = fs::remove_dir_all(&temp_dir);
        let trash_dir = temp_dir.join("Trash");
        let work_dir = temp_dir.join("work");
        fs::create_dir_all(&work_dir).unwrap();

        let trash = FreeDesktopTrash::new(trash_dir.clone());

        // Create a test file
        let file_path = work_dir.join("document.txt");
        fs::File::create(&file_path).unwrap().write_all(b"important data to trash").unwrap();

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
        fs::File::create(&file_path_2).unwrap().write_all(b"second document").unwrap();
        trash.move_to_trash(&file_path_2).unwrap();

        // Second should be document.1.txt
        assert!(trash.files_dir().join("document.1.txt").exists());
        assert!(trash.info_dir().join("document.1.txt.trashinfo").exists());

        let _ = fs::remove_dir_all(&temp_dir);
    }

    #[test]
    fn test_freedesktop_trash_permanent_delete() {
        let temp_dir = std::env::temp_dir().join(format!("spacewise_trash_del_test_{}", std::process::id()));
        let _ = fs::remove_dir_all(&temp_dir);
        let trash_dir = temp_dir.join("Trash");
        let work_dir = temp_dir.join("work");
        fs::create_dir_all(&work_dir).unwrap();

        let trash = FreeDesktopTrash::new(trash_dir.clone());

        let file_path = work_dir.join("garbage.bin");
        fs::File::create(&file_path).unwrap().write_all(&vec![b'X'; 500]).unwrap();
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
        let temp_dir = std::env::temp_dir().join(format!("spacewise_dir_del_test_{}", std::process::id()));
        let _ = fs::remove_dir_all(&temp_dir);
        let sub = temp_dir.join("cache/sub");
        fs::create_dir_all(&sub).unwrap();

        fs::File::create(temp_dir.join("cache/a.tmp")).unwrap().write_all(&vec![b'A'; 100]).unwrap();
        fs::File::create(sub.join("b.tmp")).unwrap().write_all(&vec![b'B'; 200]).unwrap();

        let (freed_bytes, freed_files) = remove_dir_contents_recursive(&temp_dir.join("cache")).unwrap();
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

        let temp_trash = std::env::temp_dir().join(format!("spacewise_test_trash_pac_{}", std::process::id()));
        let summary = execute_validated_cleanup(req, Some(&temp_trash)).unwrap();

        assert_eq!(summary.failure_count, 1);
        assert_eq!(summary.success_count, 0);
        assert!(summary.item_results[0].error.as_ref().unwrap().contains("prohibited for system safety"));
    }

    #[test]
    fn test_unknown_candidate_id_fails_gracefully() {
        let req = CleanupActionRequest {
            candidate_ids: vec!["arbitrary-id-not-in-discovered-list".to_string()],
            action: "trash".to_string(),
        };

        let temp_trash = std::env::temp_dir().join(format!("spacewise_test_trash_unk_{}", std::process::id()));
        let summary = execute_validated_cleanup(req, Some(&temp_trash)).unwrap();

        assert_eq!(summary.failure_count, 1);
        assert_eq!(summary.success_count, 0);
        assert!(summary.item_results[0].error.as_ref().unwrap().contains("was not found"));
    }

    #[test]
    fn test_cleanup_handles_changed_or_missing_file_before_execution() {
        let temp_dir = std::env::temp_dir().join(format!("spacewise_changed_file_test_{}", std::process::id()));
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

        let temp_dir = std::env::temp_dir().join(format!("spacewise_perm_cleanup_test_{}", std::process::id()));
        let _ = fs::remove_dir_all(&temp_dir);
        let target_dir = temp_dir.join("cache");
        fs::create_dir_all(&target_dir).unwrap();

        let normal_file = target_dir.join("normal.txt");
        fs::File::create(&normal_file).unwrap().write_all(b"data").unwrap();

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
}
