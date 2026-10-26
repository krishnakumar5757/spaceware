import { useState, useRef, useEffect, useCallback } from "react";
import "./App.css";
import { Sidebar } from "./components/layout/Sidebar";
import { Header } from "./components/layout/Header";
import { OverviewView } from "./components/overview/OverviewView";
import { AnalyzeView } from "./components/analyze/AnalyzeView";
import { CleanupView } from "./components/cleanup/CleanupView";
import { SettingsView } from "./components/settings/SettingsView";
import { InspectModal } from "./components/common/InspectModal";
import {
  NavigationTab,
  StorageSummary,
  StorageCategory,
  FileItem,
  CleanupRecommendation,
  CleanupExecutionSummary,
  ScanStatus,
  DirectoryNode,
  AppScanState,
} from "./types/storage";
import {
  emptyStorageSummary,
  emptyDirectoryTree,
  formatBytes,
} from "./mock/storageData";
import {
  getStorageSummary,
  startDirectoryScan,
  cancelDirectoryScan,
  subscribeScanProgress,
  loadDemoFixtures,
} from "./services/scannerService";
import { CheckCircle2 } from "lucide-react";

export function App() {
  const [currentTab, setCurrentTab] = useState<NavigationTab>("overview");
  const [scanState, setScanState] = useState<AppScanState>("initializing");
  const [isDemoMode, setIsDemoMode] = useState<boolean>(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Initialize with empty baseline — real filesystem capacity is probed on mount
  const [summary, setSummary] = useState<StorageSummary>(emptyStorageSummary);
  const [categories, setCategories] = useState<StorageCategory[]>([]);
  const [largestFiles, setLargestFiles] = useState<FileItem[]>([]);
  const [recommendations, setRecommendations] = useState<CleanupRecommendation[]>([]);
  const [directoryTree, setDirectoryTree] = useState<DirectoryNode>(emptyDirectoryTree);

  const [scanResultDetails, setScanResultDetails] = useState<{
    totalFilesScanned: number;
    permissionDeniedCount: number;
    permissionDeniedPaths: string[];
    scanDurationMs: number;
  }>({
    totalFilesScanned: 0,
    permissionDeniedCount: 0,
    permissionDeniedPaths: [],
    scanDurationMs: 0,
  });

  const [inspectedFile, setInspectedFile] = useState<FileItem | null>(null);
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const [isSimulatedErrorActive, setIsSimulatedErrorActive] = useState<boolean>(false);

  const [scanStatus, setScanStatus] = useState<ScanStatus>({
    isScanning: false,
    progressPercent: 0,
    currentPath: "Detecting storage...",
    filesScannedCount: 0,
    lastCompleted: "Not scanned yet",
    isLiveData: false,
    state: "initializing",
    errorMessage: null,
  });

  const unlistenRef = useRef<(() => void) | null>(null);

  const showToast = (message: string) => {
    setToastMessage(message);
    setTimeout(() => {
      setToastMessage(null);
    }, 3500);
  };

  // Real Linux storage summary routine called on application startup
  const loadInitialStorage = useCallback(async () => {
    setScanState("initializing");
    setErrorMessage(null);
    setScanStatus((prev) => ({
      ...prev,
      isScanning: false,
      state: "initializing",
      currentPath: "Detecting storage volumes...",
    }));

    try {
      const realSummary = await getStorageSummary();
      // Populate storage cards from actual mounted filesystem statistics.
      // Reclaimable space is 0 / uncalculated until a scan is run.
      setSummary({
        ...realSummary,
        reclaimableBytes: 0,
        lastScanned: "Not scanned yet",
        isLiveData: true,
      });
      setScanState("ready");
      setScanStatus((prev) => ({
        ...prev,
        isScanning: false,
        currentPath: `Ready: ${realSummary.mountPoint}`,
        lastCompleted: "Not scanned yet",
        isLiveData: true,
        state: "ready",
        errorMessage: null,
      }));
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error("Failed to query native storage summary on startup:", msg);
      // Never substitute hardcoded demo values when a command fails
      setScanState("no_filesystem");
      setErrorMessage(msg);
      setScanStatus((prev) => ({
        ...prev,
        isScanning: false,
        currentPath: "Filesystem Error",
        isLiveData: false,
        state: "no_filesystem",
        errorMessage: msg,
      }));
    }
  }, []);

  useEffect(() => {
    loadInitialStorage();
  }, [loadInitialStorage]);

  // Explicit opt-in Demo Mode toggle for testing
  const handleToggleDemoMode = (enable: boolean) => {
    if (enable) {
      const fixture = loadDemoFixtures();
      setIsDemoMode(true);
      setSummary(fixture.summary);
      setCategories(fixture.categories);
      setLargestFiles(fixture.largestFiles);
      setRecommendations(fixture.recommendations);
      setDirectoryTree(fixture.directoryTree);
      setScanState("ready");
      setScanStatus({
        isScanning: false,
        progressPercent: 100,
        currentPath: "/home (Demo Preview)",
        filesScannedCount: 682000,
        lastCompleted: "Demo Fixture",
        isLiveData: false,
        state: "ready",
      });
      showToast("Demo Mode enabled: Hardcoded preview fixtures loaded.");
    } else {
      setIsDemoMode(false);
      setCategories([]);
      setLargestFiles([]);
      setRecommendations([]);
      setDirectoryTree(emptyDirectoryTree);
      loadInitialStorage();
      showToast("Demo Mode disabled: Switched to native Linux filesystem.");
    }
  };

  // Real Linux filesystem scanner routine with typed Tauri commands
  const handleTriggerScan = async () => {
    if (scanStatus.isScanning) return;

    if (isDemoMode) {
      setIsDemoMode(false);
    }

    setScanState("scanning");
    setErrorMessage(null);
    setScanStatus({
      isScanning: true,
      progressPercent: 1,
      currentPath: "Initializing native crawler...",
      filesScannedCount: 0,
      lastCompleted: scanStatus.lastCompleted,
      isLiveData: true,
      state: "scanning",
    });

    try {
      // Listen to progress updates emitted by the background Rust scanner
      const unlisten = await subscribeScanProgress((progress) => {
        setScanStatus((prev) => ({
          ...prev,
          isScanning: true,
          progressPercent: progress.progressPercent,
          currentPath: progress.currentPath,
          filesScannedCount: progress.filesScannedCount,
        }));
      });
      unlistenRef.current = unlisten;

      // Start asynchronous scan with safe non-root options:
      // Excludes virtual filesystems and version control trees, preserves filesystem boundaries, never follows symlinks
      const result = await startDirectoryScan({
        path: "", // Defaults to HOME inside Rust backend
        maxTreeDepth: 3,
        sameFilesystem: true,
        excludePaths: [".git", "proc", "sys", "dev"],
      });

      if (unlistenRef.current) {
        unlistenRef.current();
        unlistenRef.current = null;
      }

      // Populate dashboard with actual scanned measurements
      setSummary(result.summary);
      setCategories(result.categories);
      setLargestFiles(result.largestFiles);
      setRecommendations(result.recommendations);
      setDirectoryTree(result.directoryTree);
      setScanResultDetails({
        totalFilesScanned: result.totalFilesScanned,
        permissionDeniedCount: result.permissionDeniedCount,
        permissionDeniedPaths: result.permissionDeniedPaths,
        scanDurationMs: result.scanDurationMs,
      });

      const nextState: AppScanState =
        result.permissionDeniedCount > 0 ? "completed_with_errors" : "completed";
      setScanState(nextState);

      const now = new Date();
      const timeStr = `Today, ${now.getHours().toString().padStart(2, "0")}:${now
        .getMinutes()
        .toString()
        .padStart(2, "0")}`;

      setScanStatus({
        isScanning: false,
        progressPercent: 100,
        currentPath: "Complete",
        filesScannedCount: result.totalFilesScanned,
        lastCompleted: timeStr,
        isLiveData: true,
        state: nextState,
      });

      showToast(
        `Live scan complete! ${result.totalFilesScanned.toLocaleString()} files analyzed in ${(
          result.scanDurationMs / 1000
        ).toFixed(1)}s`
      );
    } catch (err: unknown) {
      if (unlistenRef.current) {
        unlistenRef.current();
        unlistenRef.current = null;
      }

      const errMsg = err instanceof Error ? err.message : String(err);
      if (errMsg.toLowerCase().includes("cancel")) {
        setScanState((prev) => (prev === "scanning" ? "ready" : prev));
        setScanStatus((prev) => ({
          ...prev,
          isScanning: false,
          currentPath: "Scan Cancelled",
        }));
        showToast("Storage scan cancelled by user.");
      } else {
        // Never substitute fake numbers on scan failure
        setScanState("failed");
        setErrorMessage(errMsg);
        setScanStatus((prev) => ({
          ...prev,
          isScanning: false,
          currentPath: "Scan Error",
          state: "failed",
          errorMessage: errMsg,
        }));
        showToast(`Scan failed: ${errMsg}`);
      }
    }
  };

  const handleCancelScan = async () => {
    if (!scanStatus.isScanning) return;
    try {
      await cancelDirectoryScan();
      showToast("Stopping scan...");
    } catch (err) {
      console.warn("Failed to invoke cancel_scan:", err);
    }
  };

  const handleInspectCategory = (_categoryId: string) => {
    setCurrentTab("analyze");
  };

  const handleReviewCleanup = (_recId?: string) => {
    setCurrentTab("cleanup");
  };

  const handleCleanupExecuted = (execSummary: CleanupExecutionSummary) => {
    if (execSummary.totalBytesFreed > 0) {
      setSummary((prev) => ({
        ...prev,
        usedBytes: Math.max(0, prev.usedBytes - execSummary.totalBytesFreed),
        freeBytes: prev.freeBytes + execSummary.totalBytesFreed,
        availableBytes: (prev.availableBytes ?? prev.freeBytes) + execSummary.totalBytesFreed,
        reclaimableBytes: Math.max(
          0,
          prev.reclaimableBytes - execSummary.totalBytesFreed
        ),
      }));

      const successfulIds = new Set(
        execSummary.itemResults.filter((r) => r.success).map((r) => r.id)
      );

      setRecommendations((prev) =>
        prev.filter((item) => !successfulIds.has(item.id))
      );

      showToast(
        `Reclaimed ${formatBytes(execSummary.totalBytesFreed, 1)} across ${execSummary.totalFilesRemoved} files!`
      );
    }
  };

  const hasCompletedScan =
    scanState === "completed" ||
    scanState === "completed_with_errors" ||
    (isDemoMode && categories.length > 0);

  return (
    <div className="app-container">
      {/* Fixed Left Sidebar */}
      <Sidebar
        currentTab={currentTab}
        onSelectTab={setCurrentTab}
        storageSummary={summary}
        isDemoMode={isDemoMode}
        hasCompletedScan={hasCompletedScan}
      />

      {/* Main Shell */}
      <div className="main-shell">
        {/* Top Header */}
        <Header
          currentTab={currentTab}
          scanStatus={scanStatus}
          isDemoMode={isDemoMode}
          onTriggerScan={handleTriggerScan}
          onCancelScan={handleCancelScan}
        />

        {/* Scrollable Page Body */}
        <main className="page-viewport">
          {currentTab === "overview" && (
            <OverviewView
              summary={summary}
              categories={categories}
              largestFiles={largestFiles}
              recommendations={recommendations}
              isSimulatedErrorActive={isSimulatedErrorActive}
              scanState={scanState}
              isDemoMode={isDemoMode}
              totalFilesScanned={scanResultDetails.totalFilesScanned}
              permissionDeniedCount={scanResultDetails.permissionDeniedCount}
              scanDurationMs={scanResultDetails.scanDurationMs}
              errorMessage={errorMessage}
              onClearSimulatedError={() => setIsSimulatedErrorActive(false)}
              onTriggerScan={handleTriggerScan}
              onRetry={loadInitialStorage}
              onInspectCategory={handleInspectCategory}
              onReviewCleanup={handleReviewCleanup}
              onInspectFile={setInspectedFile}
            />
          )}

          {currentTab === "analyze" && (
            <AnalyzeView
              directoryTree={directoryTree}
              hasCompletedScan={hasCompletedScan}
              onTriggerScan={handleTriggerScan}
              onScanComplete={(res) => {
                setSummary(res.summary);
                setCategories(res.categories);
                setLargestFiles(res.largestFiles);
                setRecommendations(res.recommendations);
                setDirectoryTree(res.directoryTree);
                setScanState("completed");
                showToast(`Scan completed: ${res.totalFilesScanned.toLocaleString()} files indexed.`);
              }}
            />
          )}

          {currentTab === "cleanup" && (
            <CleanupView
              recommendations={recommendations}
              isDemoMode={isDemoMode}
              hasCompletedScan={hasCompletedScan}
              onTriggerScan={handleTriggerScan}
              onCleanupExecuted={handleCleanupExecuted}
            />
          )}

          {currentTab === "settings" && (
            <SettingsView
              isSimulatedErrorActive={isSimulatedErrorActive}
              onToggleSimulateError={setIsSimulatedErrorActive}
              isDemoMode={isDemoMode}
              onToggleDemoMode={handleToggleDemoMode}
            />
          )}
        </main>
      </div>

      {/* File Inspection Modal */}
      <InspectModal
        file={inspectedFile}
        onClose={() => setInspectedFile(null)}
      />

      {/* Toast Notifications */}
      {toastMessage && (
        <div className="toast-container">
          <div className="toast-item">
            <CheckCircle2 size={16} color="var(--accent)" />
            <span>{toastMessage}</span>
          </div>
        </div>
      )}
    </div>
  );
}

export default App;
