import {
  StorageSummary,
  StorageCategory,
  FileItem,
  CleanupRecommendation,
  DirectoryNode,
} from "../types/storage";

// Storage Summary Mock Data for CachyOS / Linux Desktop
export const mockStorageSummary: StorageSummary = {
  driveName: "Samsung 990 PRO NVMe SSD",
  mountPoint: "/home",
  filesystem: "Btrfs (zstd)",
  totalBytes: 1000 * 1024 * 1024 * 1024, // 1000 GB (~931.3 GiB)
  usedBytes: 712.4 * 1024 * 1024 * 1024, // 712.4 GB
  freeBytes: 287.6 * 1024 * 1024 * 1024, // 287.6 GB
  reclaimableBytes: 52.8 * 1024 * 1024 * 1024, // 52.8 GB
  lastScanned: "Today, 14:15",
};

// Storage Categories with distinct harmonious colors
export const mockCategories: StorageCategory[] = [
  {
    id: "media",
    name: "Media & Videos",
    sizeBytes: 198.6 * 1024 * 1024 * 1024,
    fileCount: 3412,
    color: "#38BDF8", // Sky Blue
    iconName: "Film",
    description: "4K renders, DaVinci footage, lossless FLAC, raw photos",
    percentageOfUsed: 27.9,
  },
  {
    id: "apps",
    name: "Apps & Flatpaks",
    sizeBytes: 148.2 * 1024 * 1024 * 1024,
    fileCount: 42100,
    color: "#A78BFA", // Violet
    iconName: "Boxes",
    description: "Steam game binaries, Flatpak runtimes, Proton wine prefixes",
    percentageOfUsed: 20.8,
  },
  {
    id: "system",
    name: "System & Core",
    sizeBytes: 132.5 * 1024 * 1024 * 1024,
    fileCount: 184500,
    color: "#F472B6", // Rose
    iconName: "Cpu",
    description: "Kernel modules, pacman packages, /usr shared libs, root snapshot",
    percentageOfUsed: 18.6,
  },
  {
    id: "developer",
    name: "Developer & Builds",
    sizeBytes: 114.3 * 1024 * 1024 * 1024,
    fileCount: 524000,
    color: "#C7F36B", // Spacewise Lime Accent
    iconName: "Code2",
    description: "Rust target/ dirs, node_modules, Docker overlay2, Cargo cache",
    percentageOfUsed: 16.0,
  },
  {
    id: "documents",
    name: "Documents & Archives",
    sizeBytes: 72.8 * 1024 * 1024 * 1024,
    fileCount: 12450,
    color: "#FBBF24", // Amber
    iconName: "FileArchive",
    description: "Tar.zst backups, ISO images, datasets, PDF design specs",
    percentageOfUsed: 10.2,
  },
  {
    id: "other",
    name: "Other / Unsorted",
    sizeBytes: 46.0 * 1024 * 1024 * 1024,
    fileCount: 8930,
    color: "#94A3B8", // Slate
    iconName: "FolderMinus",
    description: "Browser sandbox caches, thumbnail db, temp runtime files",
    percentageOfUsed: 6.5,
  },
];

