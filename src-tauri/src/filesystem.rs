use std::ffi::CString;
use std::fs::File;
use std::io::{BufRead, BufReader};
use std::path::Path;

use crate::models::{MountedFilesystem, StorageSummary};

/// Unescapes octal sequences (like `\040` for space) in `/proc/mounts`
pub fn unescape_octal_path(input: &str) -> String {
    let mut result = String::with_capacity(input.len());
    let mut chars = input.chars().peekable();

    while let Some(c) = chars.next() {
        if c == '\\' {
            let mut octal = String::new();
            for _ in 0..3 {
                if let Some(&next_c) = chars.peek() {
                    if next_c.is_digit(8) {
                        octal.push(chars.next().unwrap());
                    } else {
                        break;
                    }
                }
            }

            if octal.len() == 3 {
                if let Ok(byte) = u8::from_str_radix(&octal, 8) {
                    result.push(byte as char);
                    continue;
                }
            }
            result.push('\\');
            result.push_str(&octal);
        } else {
            result.push(c);
        }
    }

    result
}

/// Check if a filesystem type is a physical or user storage filesystem
pub fn is_physical_or_storage_fs(fs_type: &str, device: &str, mount_point: &str) -> bool {
    let ignored_fs_types = [
        "proc", "sysfs", "devpts", "securityfs", "cgroup", "cgroup2", "pstore", "bpf",
        "autofs", "mqueue", "hugetlbfs", "debugfs", "tracefs", "fusectl", "configfs",
        "ramfs", "devtmpfs", "overlay", "nsfs", "efivarfs", "binfmt_misc",
    ];

    if ignored_fs_types.contains(&fs_type) {
        return false;
    }

    // Ignore kernel internal paths
    if mount_point.starts_with("/proc")
        || mount_point.starts_with("/sys")
        || mount_point.starts_with("/dev")
    {
        return false;
    }

    // Always include real block devices or network/fuse mounts
    if device.starts_with("/dev/") || device.starts_with("//") {
        return true;
    }

    // Common real storage fs types
    matches!(
        fs_type,
        "ext4"
            | "ext3"
            | "ext2"
            | "btrfs"
            | "xfs"
            | "zfs"
            | "f2fs"
            | "vfat"
            | "fat"
            | "msdos"
            | "exfat"
            | "ntfs"
            | "ntfs3"
            | "fuseblk"
            | "iso9660"
            | "nfs"
            | "nfs4"
            | "cifs"
            | "smbfs"
    )
}

/// Calls POSIX `statvfs` safely on a path
pub fn statvfs_path(path: &Path) -> Result<(u64, u64, u64, u64), String> {
    let path_str = path.to_str().ok_or_else(|| "Invalid UTF-8 in path".to_string())?;
    let path_cstr = CString::new(path_str).map_err(|e| format!("CString error: {}", e))?;

    unsafe {
        let mut stat: libc::statvfs = std::mem::zeroed();
        let res = libc::statvfs(path_cstr.as_ptr(), &mut stat);
        if res != 0 {
            let err = std::io::Error::last_os_error();
            return Err(format!("statvfs failed on {}: {}", path.display(), err));
        }

        let frsize = stat.f_frsize as u64;
        let total = stat.f_blocks as u64 * frsize;
        let free = stat.f_bfree as u64 * frsize;
        let avail = stat.f_bavail as u64 * frsize;
        let used = total.saturating_sub(free);

        Ok((total, used, free, avail))
    }
}

/// Reads `/proc/mounts` and retrieves all mounted filesystems with capacity stats
pub fn get_mounted_filesystems() -> Result<Vec<MountedFilesystem>, String> {
    let file = File::open("/proc/mounts").map_err(|e| format!("Failed to read /proc/mounts: {}", e))?;
    let reader = BufReader::new(file);

    let mut mounts = Vec::new();
    let mut seen_mount_points = std::collections::HashSet::new();

    for line_res in reader.lines() {
        let line = match line_res {
            Ok(l) => l,
            Err(_) => continue,
        };

        let parts: Vec<&str> = line.split_whitespace().collect();
        if parts.len() < 3 {
            continue;
        }

        let device = parts[0];
        let raw_mount_point = parts[1];
        let fs_type = parts[2];

        let mount_point = unescape_octal_path(raw_mount_point);

        if !is_physical_or_storage_fs(fs_type, device, &mount_point) {
            continue;
        }

        // Avoid duplicate entries if a subvolume is mounted multiple times
        if seen_mount_points.contains(&mount_point) {
            continue;
        }
        seen_mount_points.insert(mount_point.clone());

        let mount_path = Path::new(&mount_point);
        if let Ok((total, used, free, avail)) = statvfs_path(mount_path) {
            if total > 0 {
                mounts.push(MountedFilesystem {
                    device: device.to_string(),
                    mount_point,
                    fs_type: fs_type.to_string(),
                    total_bytes: total,
                    used_bytes: used,
                    free_bytes: free,
                    available_bytes: avail,
                });
            }
        }
    }

    // Sort by mount point length (root '/' first, then '/home', etc.)
    mounts.sort_by(|a, b| a.mount_point.cmp(&b.mount_point));

    Ok(mounts)
}

