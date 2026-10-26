export type NavigationTab = "overview" | "analyze" | "cleanup" | "settings";

export interface MountedFilesystem {
  device: string;
  mountPoint: string;
  fsType: string;
  totalBytes: number;
  usedBytes: number;
  freeBytes: number;
  availableBytes: number;
}

export interface StorageSummary {
  driveName: string;
  mountPoint: string;
  filesystem: string;
  totalBytes: number;
  usedBytes: number;
  freeBytes: number;
  reclaimableBytes: number;
  lastScanned: string;
  isLiveData?: boolean;
}

export interface StorageCategory {
  id: string;
  name: string;
  sizeBytes: number;
  fileCount: number;
  color: string;
  iconName: string;
  description: string;
  percentageOfUsed: number;
}

export interface FileItem {
  id: string;
  name: string;
  path: string;
  sizeBytes: number;
  category: string;
  extension: string;
  lastModified: string;
  lastAccessed: string;
  isLocked?: boolean;
}

export interface CleanupRecommendation {
  id: string;
  title: string;
  category: "cache" | "developer" | "logs" | "trash" | "old_files" | string;
  description: string;
  reclaimableBytes: number;
  fileCount: number;
  riskLevel: "safe" | "caution" | "manual_review" | string;
  path: string;
  checked?: boolean;
}

export interface ScanStatus {
  isScanning: boolean;
  progressPercent: number;
  currentPath: string;
  filesScannedCount: number;
  lastCompleted: string;
  isLiveData?: boolean;
}

export interface DirectoryNode {
  id: string;
  name: string;
  path: string;
  sizeBytes: number;
  type: "folder" | "file";
  fileCount?: number;
  category?: string;
  children?: DirectoryNode[];
}

export interface ScanOptions {
  path: string;
  maxTreeDepth?: number;
  excludePaths: string[];
  sameFilesystem: boolean;
  largeFileThresholdMb?: number;
}

export interface ScanProgress {
  isScanning: boolean;
  progressPercent: number;
  currentPath: string;
  filesScannedCount: number;
  bytesScanned: number;
}

export interface ScanResult {
  rootPath: string;
  summary: StorageSummary;
  categories: StorageCategory[];
  largestFiles: FileItem[];
  recommendations: CleanupRecommendation[];
  directoryTree: DirectoryNode;
  totalFilesScanned: number;
  totalDirsScanned: number;
  totalBytesScanned: number;
  permissionDeniedCount: number;
  permissionDeniedPaths: string[];
  scanDurationMs: number;
  isLiveData: boolean;
}