// Top Largest Files
export const mockLargestFiles: FileItem[] = [
  {
    id: "file-1",
    name: "archlinux-2026.10-cachyos-znver4.iso",
    path: "/home/krishna/Downloads/ISOs/archlinux-2026.10-cachyos-znver4.iso",
    sizeBytes: 34.2 * 1024 * 1024 * 1024,
    category: "Documents & Archives",
    extension: "iso",
    lastModified: "2026-10-18",
    lastAccessed: "2026-10-24",
  },
  {
    id: "file-2",
    name: "cyberpunk_2077_paks.vpk",
    path: "/home/krishna/.local/share/Steam/steamapps/common/Cyberpunk2077/archive/pc/content/cyberpunk_2077_paks.vpk",
    sizeBytes: 28.6 * 1024 * 1024 * 1024,
    category: "Apps & Flatpaks",
    extension: "vpk",
    lastModified: "2026-09-12",
    lastAccessed: "2026-10-25",
  },
  {
    id: "file-3",
    name: "spacewise_presentation_4k60.mov",
    path: "/home/krishna/Videos/Exports/spacewise_presentation_4k60.mov",
    sizeBytes: 21.8 * 1024 * 1024 * 1024,
    category: "Media & Videos",
    extension: "mov",
    lastModified: "2026-10-22",
    lastAccessed: "Yesterday",
  },
  {
    id: "file-4",
    name: "docker_storage_overlay2.raw",
    path: "/var/lib/docker/overlay2/data/docker_storage_overlay2.raw",
    sizeBytes: 16.5 * 1024 * 1024 * 1024,
    category: "Developer & Builds",
    extension: "raw",
    lastModified: "2026-10-14",
    lastAccessed: "3 days ago",
  },
  {
    id: "file-5",
    name: "spacewise-rust-target-cache.tar",
    path: "/home/krishna/project/spacewise/src-tauri/target/incremental_cache.tar",
    sizeBytes: 12.4 * 1024 * 1024 * 1024,
    category: "Developer & Builds",
    extension: "tar",
    lastModified: "2026-10-26",
    lastAccessed: "Today",
  },
  {
    id: "file-6",
    name: "cachyos_pacman_pkg_cache.tar.zst",
    path: "/var/cache/pacman/pkg/cachyos_pacman_pkg_cache.tar.zst",
    sizeBytes: 9.8 * 1024 * 1024 * 1024,
    category: "System & Core",
    extension: "zst",
    lastModified: "2026-10-05",
    lastAccessed: "1 week ago",
  },
  {
    id: "file-7",
    name: "ml_training_weights_v3.safetensors",
    path: "/home/krishna/models/vision/ml_training_weights_v3.safetensors",
    sizeBytes: 7.9 * 1024 * 1024 * 1024,
    category: "Developer & Builds",
    extension: "safetensors",
    lastModified: "2026-08-30",
    lastAccessed: "2 weeks ago",
  },
  {
    id: "file-8",
    name: "davinci_resolve_optimized_media.braw",
    path: "/home/krishna/Videos/DaVinci/CacheClip/optimized_media.braw",
    sizeBytes: 6.4 * 1024 * 1024 * 1024,
    category: "Media & Videos",
    extension: "braw",
    lastModified: "2026-10-02",
    lastAccessed: "3 weeks ago",
  },
];

// Cleanup Recommendations
export const mockRecommendations: CleanupRecommendation[] = [
  {
    id: "rec-1",
    title: "Pacman & Yay Package Cache",
    category: "cache",
    description: "Old uninstalled versions of packages stored in /var/cache/pacman/pkg.",
    reclaimableBytes: 14.8 * 1024 * 1024 * 1024,
    fileCount: 428,
    riskLevel: "safe",
    path: "/var/cache/pacman/pkg",
    checked: true,
  },
  {
    id: "rec-2",
    title: "Orphaned Rust & Node Build Artifacts",
    category: "developer",
    description: "Stale target/ and node_modules folders in inactive development directories.",
    reclaimableBytes: 19.3 * 1024 * 1024 * 1024,
    fileCount: 142300,
    riskLevel: "safe",
    path: "/home/krishna/dev/**/target",
    checked: true,
  },
  {
    id: "rec-3",
    title: "Systemd Journal Logs (>30 days)",
    category: "logs",
    description: "Compressed historic journald binary logs older than 30 days.",
    reclaimableBytes: 6.4 * 1024 * 1024 * 1024,
    fileCount: 64,
    riskLevel: "safe",
    path: "/var/log/journal",
    checked: true,
  },
  {
    id: "rec-4",
    title: "User Trash Bin",
    category: "trash",
    description: "Files currently stored in ~/.local/share/Trash awaiting permanent deletion.",
    reclaimableBytes: 7.2 * 1024 * 1024 * 1024,
    fileCount: 38,
    riskLevel: "caution",
    path: "~/.local/share/Trash",
    checked: false,
  },
  {
    id: "rec-5",
    title: "Browser Cache & GPU Shader Cache",
    category: "cache",
    description: "Chrome, Firefox, and Mesa/Nvidia shader caches that can be rebuilt on-demand.",
    reclaimableBytes: 5.1 * 1024 * 1024 * 1024,
    fileCount: 12600,
    riskLevel: "safe",
    path: "~/.cache/google-chrome & ~/.cache/mesa_shader_cache",
    checked: true,
  },
];

