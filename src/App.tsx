import { useState, useRef } from "react";
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
  ScanStatus,
  DirectoryNode,
} from "./types/storage";
import {
  mockStorageSummary,
  mockCategories,
  mockLargestFiles,
  mockRecommendations,
  mockDirectoryTree,
} from "./mock/storageData";
import {
  startDirectoryScan,
  cancelDirectoryScan,
  subscribeScanProgress,
} from "./services/scannerService";
import { CheckCircle2 } from "lucide-react";

export function App() {
  const [currentTab, setCurrentTab] = useState<NavigationTab>("overview");
  const [summary, setSummary] = useState<StorageSummary>(mockStorageSummary);
  const [categories, setCategories] = useState<StorageCategory[]>(mockCategories);
  const [largestFiles, setLargestFiles] = useState<FileItem[]>(mockLargestFiles);
  const [recommendations, setRecommendations] = useState<CleanupRecommendation[]>(mockRecommendations);
  const [directoryTree, setDirectoryTree] = useState<DirectoryNode>(mockDirectoryTree);

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
    progressPercent: 100,
    currentPath: "/home/krishna",
    filesScannedCount: 1420100,
    lastCompleted: "Today, 14:15",
    isLiveData: false,
  });

  const unlistenRef = useRef<(() => void) | null>(null);

  const showToast = (message: string) => {
    setToastMessage(message);
    setTimeout(() => {
      setToastMessage(null);
    }, 3500);
  };

  // Real Linux filesystem scanner routine with typed Tauri commands
  const handleTriggerScan = async () => {
    if (scanStatus.isScanning) return;

    setScanStatus({
      isScanning: true,
      progressPercent: 1,
      currentPath: "Initializing native crawler...",
      filesScannedCount: 0,
      lastCompleted: scanStatus.lastCompleted,
      isLiveData: scanStatus.isLiveData,
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

      // Replace mock data with real measurements now that scan is complete
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
        setScanStatus((prev) => ({
          ...prev,
          isScanning: false,
          currentPath: "Scan Cancelled",
        }));
        showToast("Storage scan cancelled by user.");
      } else {
        setScanStatus((prev) => ({
          ...prev,
          isScanning: false,
          currentPath: "Scan Error",
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

  return (
    <div className="app-container">
      {/* Fixed Left Sidebar */}
      <Sidebar
        currentTab={currentTab}
        onSelectTab={setCurrentTab}
        storageSummary={summary}
      />

      {/* Main Shell */}
      <div className="main-shell">
        {/* Top Header */}
        <Header
          currentTab={currentTab}
          scanStatus={scanStatus}
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
              totalFilesScanned={scanResultDetails.totalFilesScanned}
              permissionDeniedCount={scanResultDetails.permissionDeniedCount}
              onClearSimulatedError={() => setIsSimulatedErrorActive(false)}
              onInspectCategory={handleInspectCategory}
              onReviewCleanup={handleReviewCleanup}
              onInspectFile={setInspectedFile}
            />
          )}

          {currentTab === "analyze" && (
            <AnalyzeView directoryTree={directoryTree} />
          )}

          {currentTab === "cleanup" && (
            <CleanupView recommendations={recommendations} />
          )}

          {currentTab === "settings" && (
            <SettingsView
              isSimulatedErrorActive={isSimulatedErrorActive}
              onToggleSimulateError={setIsSimulatedErrorActive}
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