/// Find the mounted filesystem that best covers the given path
pub fn find_mount_for_path(target_path: &Path, mounts: &[MountedFilesystem]) -> Option<MountedFilesystem> {
    let target_canonical = target_path.canonicalize().unwrap_or_else(|_| target_path.to_path_buf());
    let target_str = target_canonical.to_str().unwrap_or("");

    let mut best_match: Option<&MountedFilesystem> = None;
    let mut best_len = 0;

    for m in mounts {
        if target_str == m.mount_point || target_str.starts_with(&format!("{}/", m.mount_point)) || m.mount_point == "/" {
            if m.mount_point.len() >= best_len {
                best_len = m.mount_point.len();
                best_match = Some(m);
            }
        }
    }

    best_match.cloned()
}

/// Retrieves exact StorageSummary for a specified path
pub fn get_storage_summary_for_path(path: &Path) -> Result<StorageSummary, String> {
    let mounts = get_mounted_filesystems().unwrap_or_default();
    let mount_info = find_mount_for_path(path, &mounts);

    let (total, used, free, avail) = statvfs_path(path)?;

    let (drive_name, mount_point, fs_type) = if let Some(m) = mount_info {
        (m.device, m.mount_point, m.fs_type)
    } else {
        (
            "Local Drive".to_string(),
            path.to_str().unwrap_or("/").to_string(),
            "POSIX".to_string(),
        )
    };

    let now = std::time::SystemTime::now();
    let time_str = format_system_time(now);

    Ok(StorageSummary {
        drive_name,
        mount_point,
        filesystem: fs_type,
        total_bytes: total,
        used_bytes: used,
        free_bytes: free,
        available_bytes: avail,
        reclaimable_bytes: 0, // Computed by scanner
        last_scanned: time_str,
        is_live_data: true,
    })
}

fn format_system_time(time: std::time::SystemTime) -> String {
    let datetime = match time.duration_since(std::time::UNIX_EPOCH) {
        Ok(dur) => {
            let secs = dur.as_secs();
            let hours = (secs / 3600) % 24;
            let mins = (secs / 60) % 60;
            format!("Today, {:02}:{:02}", hours, mins)
        }
        Err(_) => "Just now".to_string(),
    };
    datetime
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_unescape_octal_path() {
        assert_eq!(
            unescape_octal_path("/run/media/user/New\\040Volume"),
            "/run/media/user/New Volume"
        );
        assert_eq!(
            unescape_octal_path("/normal/path/without/escapes"),
            "/normal/path/without/escapes"
        );
        assert_eq!(
            unescape_octal_path("/path/with\\011tab"),
            "/path/with\ttab"
        );
    }

    #[test]
    fn test_statvfs_temp_dir() {
        let temp = std::env::temp_dir();
        let res = statvfs_path(&temp);
        assert!(res.is_ok(), "statvfs should succeed on temp dir");
        let (total, used, free, _) = res.unwrap();
        assert!(total > 0, "total storage must be > 0");
        assert!(free <= total, "free cannot exceed total");
        assert!(used <= total, "used cannot exceed total");
    }

    #[test]
    fn test_is_physical_fs_filtering() {
        assert!(is_physical_or_storage_fs("ext4", "/dev/sda1", "/"));
        assert!(is_physical_or_storage_fs("btrfs", "/dev/nvme0n1p2", "/home"));
        assert!(!is_physical_or_storage_fs("proc", "proc", "/proc"));
        assert!(!is_physical_or_storage_fs("sysfs", "sysfs", "/sys"));
        assert!(!is_physical_or_storage_fs("cgroup2", "cgroup2", "/sys/fs/cgroup"));
    }

    #[test]
    fn test_get_storage_summary_for_path() {
        let temp = std::env::temp_dir();
        let summary = get_storage_summary_for_path(&temp);
        assert!(summary.is_ok(), "storage summary should succeed for temp dir");
        let s = summary.unwrap();
        assert!(s.total_bytes > 0);
        assert!(s.available_bytes <= s.total_bytes);
        assert!(s.is_live_data);
    }
}