// Directory Tree hierarchy for the Analyze View
export const mockDirectoryTree: DirectoryNode = {
  id: "root-home",
  name: "/home/krishna",
  path: "/home/krishna",
  sizeBytes: 420.5 * 1024 * 1024 * 1024,
  type: "folder",
  fileCount: 682000,
  children: [
    {
      id: "dir-local",
      name: ".local",
      path: "/home/krishna/.local",
      sizeBytes: 154.2 * 1024 * 1024 * 1024,
      type: "folder",
      fileCount: 112000,
      children: [
        {
          id: "dir-steam",
          name: "share/Steam",
          path: "/home/krishna/.local/share/Steam",
          sizeBytes: 122.4 * 1024 * 1024 * 1024,
          type: "folder",
          fileCount: 48000,
        },
        {
          id: "dir-flatpak",
          name: "share/flatpak",
          path: "/home/krishna/.local/share/flatpak",
          sizeBytes: 24.6 * 1024 * 1024 * 1024,
          type: "folder",
          fileCount: 54000,
        },
        {
          id: "dir-trash",
          name: "share/Trash",
          path: "/home/krishna/.local/share/Trash",
          sizeBytes: 7.2 * 1024 * 1024 * 1024,
          type: "folder",
          fileCount: 38,
        },
      ],
    },
    {
      id: "dir-videos",
      name: "Videos",
      path: "/home/krishna/Videos",
      sizeBytes: 86.4 * 1024 * 1024 * 1024,
      type: "folder",
      fileCount: 840,
      children: [
        {
          id: "dir-exports",
          name: "Exports",
          path: "/home/krishna/Videos/Exports",
          sizeBytes: 52.8 * 1024 * 1024 * 1024,
          type: "folder",
          fileCount: 42,
        },
        {
          id: "dir-davinci",
          name: "DaVinci",
          path: "/home/krishna/Videos/DaVinci",
          sizeBytes: 33.6 * 1024 * 1024 * 1024,
          type: "folder",
          fileCount: 798,
        },
      ],
    },
    {
      id: "dir-project",
      name: "project",
      path: "/home/krishna/project",
      sizeBytes: 64.8 * 1024 * 1024 * 1024,
      type: "folder",
      fileCount: 345000,
      children: [
        {
          id: "dir-spacewise",
          name: "spacewise",
          path: "/home/krishna/project/spacewise",
          sizeBytes: 14.8 * 1024 * 1024 * 1024,
          type: "folder",
          fileCount: 46000,
        },
        {
          id: "dir-ml-core",
          name: "neural-engine",
          path: "/home/krishna/project/neural-engine",
          sizeBytes: 28.4 * 1024 * 1024 * 1024,
          type: "folder",
          fileCount: 168000,
        },
        {
          id: "dir-web-portal",
          name: "cloud-dashboard",
          path: "/home/krishna/project/cloud-dashboard",
          sizeBytes: 21.6 * 1024 * 1024 * 1024,
          type: "folder",
          fileCount: 131000,
        },
      ],
    },
    {
      id: "dir-downloads",
      name: "Downloads",
      path: "/home/krishna/Downloads",
      sizeBytes: 54.1 * 1024 * 1024 * 1024,
      type: "folder",
      fileCount: 320,
      children: [
        {
          id: "dir-isos",
          name: "ISOs",
          path: "/home/krishna/Downloads/ISOs",
          sizeBytes: 42.6 * 1024 * 1024 * 1024,
          type: "folder",
          fileCount: 6,
        },
        {
          id: "dir-archives",
          name: "Archives",
          path: "/home/krishna/Downloads/Archives",
          sizeBytes: 11.5 * 1024 * 1024 * 1024,
          type: "folder",
          fileCount: 44,
        },
      ],
    },
    {
      id: "dir-cache",
      name: ".cache",
      path: "/home/krishna/.cache",
      sizeBytes: 38.2 * 1024 * 1024 * 1024,
      type: "folder",
      fileCount: 184000,
      children: [
        {
          id: "dir-cargo-cache",
          name: "cargo",
          path: "/home/krishna/.cache/cargo",
          sizeBytes: 16.4 * 1024 * 1024 * 1024,
          type: "folder",
          fileCount: 45000,
        },
        {
          id: "dir-browser-cache",
          name: "google-chrome",
          path: "/home/krishna/.cache/google-chrome",
          sizeBytes: 4.8 * 1024 * 1024 * 1024,
          type: "folder",
          fileCount: 22000,
        },
        {
          id: "dir-mesa-cache",
          name: "mesa_shader_cache",
          path: "/home/krishna/.cache/mesa_shader_cache",
          sizeBytes: 3.2 * 1024 * 1024 * 1024,
          type: "folder",
          fileCount: 9400,
        },
      ],
    },
  ],
};

// Utilities for formatting
export function formatBytes(bytes: number, decimals = 1): string {
  if (bytes === 0) return "0 B";
  const k = 1024;
  const dm = decimals < 0 ? 0 : decimals;
  const sizes = ["B", "KB", "MB", "GB", "TB", "PB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(dm))} ${sizes[i]}`;
}

export function formatNumber(num: number): string {
  return new Intl.NumberFormat().format(num);
}
