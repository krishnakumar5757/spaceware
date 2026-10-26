import { invoke } from "@tauri-apps/api/core";
import { listen, UnlistenFn } from "@tauri-apps/api/event";
import {
  CleanupExecutionSummary,
  CleanupRecommendation,
  MountedFilesystem,
  ScanOptions,
  ScanProgress,
  ScanResult,
  StorageSummary,
} from "../types/storage";
import {
  mockStorageSummary,
  mockCategories,
  mockLargestFiles,
  mockRecommendations,
  mockDirectoryTree,
} from "../mock/storageData";

/**
 * Checks whether the application is running inside a Tauri desktop webview.
 */
export function isTauriEnvironment(): boolean {
  return typeof window !== "undefined" && Boolean((window as unknown as { __TAURI_INTERNALS__?: unknown }).__TAURI_INTERNALS__);
}

/**
 * Fetch physical/storage mounted filesystems from the Linux backend.
 */
export async function getMountedFilesystems(): Promise<MountedFilesystem[]> {
  if (!isTauriEnvironment()) {
    throw new Error("Desktop backend unavailable: Tauri environment not detected.");
  }

  try {
    return await invoke<MountedFilesystem[]>("get_mounts");
  } catch (err) {
    console.error("Failed to invoke get_mounts:", err);
    throw err;
  }
}

/**
 * Retrieve exact filesystem capacity summary for a given path.
 * Never falls back to hardcoded mock data.
 */
export async function getStorageSummary(path?: string): Promise<StorageSummary> {
  if (!isTauriEnvironment()) {
    throw new Error("Desktop backend unavailable: Tauri environment not detected.");
  }

  try {
    return await invoke<StorageSummary>("get_storage_summary", { path });
  } catch (err) {
    console.error("Failed to invoke get_storage_summary:", err);
    throw err;
  }
}

/**
 * Initiate real asynchronous directory scan in Rust backend.
 */
export async function startDirectoryScan(options?: ScanOptions): Promise<ScanResult> {
  if (!isTauriEnvironment()) {
    throw new Error("Native filesystem crawler requires Tauri desktop environment.");
  }

  return await invoke<ScanResult>("start_scan", { options });
}

/**
 * Cancel an ongoing background scan in the Rust worker.
 */
export async function cancelDirectoryScan(): Promise<boolean> {
  if (!isTauriEnvironment()) {
    return true;
  }
  return await invoke<boolean>("cancel_scan");
}

/**
 * Check if the Rust scanner is actively running.
 */
export async function checkIsScanning(): Promise<boolean> {
  if (!isTauriEnvironment()) {
    return false;
  }
  return await invoke<boolean>("get_scan_status");
}

/**
 * Subscribe to scan-progress events emitted by the Rust scanner.
 */
export async function subscribeScanProgress(
  onProgress: (progress: ScanProgress) => void
): Promise<UnlistenFn> {
  if (!isTauriEnvironment()) {
    return () => {};
  }

  return await listen<ScanProgress>("scan-progress", (event) => {
    onProgress(event.payload);
  });
}

/**
 * Retrieve discovered real cleanup candidates from Linux filesystem.
 */
export async function getCleanupCandidates(): Promise<CleanupRecommendation[]> {
  if (!isTauriEnvironment()) {
    return [];
  }

  try {
    return await invoke<CleanupRecommendation[]>("get_cleanup_candidates");
  } catch (err) {
    console.error("Failed to invoke get_cleanup_candidates:", err);
    throw err;
  }
}

/**
 * Execute validated cleanup (Move to Trash or Permanent Deletion).
 */
export async function executeCleanup(
  candidateIds: string[],
  action: "trash" | "permanent_delete" = "trash"
): Promise<CleanupExecutionSummary> {
  if (!isTauriEnvironment()) {
    throw new Error("Cleanup execution requires Tauri desktop environment.");
  }

  return await invoke<CleanupExecutionSummary>("execute_cleanup", {
    request: {
      candidateIds,
      action,
    },
  });
}

/**
 * Retrieve user's home directory.
 */
export async function getHomeDirectory(): Promise<string> {
  if (!isTauriEnvironment()) {
    return "/home/user";
  }
  return await invoke<string>("get_home_directory");
}

/**
 * List contents of directory safely with pagination, sorting, and symlink protection.
 */
export async function listDirectory(
  path?: string,
  page: number = 1,
  pageSize: number = 500,
  showHidden: boolean = false
): Promise<import("../types/storage").DirectoryListingResult> {
  if (!isTauriEnvironment()) {
    throw new Error("Native filesystem explorer requires Tauri desktop environment.");
  }

  return await invoke<import("../types/storage").DirectoryListingResult>("list_directory", {
    path: path || null,
    page,
    pageSize,
    showHidden,
  });
}

/**
 * Scan specific selected targets (files or directories).
 */
export async function scanTargets(targets: string[]): Promise<ScanResult> {
  if (!isTauriEnvironment()) {
    throw new Error("Native filesystem crawler requires Tauri desktop environment.");
  }

  return await invoke<ScanResult>("scan_targets", { targets });
}

/**
 * Reveal a file or directory in the system's native desktop file manager.
 */
export async function revealInFileManager(path: string): Promise<void> {
  if (!isTauriEnvironment()) {
    console.info("Reveal in file manager simulated for:", path);
    return;
  }

  return await invoke<void>("reveal_in_file_manager", { path });
}

/**
 * Preview selective cleanup for a set of target paths.
 */
export async function previewSelectiveCleanup(
  paths: string[]
): Promise<import("../types/storage").SelectiveCleanupPreview> {
  if (!isTauriEnvironment()) {
    throw new Error("Cleanup preview requires Tauri desktop environment.");
  }

  return await invoke<import("../types/storage").SelectiveCleanupPreview>("preview_selective_cleanup", {
    paths,
  });
}

/**
 * Execute selective cleanup on specific user-chosen targets.
 */
export async function executeSelectiveCleanup(
  paths: string[],
  action: "trash" | "permanent_delete" = "trash"
): Promise<CleanupExecutionSummary> {
  if (!isTauriEnvironment()) {
    throw new Error("Cleanup execution requires Tauri desktop environment.");
  }

  return await invoke<CleanupExecutionSummary>("execute_selective_cleanup", {
    request: {
      paths,
      action,
    },
  });
}

/**
 * Explicit opt-in development fixture loader.
 * Kept strictly for preview or testing, never called automatically on startup.
 */
export function loadDemoFixtures() {
  return {
    summary: { ...mockStorageSummary, isLiveData: false },
    categories: mockCategories,
    largestFiles: mockLargestFiles,
    recommendations: mockRecommendations,
    directoryTree: mockDirectoryTree,
  };
}
