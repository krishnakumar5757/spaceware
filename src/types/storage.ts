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

export type AppScanState =
  | "initializing"
  | "ready"
  | "scanning"
  | "completed"
  | "completed_with_errors"
  | "failed"
  | "no_filesystem";

export interface StorageSummary {
  driveName: string;
  mountPoint: string;
  filesystem: string;
  totalBytes: number;
  usedBytes: number;
  freeBytes: number;
  availableBytes?: number;
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
  category: "cache" | "developer" | "logs" | "trash" | "package_cache" | "old_files" | string;
  description: string;
  reclaimableBytes: number;
  fileCount: number;
  riskLevel: "safe" | "caution" | "manual_review" | string;
  path: string;
  checked?: boolean;
  reason?: string;
  actionType?: "trash" | "permanent_delete" | "manual_instruction" | string;
  manualCommand?: string;
}

export interface CleanupActionRequest {
  candidateIds: string[];
  action: "trash" | "permanent_delete";
}

export interface CleanupItemResult {
  id: string;
  path: string;
  success: boolean;
  bytesFreed: number;
  filesRemoved: number;
  error?: string;
}

export interface CleanupExecutionSummary {
  totalBytesFreed: number;
  totalFilesRemoved: number;
  itemResults: CleanupItemResult[];
  successCount: number;
  failureCount: number;
}

export interface ScanStatus {
  isScanning: boolean;
  progressPercent: number;
  currentPath: string;
  filesScannedCount: number;
  lastCompleted: string;
  isLiveData?: boolean;
  state?: AppScanState;
  errorMessage?: string | null;
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

export interface ExplorerItem {
  id: string;
  name: string;
  path: string;
  sizeBytes: number;
  isDir: boolean;
  isSymlink: boolean;
  symlinkTarget?: string | null;
  extension: string;
  fileType: string;
  category: string;
  lastModified: string;
  lastModifiedEpoch: number;
  isHidden: boolean;
  isReadonly: boolean;
}

export interface DirectoryListingResult {
  currentPath: string;
  parentPath?: string | null;
  canonicalPath: string;
  items: ExplorerItem[];
  totalCount: number;
  totalDirs: number;
  totalFiles: number;
  totalBytes: number;
  isReadable: boolean;
  errorMessage?: string | null;
  page: number;
  pageSize: number;
  totalPages: number;
  hasMore: boolean;
}

export interface SelectiveCleanupTargetPreview {
  path: string;
  name: string;
  isDir: boolean;
  isSymlink: boolean;
  sizeBytes: number;
  fileCount: number;
  isEligible: boolean;
  ineligibilityReason?: string | null;
  warning?: string | null;
}

export interface SelectiveCleanupPreview {
  targets: SelectiveCleanupTargetPreview[];
  totalEligibleBytes: number;
  totalEligibleFiles: number;
  totalTargets: number;
  eligibleCount: number;
  ineligibleCount: number;
  recommendedAction: string;
}

export interface SelectiveCleanupRequest {
  paths: string[];
  action: "trash" | "permanent_delete";
}
