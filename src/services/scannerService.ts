import { invoke } from "@tauri-apps/api/core";
import { listen, UnlistenFn } from "@tauri-apps/api/event";
import {
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
    return [
      {
        device: "/dev/nvme0n1p8",
        mountPoint: "/home",
        fsType: "btrfs",
        totalBytes: 1000 * 1024 * 1024 * 1024,
        usedBytes: 712.4 * 1024 * 1024 * 1024,
        freeBytes: 287.6 * 1024 * 1024 * 1024,
        availableBytes: 287.6 * 1024 * 1024 * 1024,
      },
      {
        device: "/dev/nvme0n1p2",
        mountPoint: "/",
        fsType: "ext4",
        totalBytes: 120 * 1024 * 1024 * 1024,
        usedBytes: 84.2 * 1024 * 1024 * 1024,
        freeBytes: 35.8 * 1024 * 1024 * 1024,
        availableBytes: 35.8 * 1024 * 1024 * 1024,
      },
    ];
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
 */
export async function getStorageSummary(path?: string): Promise<StorageSummary> {
  if (!isTauriEnvironment()) {
    return { ...mockStorageSummary, isLiveData: false };
  }

  try {
    return await invoke<StorageSummary>("get_storage_summary", { path });
  } catch (err) {
    console.warn("Failed to get real storage summary, falling back:", err);
    return { ...mockStorageSummary, isLiveData: false };
  }
}

/**
 * Initiate real asynchronous directory scan in Rust backend.
 */
export async function startDirectoryScan(options?: ScanOptions): Promise<ScanResult> {
  if (!isTauriEnvironment()) {
    // Simulated fallback result when tested outside desktop shell
    await new Promise((res) => setTimeout(res, 1800));
    return {
      rootPath: options?.path || "/home/krishna",
      summary: { ...mockStorageSummary, isLiveData: false },
      categories: mockCategories,
      largestFiles: mockLargestFiles,
      recommendations: mockRecommendations,
      directoryTree: mockDirectoryTree,
      totalFilesScanned: 682000,
      totalDirsScanned: 42000,
      totalBytesScanned: 712.4 * 1024 * 1024 * 1024,
      permissionDeniedCount: 0,
      permissionDeniedPaths: [],
      scanDurationMs: 1820,
      isLiveData: false,
    };
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
