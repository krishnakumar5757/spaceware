import React, { useState, useEffect, useMemo, useCallback } from "react";
import {
  Folder,
  FolderOpen,
  ChevronRight,
  Search,
  HardDrive,
  FileText,
  ArrowLeft,
  ArrowRight,
  ArrowUp,
  RotateCcw,
  Eye,
  EyeOff,
  CheckSquare,
  Square,
  Trash2,
  Play,
  ExternalLink,
  Copy,
  Check,
  AlertTriangle,
  ShieldAlert,
  Film,
  Code2,
  Boxes,
  FileArchive,
  Link as LinkIcon,
  X,
  RefreshCw,
  Lock,
  ArrowDown,
  Sparkles,
} from "lucide-react";
import {
  DirectoryNode,
  DirectoryListingResult,
  ExplorerItem,
  ScanResult,
  ScanProgress,
  SelectiveCleanupPreview,
  CleanupExecutionSummary,
} from "../../types/storage";
import { formatBytes } from "../../mock/storageData";
import { EmptyState, LoadingState } from "../common/StateViews";
import { useScrollRevealContainer } from "../../hooks/useScrollReveal";
import {
  getHomeDirectory,
  listDirectory,
  scanTargets,
  cancelDirectoryScan,
  subscribeScanProgress,
  revealInFileManager,
  previewSelectiveCleanup,
  executeSelectiveCleanup,
} from "../../services/scannerService";

interface AnalyzeViewProps {
  directoryTree?: DirectoryNode;
  hasCompletedScan?: boolean;
  onTriggerScan?: () => void;
  onScanComplete?: (result: ScanResult) => void;
}

type SortField = "name" | "size" | "type" | "modified";
type SortOrder = "asc" | "desc";

export const AnalyzeView: React.FC<AnalyzeViewProps> = ({
  onScanComplete,
}) => {
  const containerRef = useScrollRevealContainer<HTMLDivElement>();

  // Directory navigation state
  const [currentPath, setCurrentPath] = useState<string>("");
  const [history, setHistory] = useState<string[]>([]);
  const [historyIndex, setHistoryIndex] = useState<number>(-1);
  const [listing, setListing] = useState<DirectoryListingResult | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Filter & View options
  const [searchQuery, setSearchQuery] = useState<string>("");
  const [showHidden, setShowHidden] = useState<boolean>(false);
  const [sortField, setSortField] = useState<SortField>("name");
  const [sortOrder, setSortOrder] = useState<SortOrder>("asc");

  // Selection & Inspector
  const [selectedPaths, setSelectedPaths] = useState<Set<string>>(new Set());
  const [inspectedItem, setInspectedItem] = useState<ExplorerItem | null>(null);
  const [copiedPath, setCopiedPath] = useState<string | null>(null);

  // Scanning targets state
  const [isScanningTargets, setIsScanningTargets] = useState<boolean>(false);
  const [scanProgressInfo, setScanProgressInfo] = useState<ScanProgress | null>(null);

  // Selective Cleanup modal state
  const [isCleanupModalOpen, setIsCleanupModalOpen] = useState<boolean>(false);
  const [cleanupPreview, setCleanupPreview] = useState<SelectiveCleanupPreview | null>(null);
  const [cleanupAction, setCleanupAction] = useState<"trash" | "permanent_delete">("trash");
  const [confirmPermanentDelete, setConfirmPermanentDelete] = useState<boolean>(false);
  const [isExecutingCleanup, setIsExecutingCleanup] = useState<boolean>(false);
  const [cleanupSummary, setCleanupSummary] = useState<CleanupExecutionSummary | null>(null);
  const [cleanupError, setCleanupError] = useState<string | null>(null);

  // Load user's home directory on initial mount
  useEffect(() => {
    let isMounted = true;
    getHomeDirectory()
      .then((home) => {
        if (!isMounted) return;
        const initial = home || "/home";
        setCurrentPath(initial);
        setHistory([initial]);
        setHistoryIndex(0);
        loadDirectory(initial, showHidden);
      })
      .catch((err) => {
        console.warn("Could not query home directory:", err);
        const fallback = "/home";
        setCurrentPath(fallback);
        setHistory([fallback]);
        setHistoryIndex(0);
        loadDirectory(fallback, showHidden);
      });

    return () => {
      isMounted = false;
    };
  }, []);

  // Fetch directory listing safely
  const loadDirectory = async (path: string, hidden: boolean) => {
    setIsLoading(true);
    setErrorMessage(null);
    try {
      const res = await listDirectory(path, 1, 1000, hidden);
      setListing(res);
      setCurrentPath(res.canonicalPath || path);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      setErrorMessage(msg);
      setListing(null);
    } finally {
      setIsLoading(false);
    }
  };

  // Navigate to a new directory path
  const navigateTo = useCallback(
    (newPath: string, pushHistory = true) => {
      setSelectedPaths(new Set());
      setInspectedItem(null);
      if (pushHistory) {
        setHistory((prev) => {
          const next = prev.slice(0, historyIndex + 1);
          next.push(newPath);
          return next;
        });
        setHistoryIndex((prev) => prev + 1);
      }
      loadDirectory(newPath, showHidden);
    },
    [historyIndex, showHidden]
  );

  // Navigation toolbar actions
  const handleGoBack = () => {
    if (historyIndex > 0) {
      const target = history[historyIndex - 1];
      setHistoryIndex(historyIndex - 1);
      setSelectedPaths(new Set());
      setInspectedItem(null);
      loadDirectory(target, showHidden);
    }
  };

  const handleGoForward = () => {
    if (historyIndex < history.length - 1) {
      const target = history[historyIndex + 1];
      setHistoryIndex(historyIndex + 1);
      setSelectedPaths(new Set());
      setInspectedItem(null);
      loadDirectory(target, showHidden);
    }
  };

  const handleGoUp = () => {
    if (listing?.parentPath) {
      navigateTo(listing.parentPath);
    }
  };

  const handleRefresh = () => {
    if (currentPath) {
      loadDirectory(currentPath, showHidden);
    }
  };

  const handleToggleHidden = () => {
    const nextVal = !showHidden;
    setShowHidden(nextVal);
    if (currentPath) {
      loadDirectory(currentPath, nextVal);
    }
  };

  const handleCopyPath = (path: string) => {
    navigator.clipboard.writeText(path);
    setCopiedPath(path);
    setTimeout(() => {
      setCopiedPath(null);
    }, 2000);
  };

  // Breadcrumb segment handler
  const breadcrumbs = useMemo(() => {
    if (!currentPath) return [];
    const segments = currentPath.split("/").filter(Boolean);
    return segments.map((seg, idx) => ({
      name: seg,
      path: "/" + segments.slice(0, idx + 1).join("/"),
    }));
  }, [currentPath]);

  // Selection handlers
  const toggleSelectPath = (path: string, e?: React.MouseEvent) => {
    e?.stopPropagation();
    setSelectedPaths((prev) => {
      const next = new Set(prev);
      if (next.has(path)) {
        next.delete(path);
      } else {
        next.add(path);
      }
      return next;
    });
  };

  const handleRowClick = (item: ExplorerItem) => {
    setInspectedItem(item);
    // If only 1 item or none selected, set selection to clicked item
    if (selectedPaths.size <= 1) {
      setSelectedPaths(new Set([item.path]));
    }
  };

  const handleRowDoubleClick = (item: ExplorerItem) => {
    if (item.isDir) {
      navigateTo(item.path);
    } else {
      setInspectedItem(item);
    }
  };

  // Filter and sort items
  const filteredAndSortedItems = useMemo(() => {
    if (!listing?.items) return [];

    let result = listing.items.filter((item) => {
      if (!searchQuery) return true;
      const q = searchQuery.toLowerCase();
      return item.name.toLowerCase().includes(q) || item.extension.toLowerCase().includes(q);
    });

    result.sort((a, b) => {
      // Directories stay grouped on top unless sorting by size/type explicitly
      if (sortField === "name") {
        if (a.isDir !== b.isDir) return a.isDir ? -1 : 1;
        const diff = a.name.localeCompare(b.name);
        return sortOrder === "asc" ? diff : -diff;
      } else if (sortField === "size") {
        const diff = a.sizeBytes - b.sizeBytes;
        return sortOrder === "asc" ? diff : -diff;
      } else if (sortField === "type") {
        const diff = a.fileType.localeCompare(b.fileType);
        return sortOrder === "asc" ? diff : -diff;
      } else if (sortField === "modified") {
        const diff = a.lastModifiedEpoch - b.lastModifiedEpoch;
        return sortOrder === "asc" ? diff : -diff;
      }
      return 0;
    });

    return result;
  }, [listing?.items, searchQuery, sortField, sortOrder]);

  const handleSort = (field: SortField) => {
    if (sortField === field) {
      setSortOrder(sortOrder === "asc" ? "desc" : "asc");
    } else {
      setSortField(field);
      setSortOrder("asc");
    }
  };

  const isAllSelected =
    filteredAndSortedItems.length > 0 &&
    filteredAndSortedItems.every((item) => selectedPaths.has(item.path));

  const handleToggleSelectAll = () => {
    if (isAllSelected) {
      setSelectedPaths(new Set());
    } else {
      const all = new Set(filteredAndSortedItems.map((item) => item.path));
      setSelectedPaths(all);
    }
  };

  // Selected totals
  const selectedItemsList = useMemo(() => {
    if (!listing?.items) return [];
    return listing.items.filter((item) => selectedPaths.has(item.path));
  }, [listing?.items, selectedPaths]);

  const selectedTotalBytes = useMemo(() => {
    return selectedItemsList.reduce((acc, item) => acc + item.sizeBytes, 0);
  }, [selectedItemsList]);

  // Selective Scanner routines
  const handleScanTargets = async (targets: string[]) => {
    if (targets.length === 0 || isScanningTargets) return;

    setIsScanningTargets(true);
    setScanProgressInfo({
      isScanning: true,
      progressPercent: 5,
      currentPath: targets[0],
      filesScannedCount: 0,
      bytesScanned: 0,
    });

    let unlisten: (() => void) | null = null;
    try {
      unlisten = await subscribeScanProgress((progress) => {
        setScanProgressInfo(progress);
      });

      const result = await scanTargets(targets);
      if (onScanComplete) {
        onScanComplete(result);
      }
      // Refresh current directory after scan
      loadDirectory(currentPath, showHidden);
    } catch (err: unknown) {
      console.error("Selective scan failed:", err);
    } finally {
      if (unlisten) unlisten();
      setIsScanningTargets(false);
      setScanProgressInfo(null);
    }
  };

  const handleCancelTargetScan = async () => {
    await cancelDirectoryScan();
    setIsScanningTargets(false);
    setScanProgressInfo(null);
  };

  // Selective Cleanup routines
  const handleOpenCleanupModal = async (targets: string[]) => {
    if (targets.length === 0) return;
    setCleanupError(null);
    setCleanupSummary(null);
    setConfirmPermanentDelete(false);
    setCleanupAction("trash");
    setIsCleanupModalOpen(true);

    try {
      const preview = await previewSelectiveCleanup(targets);
      setCleanupPreview(preview);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      setCleanupError(msg);
    }
  };

  const handleExecuteCleanup = async () => {
    if (!cleanupPreview || cleanupPreview.eligibleCount === 0 || isExecutingCleanup) return;

    const eligiblePaths = cleanupPreview.targets
      .filter((t) => t.isEligible)
      .map((t) => t.path);

    setIsExecutingCleanup(true);
    setCleanupError(null);

    try {
      const summary = await executeSelectiveCleanup(eligiblePaths, cleanupAction);
      setCleanupSummary(summary);
      setSelectedPaths(new Set());
      setInspectedItem(null);
      // Reload directory
      loadDirectory(currentPath, showHidden);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      setCleanupError(msg);
    } finally {
      setIsExecutingCleanup(false);
    }
  };

  // File Icon helper
  const getFileIcon = (item: ExplorerItem) => {
    if (item.isSymlink) {
      return <LinkIcon size={16} color="#A78BFA" />;
    }
    if (item.isDir) {
      return inspectedItem?.path === item.path ? (
        <FolderOpen size={16} color="var(--accent)" />
      ) : (
        <Folder size={16} color="var(--accent)" />
      );
    }
    switch (item.fileType) {
      case "media":
        return <Film size={16} color="#38BDF8" />;
      case "developer":
        return <Code2 size={16} color="var(--accent)" />;
      case "apps":
        return <Boxes size={16} color="#A78BFA" />;
      case "archive":
      case "documents":
        return <FileArchive size={16} color="#FBBF24" />;
      case "system":
        return <ShieldAlert size={16} color="#F472B6" />;
      default:
        return <FileText size={16} color="var(--text-secondary)" />;
    }
  };

  const renderSortIndicator = (field: SortField) => {
    if (sortField !== field) return null;
    return sortOrder === "asc" ? (
      <ArrowUp size={12} color="var(--accent)" />
    ) : (
      <ArrowDown size={12} color="var(--accent)" />
    );
  };

  return (
    <div ref={containerRef} style={{ display: "flex", flexDirection: "column", gap: "18px" }}>
      {/* Real-time Scan Progress Banner */}
      {isScanningTargets && scanProgressInfo && (
        <div
          className="demo-banner"
          style={{
            borderLeftColor: "var(--accent)",
            borderColor: "rgba(199, 243, 107, 0.3)",
            background: "linear-gradient(90deg, rgba(30, 36, 26, 0.95) 0%, rgba(24, 28, 22, 0.95) 100%)",
          }}
        >
          <div className="demo-banner-content" style={{ flex: 1 }}>
            <div className="demo-banner-icon" style={{ color: "var(--accent)" }}>
              <RefreshCw size={18} className="spin-animation" style={{ animation: "spin 1s linear infinite" }} />
            </div>
            <div style={{ flex: 1 }}>
              <div className="demo-banner-title" style={{ color: "var(--accent)" }}>
                Scanning Selected Target{selectedPaths.size > 1 ? "s" : ""}...
              </div>
              <div className="demo-banner-desc" style={{ maxWidth: "600px" }}>
                Analyzed {scanProgressInfo.filesScannedCount.toLocaleString()} files ({formatBytes(scanProgressInfo.bytesScanned, 1)}).
                <span style={{ display: "block", color: "var(--text-muted)", fontSize: "11px", marginTop: "2px" }}>
                  {scanProgressInfo.currentPath}
                </span>
              </div>
              {/* Progress bar */}
              <div className="progress-bar-track" style={{ height: "4px", marginTop: "6px", maxWidth: "450px" }}>
                <div
                  className="progress-bar-fill"
                  style={{
                    width: `${scanProgressInfo.progressPercent || 25}%`,
                    backgroundColor: "var(--accent)",
                  }}
                />
              </div>
            </div>
          </div>
          <button
            className="btn-secondary"
            onClick={handleCancelTargetScan}
            style={{ fontSize: "12px", padding: "6px 14px", color: "var(--status-danger)" }}
          >
            Cancel Scan
          </button>
        </div>
      )}

      {/* Explorer Navigation Toolbar */}
      <div
        className="metric-card"
        style={{
          padding: "12px 18px",
          display: "flex",
          flexDirection: "column",
          gap: "12px",
        }}
      >
        {/* Top Controls Row */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: "10px" }}>
          {/* Back, Forward, Up, Refresh buttons */}
          <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
            <button
              className="btn-secondary"
              onClick={handleGoBack}
              disabled={historyIndex <= 0}
              style={{ padding: "6px 10px", fontSize: "12px" }}
              title="Go Back"
            >
              <ArrowLeft size={14} />
            </button>
            <button
              className="btn-secondary"
              onClick={handleGoForward}
              disabled={historyIndex >= history.length - 1}
              style={{ padding: "6px 10px", fontSize: "12px" }}
              title="Go Forward"
            >
              <ArrowRight size={14} />
            </button>
            <button
              className="btn-secondary"
              onClick={handleGoUp}
              disabled={!listing?.parentPath}
              style={{ padding: "6px 10px", fontSize: "12px" }}
              title="Go to Parent Folder"
            >
              <ArrowUp size={14} />
            </button>
            <button
              className="btn-secondary"
              onClick={handleRefresh}
              style={{ padding: "6px 10px", fontSize: "12px" }}
              title="Refresh Folder"
            >
              <RotateCcw size={14} />
            </button>
          </div>

          {/* Breadcrumb Path display */}
          <div
            style={{
              flex: 1,
              minWidth: "220px",
              display: "flex",
              alignItems: "center",
              gap: "4px",
              padding: "6px 12px",
              backgroundColor: "var(--bg-panel-subtle)",
              borderRadius: "var(--radius-sm)",
              border: "1px solid var(--border-subtle)",
              overflowX: "auto",
              whiteSpace: "nowrap",
            }}
          >
            <HardDrive size={14} color="var(--accent)" style={{ flexShrink: 0 }} />
            <button
              onClick={() => navigateTo("/")}
              style={{
                background: "none",
                border: "none",
                color: "var(--text-secondary)",
                cursor: "pointer",
                fontSize: "12px",
                fontWeight: 600,
                padding: "2px 4px",
              }}
            >
              /
            </button>
            {breadcrumbs.map((bc) => (
              <React.Fragment key={bc.path}>
                <ChevronRight size={12} color="var(--text-muted)" style={{ flexShrink: 0 }} />
                <button
                  onClick={() => navigateTo(bc.path)}
                  style={{
                    background: "none",
                    border: "none",
                    color: bc.path === currentPath ? "var(--text-primary)" : "var(--text-secondary)",
                    cursor: "pointer",
                    fontSize: "12.5px",
                    fontWeight: bc.path === currentPath ? 700 : 500,
                    padding: "2px 4px",
                    borderRadius: "2px",
                  }}
                  className="breadcrumb-item-btn"
                >
                  {bc.name}
                </button>
              </React.Fragment>
            ))}
            <button
              onClick={() => handleCopyPath(currentPath)}
              style={{
                marginLeft: "auto",
                background: "none",
                border: "none",
                color: copiedPath === currentPath ? "var(--accent)" : "var(--text-muted)",
                cursor: "pointer",
                padding: "2px 6px",
              }}
              title="Copy Full Path"
            >
              {copiedPath === currentPath ? <Check size={13} /> : <Copy size={13} />}
            </button>
          </div>

          {/* Quick Target Actions */}
          <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
            <button
              className="btn-secondary"
              onClick={handleToggleHidden}
              style={{
                fontSize: "12px",
                padding: "6px 12px",
                borderColor: showHidden ? "var(--accent)" : "var(--border-subtle)",
                color: showHidden ? "var(--accent)" : "var(--text-secondary)",
              }}
              title={showHidden ? "Hide Hidden Files" : "Show Hidden Files"}
            >
              {showHidden ? <EyeOff size={13} /> : <Eye size={13} />}
              <span>{showHidden ? "Dotfiles Visible" : "Show Hidden"}</span>
            </button>

            <button
              className="btn-primary"
              onClick={() => handleScanTargets([currentPath])}
              disabled={isScanningTargets || !listing?.isReadable}
              style={{ fontSize: "12px", padding: "6px 14px" }}
              title="Recursively scan current directory"
            >
              <Play size={13} />
              <span>Scan Folder</span>
            </button>
          </div>
        </div>

        {/* Search & Selection Summary Bar */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: "10px" }}>
          {/* Search box */}
          <div className="search-box" style={{ maxWidth: "340px", width: "100%" }}>
            <Search size={15} color="var(--text-muted)" />
            <input
              type="text"
              placeholder="Filter items in current folder..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              style={{ fontSize: "12.5px" }}
            />
            {searchQuery && (
              <button
                onClick={() => setSearchQuery("")}
                style={{ background: "none", border: "none", color: "var(--text-muted)", cursor: "pointer" }}
              >
                <X size={13} />
              </button>
            )}
          </div>

          {/* Multi-selection summary & actions */}
          {selectedPaths.size > 0 && (
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: "12px",
                background: "rgba(199, 243, 107, 0.08)",
                border: "1px solid rgba(199, 243, 107, 0.25)",
                borderRadius: "var(--radius-sm)",
                padding: "4px 12px",
              }}
            >
              <span style={{ fontSize: "12.5px", color: "var(--accent)", fontWeight: 600 }}>
                {selectedPaths.size} item{selectedPaths.size > 1 ? "s" : ""} selected
                {selectedTotalBytes > 0 ? ` (${formatBytes(selectedTotalBytes, 1)})` : ""}
              </span>

              <button
                className="btn-secondary"
                onClick={() => handleScanTargets(Array.from(selectedPaths))}
                disabled={isScanningTargets}
                style={{ fontSize: "11.5px", padding: "4px 10px" }}
              >
                <Play size={12} color="var(--accent)" />
                <span>Scan Selected</span>
              </button>

              <button
                className="btn-secondary"
                onClick={() => handleOpenCleanupModal(Array.from(selectedPaths))}
                style={{ fontSize: "11.5px", padding: "4px 10px", color: "var(--status-danger)", borderColor: "rgba(248, 113, 113, 0.3)" }}
              >
                <Trash2 size={12} />
                <span>Clean Selected</span>
              </button>

              <button
                onClick={() => setSelectedPaths(new Set())}
                style={{ background: "none", border: "none", color: "var(--text-muted)", cursor: "pointer", fontSize: "11.5px" }}
              >
                Clear
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Explorer Content & Side Inspector Split */}
      <div style={{ display: "grid", gridTemplateColumns: inspectedItem ? "1fr 340px" : "1fr", gap: "18px", alignItems: "start" }}>
        {/* Main Directory Table */}
        <div className="metric-card" style={{ padding: "0", overflow: "hidden" }}>
          {isLoading ? (
            <div style={{ padding: "48px 24px" }}>
              <LoadingState
                title="Reading Directory Contents..."
                message={`Querying native Linux metadata for ${currentPath}`}
              />
            </div>
          ) : errorMessage ? (
            <div style={{ padding: "36px 20px" }}>
              <div className="state-box" style={{ borderColor: "rgba(248, 113, 113, 0.3)" }}>
                <div className="state-icon" style={{ color: "var(--status-danger)", backgroundColor: "var(--status-danger-bg)" }}>
                  <AlertTriangle size={26} />
                </div>
                <div className="state-title" style={{ color: "var(--status-danger)" }}>Unable to Open Directory</div>
                <div className="state-desc">{errorMessage}</div>
                <div style={{ display: "flex", gap: "10px", marginTop: "10px" }}>
                  <button className="btn-secondary" onClick={handleGoBack} disabled={historyIndex <= 0}>
                    <ArrowLeft size={13} /> Go Back
                  </button>
                  <button className="btn-secondary" onClick={handleRefresh}>
                    <RotateCcw size={13} /> Retry
                  </button>
                </div>
              </div>
            </div>
          ) : listing && !listing.isReadable ? (
            <div style={{ padding: "36px 20px" }}>
              <div className="state-box" style={{ borderColor: "rgba(251, 191, 36, 0.3)" }}>
                <div className="state-icon" style={{ color: "var(--status-warning)", backgroundColor: "rgba(251, 191, 36, 0.12)" }}>
                  <Lock size={26} />
                </div>
                <div className="state-title" style={{ color: "var(--status-warning)" }}>Permission Denied</div>
                <div className="state-desc">
                  {listing.errorMessage || "You do not have elevated privileges to read contents of this folder."}
                </div>
                {listing.parentPath && (
                  <button className="btn-primary" onClick={handleGoUp} style={{ marginTop: "10px", fontSize: "12.5px" }}>
                    <ArrowUp size={13} /> Return to Parent Folder
                  </button>
                )}
              </div>
            </div>
          ) : filteredAndSortedItems.length === 0 ? (
            <div style={{ padding: "48px 24px" }}>
              <EmptyState
                title={searchQuery ? "No matching files or folders" : "This folder is empty"}
                message={
                  searchQuery
                    ? `No items match "${searchQuery}". Clear your search query or check hidden files.`
                    : "No accessible files or subdirectories were found in this directory."
                }
                actionLabel={searchQuery ? "Clear Search" : undefined}
                onAction={searchQuery ? () => setSearchQuery("") : undefined}
              />
            </div>
          ) : (
            <div className="data-table-container" style={{ border: "none", borderRadius: "0" }}>
              <table className="spacewise-table">
                <thead>
                  <tr>
                    <th style={{ width: "42px", textAlign: "center" }}>
                      <button
                        onClick={handleToggleSelectAll}
                        style={{ background: "none", border: "none", color: isAllSelected ? "var(--accent)" : "var(--text-muted)", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", width: "100%" }}
                        title={isAllSelected ? "Deselect All" : "Select All"}
                      >
                        {isAllSelected ? <CheckSquare size={16} /> : <Square size={16} />}
                      </button>
                    </th>
                    <th className="sortable" onClick={() => handleSort("name")} style={{ width: "45%" }}>
                      <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                        <span>Name</span>
                        {renderSortIndicator("name")}
                      </div>
                    </th>
                    <th className="sortable" onClick={() => handleSort("size")} style={{ width: "16%" }}>
                      <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                        <span>Size</span>
                        {renderSortIndicator("size")}
                      </div>
                    </th>
                    <th className="sortable" onClick={() => handleSort("type")} style={{ width: "18%" }}>
                      <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                        <span>Type</span>
                        {renderSortIndicator("type")}
                      </div>
                    </th>
                    <th className="sortable" onClick={() => handleSort("modified")} style={{ width: "21%" }}>
                      <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                        <span>Modified</span>
                        {renderSortIndicator("modified")}
                      </div>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {filteredAndSortedItems.map((item) => {
                    const isSelected = selectedPaths.has(item.path);
                    const isInspected = inspectedItem?.path === item.path;

                    return (
                      <tr
                        key={item.id}
                        onClick={() => handleRowClick(item)}
                        onDoubleClick={() => handleRowDoubleClick(item)}
                        style={{
                          backgroundColor: isSelected
                            ? "rgba(199, 243, 107, 0.07)"
                            : isInspected
                            ? "var(--bg-panel-hover)"
                            : undefined,
                          cursor: "pointer",
                        }}
                      >
                        {/* Checkbox cell */}
                        <td style={{ textAlign: "center", padding: "10px" }} onClick={(e) => toggleSelectPath(item.path, e)}>
                          <span style={{ color: isSelected ? "var(--accent)" : "var(--text-muted)" }}>
                            {isSelected ? <CheckSquare size={15} /> : <Square size={15} />}
                          </span>
                        </td>

                        {/* File Name & Icon cell */}
                        <td>
                          <div className="table-file-cell">
                            <div className="file-icon-box">
                              {getFileIcon(item)}
                            </div>
                            <div className="file-name-meta">
                              <span className="file-name-text" title={item.name}>
                                {item.name}
                              </span>
                              {item.isSymlink && item.symlinkTarget && (
                                <span style={{ fontSize: "11px", color: "var(--text-muted)" }}>
                                  → {item.symlinkTarget}
                                </span>
                              )}
                            </div>
                          </div>
                        </td>

                        {/* Size cell */}
                        <td>
                          <span className="table-size-badge">
                            {item.isDir ? "—" : formatBytes(item.sizeBytes, 1)}
                          </span>
                        </td>

                        {/* Type cell */}
                        <td>
                          <span
                            className="category-tag"
                            style={{
                              backgroundColor: item.isDir
                                ? "rgba(199, 243, 107, 0.1)"
                                : item.isSymlink
                                ? "rgba(167, 139, 250, 0.12)"
                                : undefined,
                              color: item.isDir
                                ? "var(--accent)"
                                : item.isSymlink
                                ? "#A78BFA"
                                : undefined,
                              border: item.isDir
                                ? "1px solid rgba(199, 243, 107, 0.3)"
                                : undefined,
                            }}
                          >
                            {item.isSymlink ? "Symlink" : item.category}
                          </span>
                        </td>

                        {/* Modified Date cell */}
                        <td>
                          <span style={{ fontSize: "12px", color: "var(--text-muted)" }}>
                            {item.lastModified}
                          </span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>

              {/* Table Footer info */}
              <div
                style={{
                  padding: "10px 18px",
                  backgroundColor: "var(--bg-panel-subtle)",
                  borderTop: "1px solid var(--border-subtle)",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  fontSize: "12px",
                  color: "var(--text-muted)",
                }}
              >
                <span>
                  {(listing?.totalDirs || 0)} folder{(listing?.totalDirs || 0) === 1 ? "" : "s"}, {(listing?.totalFiles || 0)} file{(listing?.totalFiles || 0) === 1 ? "" : "s"}
                </span>
                <span>
                  Total logical size: <strong style={{ color: "var(--text-primary)" }}>{formatBytes(listing?.totalBytes || 0, 1)}</strong>
                </span>
              </div>
            </div>
          )}
        </div>

        {/* Compact File Inspector Side Panel */}
        {inspectedItem && (
          <div
            className="metric-card"
            style={{
              padding: "18px",
              display: "flex",
              flexDirection: "column",
              gap: "14px",
              position: "sticky",
              top: "20px",
            }}
          >
            {/* Inspector Header */}
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
              <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                <div className="file-icon-box" style={{ width: "32px", height: "32px" }}>
                  {getFileIcon(inspectedItem)}
                </div>
                <span style={{ fontWeight: 700, fontSize: "13.5px", color: "var(--text-primary)" }}>
                  Item Details
                </span>
              </div>
              <button
                onClick={() => setInspectedItem(null)}
                style={{ background: "none", border: "none", color: "var(--text-muted)", cursor: "pointer" }}
                title="Close Inspector"
              >
                <X size={16} />
              </button>
            </div>

            {/* Name & Full Path */}
            <div style={{ background: "var(--bg-panel-subtle)", padding: "10px 12px", borderRadius: "var(--radius-sm)", border: "1px solid var(--border-subtle)" }}>
              <div style={{ fontWeight: 600, color: "var(--text-primary)", fontSize: "13px", wordBreak: "break-all" }}>
                {inspectedItem.name}
              </div>
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  marginTop: "6px",
                  fontSize: "11px",
                  color: "var(--text-muted)",
                  fontFamily: "'JetBrains Mono', monospace",
                  wordBreak: "break-all",
                }}
              >
                <span>{inspectedItem.path}</span>
                <button
                  onClick={() => handleCopyPath(inspectedItem.path)}
                  style={{ background: "none", border: "none", color: copiedPath === inspectedItem.path ? "var(--accent)" : "var(--text-muted)", cursor: "pointer", marginLeft: "4px" }}
                  title="Copy Path"
                >
                  {copiedPath === inspectedItem.path ? <Check size={12} /> : <Copy size={12} />}
                </button>
              </div>
            </div>

            {/* Metadata Grid */}
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "8px", fontSize: "12px" }}>
              <div style={{ background: "var(--bg-card)", padding: "8px 10px", borderRadius: "var(--radius-sm)", border: "1px solid var(--border-subtle)" }}>
                <span style={{ color: "var(--text-muted)", fontSize: "10.5px", display: "block" }}>Type</span>
                <strong style={{ color: "var(--text-primary)" }}>
                  {inspectedItem.isDir ? "Directory" : inspectedItem.isSymlink ? "Symbolic Link" : inspectedItem.category}
                </strong>
              </div>

              <div style={{ background: "var(--bg-card)", padding: "8px 10px", borderRadius: "var(--radius-sm)", border: "1px solid var(--border-subtle)" }}>
                <span style={{ color: "var(--text-muted)", fontSize: "10.5px", display: "block" }}>Logical Size</span>
                <strong style={{ color: "var(--accent)" }}>
                  {inspectedItem.isDir ? "Folder" : formatBytes(inspectedItem.sizeBytes, 2)}
                </strong>
              </div>

              <div style={{ background: "var(--bg-card)", padding: "8px 10px", borderRadius: "var(--radius-sm)", border: "1px solid var(--border-subtle)" }}>
                <span style={{ color: "var(--text-muted)", fontSize: "10.5px", display: "block" }}>Last Modified</span>
                <span style={{ color: "var(--text-secondary)" }}>{inspectedItem.lastModified}</span>
              </div>

              <div style={{ background: "var(--bg-card)", padding: "8px 10px", borderRadius: "var(--radius-sm)", border: "1px solid var(--border-subtle)" }}>
                <span style={{ color: "var(--text-muted)", fontSize: "10.5px", display: "block" }}>Status</span>
                <span style={{ color: inspectedItem.isReadonly ? "var(--status-warning)" : "var(--status-success)" }}>
                  {inspectedItem.isReadonly ? "Read-Only" : "Writable"}
                </span>
              </div>
            </div>

            {/* Symlink Target Details if applicable */}
            {inspectedItem.isSymlink && (
              <div style={{ background: "rgba(167, 139, 250, 0.08)", padding: "8px 10px", borderRadius: "var(--radius-sm)", border: "1px solid rgba(167, 139, 250, 0.25)", fontSize: "11.5px" }}>
                <span style={{ color: "#A78BFA", fontWeight: 600, display: "block" }}>Symbolic Link Target:</span>
                <span style={{ color: "var(--text-secondary)", wordBreak: "break-all" }}>
                  {inspectedItem.symlinkTarget || "Dangling link target"}
                </span>
              </div>
            )}

            {/* Quick Actions */}
            <div style={{ display: "flex", flexDirection: "column", gap: "8px", marginTop: "4px" }}>
              <button
                className="btn-primary"
                onClick={() => handleScanTargets([inspectedItem.path])}
                disabled={isScanningTargets}
                style={{ fontSize: "12px", justifyContent: "center" }}
              >
                <Play size={13} />
                <span>Scan This {inspectedItem.isDir ? "Folder" : "File"}</span>
              </button>

              <button
                className="btn-secondary"
                onClick={() => revealInFileManager(inspectedItem.path)}
                style={{ fontSize: "12px", justifyContent: "center" }}
              >
                <ExternalLink size={13} />
                <span>Reveal in File Manager</span>
              </button>

              <button
                className="btn-secondary"
                onClick={() => handleOpenCleanupModal([inspectedItem.path])}
                style={{ fontSize: "12px", justifyContent: "center", color: "var(--status-danger)", borderColor: "rgba(248, 113, 113, 0.3)" }}
              >
                <Trash2 size={13} />
                <span>Clean / Trash Item</span>
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Selective Cleanup Preview & Execution Modal */}
      {isCleanupModalOpen && (
        <div className="modal-backdrop" onClick={() => !isExecutingCleanup && setIsCleanupModalOpen(false)}>
          <div className="modal-content" style={{ maxWidth: "620px" }} onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                <Trash2 size={18} color="var(--status-danger)" />
                <span style={{ fontWeight: 700, fontSize: "15px" }}>Selective Cleanup Preview</span>
              </div>
              {!isExecutingCleanup && (
                <button
                  onClick={() => setIsCleanupModalOpen(false)}
                  style={{ background: "none", border: "none", color: "var(--text-muted)", cursor: "pointer" }}
                >
                  <X size={18} />
                </button>
              )}
            </div>

            <div className="modal-body">
              {cleanupSummary ? (
                // Success / Summary View
                <div style={{ display: "flex", flexDirection: "column", gap: "14px", textAlign: "center", padding: "12px 0" }}>
                  <div style={{ width: "48px", height: "48px", borderRadius: "50%", background: "rgba(52, 211, 153, 0.15)", color: "var(--status-success)", display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto" }}>
                    <Sparkles size={24} />
                  </div>
                  <div style={{ fontSize: "16px", fontWeight: 700, color: "var(--text-primary)" }}>
                    Cleanup Executed Successfully
                  </div>
                  <div style={{ fontSize: "13px", color: "var(--text-secondary)" }}>
                    Freed <strong style={{ color: "var(--accent)" }}>{formatBytes(cleanupSummary.totalBytesFreed, 1)}</strong> across{" "}
                    {cleanupSummary.totalFilesRemoved} item{cleanupSummary.totalFilesRemoved === 1 ? "" : "s"}.
                  </div>
                  {cleanupSummary.failureCount > 0 && (
                    <div style={{ fontSize: "12px", color: "var(--status-warning)", marginTop: "6px" }}>
                      Notice: {cleanupSummary.failureCount} item could not be removed due to OS permission boundaries.
                    </div>
                  )}
                </div>
              ) : cleanupError ? (
                // Error View
                <div className="state-box" style={{ borderColor: "rgba(248, 113, 113, 0.3)" }}>
                  <AlertTriangle size={24} color="var(--status-danger)" />
                  <div className="state-title" style={{ color: "var(--status-danger)" }}>Validation Notice</div>
                  <div className="state-desc">{cleanupError}</div>
                </div>
              ) : !cleanupPreview ? (
                // Loading Preview
                <LoadingState title="Analyzing Cleanup Targets..." message="Checking permissions, measuring size, and validating system safety boundaries." />
              ) : (
                // Targets Preview List
                <>
                  <div style={{ fontSize: "13px", color: "var(--text-secondary)" }}>
                    Verify the targets below before confirming cleanup. System-protected locations and symlinks are protected.
                  </div>

                  {/* Target Items List */}
                  <div
                    style={{
                      maxHeight: "220px",
                      overflowY: "auto",
                      display: "flex",
                      flexDirection: "column",
                      gap: "6px",
                      background: "var(--bg-panel-subtle)",
                      padding: "8px",
                      borderRadius: "var(--radius-sm)",
                      border: "1px solid var(--border-subtle)",
                    }}
                  >
                    {cleanupPreview.targets.map((target) => (
                      <div
                        key={target.path}
                        style={{
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "space-between",
                          padding: "8px 10px",
                          borderRadius: "var(--radius-sm)",
                          backgroundColor: "var(--bg-card)",
                          border: "1px solid var(--border-subtle)",
                          fontSize: "12.5px",
                        }}
                      >
                        <div style={{ overflow: "hidden", paddingRight: "8px" }}>
                          <div style={{ fontWeight: 600, color: "var(--text-primary)", textOverflow: "ellipsis", overflow: "hidden", whiteSpace: "nowrap" }}>
                            {target.name}
                          </div>
                          <div style={{ fontSize: "11px", color: "var(--text-muted)", fontFamily: "'JetBrains Mono', monospace", textOverflow: "ellipsis", overflow: "hidden", whiteSpace: "nowrap" }}>
                            {target.path}
                          </div>
                          {target.ineligibilityReason && (
                            <div style={{ fontSize: "11px", color: "var(--status-danger)", marginTop: "2px" }}>
                              {target.ineligibilityReason}
                            </div>
                          )}
                        </div>

                        <div style={{ display: "flex", alignItems: "center", gap: "8px", flexShrink: 0 }}>
                          <span style={{ fontSize: "12px", color: "var(--text-secondary)", fontVariantNumeric: "tabular-nums" }}>
                            {formatBytes(target.sizeBytes, 1)}
                          </span>
                          <span
                            className="badge-tag"
                            style={{
                              backgroundColor: target.isEligible ? "rgba(52, 211, 153, 0.15)" : "rgba(248, 113, 113, 0.15)",
                              color: target.isEligible ? "var(--status-success)" : "var(--status-danger)",
                              border: target.isEligible ? "1px solid rgba(52, 211, 153, 0.3)" : "1px solid rgba(248, 113, 113, 0.3)",
                              fontSize: "11px",
                            }}
                          >
                            {target.isEligible ? "Eligible" : "Protected"}
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>

                  {/* Action Selection (Trash vs Permanent) */}
                  <div style={{ display: "flex", flexDirection: "column", gap: "10px", marginTop: "4px" }}>
                    <span style={{ fontWeight: 600, fontSize: "12.5px", color: "var(--text-primary)" }}>
                      Choose Cleanup Method:
                    </span>
                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "10px" }}>
                      <label
                        style={{
                          display: "flex",
                          alignItems: "center",
                          gap: "8px",
                          padding: "10px 14px",
                          borderRadius: "var(--radius-sm)",
                          border: cleanupAction === "trash" ? "1px solid var(--accent)" : "1px solid var(--border-subtle)",
                          backgroundColor: cleanupAction === "trash" ? "rgba(199, 243, 107, 0.08)" : "var(--bg-card)",
                          cursor: "pointer",
                          fontSize: "12.5px",
                        }}
                      >
                        <input
                          type="radio"
                          name="cleanupMethod"
                          checked={cleanupAction === "trash"}
                          onChange={() => setCleanupAction("trash")}
                          style={{ accentColor: "var(--accent)" }}
                        />
                        <div>
                          <strong style={{ display: "block", color: "var(--text-primary)" }}>Move to Trash</strong>
                          <span style={{ fontSize: "11px", color: "var(--text-muted)" }}>Safe recovery via Trash folder</span>
                        </div>
                      </label>

                      <label
                        style={{
                          display: "flex",
                          alignItems: "center",
                          gap: "8px",
                          padding: "10px 14px",
                          borderRadius: "var(--radius-sm)",
                          border: cleanupAction === "permanent_delete" ? "1px solid var(--status-danger)" : "1px solid var(--border-subtle)",
                          backgroundColor: cleanupAction === "permanent_delete" ? "rgba(248, 113, 113, 0.08)" : "var(--bg-card)",
                          cursor: "pointer",
                          fontSize: "12.5px",
                        }}
                      >
                        <input
                          type="radio"
                          name="cleanupMethod"
                          checked={cleanupAction === "permanent_delete"}
                          onChange={() => setCleanupAction("permanent_delete")}
                          style={{ accentColor: "var(--status-danger)" }}
                        />
                        <div>
                          <strong style={{ display: "block", color: "var(--status-danger)" }}>Permanent Deletion</strong>
                          <span style={{ fontSize: "11px", color: "var(--text-muted)" }}>Instant unrecoverable removal</span>
                        </div>
                      </label>
                    </div>

                    {cleanupAction === "permanent_delete" && (
                      <div style={{ background: "rgba(248, 113, 113, 0.1)", border: "1px solid rgba(248, 113, 113, 0.3)", padding: "10px 14px", borderRadius: "var(--radius-sm)", display: "flex", alignItems: "center", gap: "10px" }}>
                        <input
                          type="checkbox"
                          id="confirmPermDelete"
                          checked={confirmPermanentDelete}
                          onChange={(e) => setConfirmPermanentDelete(e.target.checked)}
                          style={{ accentColor: "var(--status-danger)", width: "16px", height: "16px" }}
                        />
                        <label htmlFor="confirmPermDelete" style={{ fontSize: "12px", color: "var(--status-danger)", cursor: "pointer" }}>
                          I understand that permanent deletion cannot be undone.
                        </label>
                      </div>
                    )}
                  </div>
                </>
              )}
            </div>

            <div className="modal-footer">
              {cleanupSummary ? (
                <button className="btn-primary" onClick={() => setIsCleanupModalOpen(false)}>
                  Done
                </button>
              ) : (
                <>
                  <button
                    className="btn-secondary"
                    onClick={() => setIsCleanupModalOpen(false)}
                    disabled={isExecutingCleanup}
                  >
                    Cancel
                  </button>

                  <button
                    className="btn-danger"
                    onClick={handleExecuteCleanup}
                    disabled={
                      !cleanupPreview ||
                      cleanupPreview.eligibleCount === 0 ||
                      isExecutingCleanup ||
                      (cleanupAction === "permanent_delete" && !confirmPermanentDelete)
                    }
                    style={{ fontSize: "12.5px", padding: "8px 18px" }}
                  >
                    {isExecutingCleanup ? (
                      <>
                        <RefreshCw size={13} className="spin-animation" style={{ animation: "spin 1s linear infinite" }} />
                        <span>Executing...</span>
                      </>
                    ) : (
                      <>
                        <Trash2 size={13} />
                        <span>
                          {cleanupAction === "trash" ? "Move to Trash" : "Permanently Delete"}{" "}
                          ({cleanupPreview ? formatBytes(cleanupPreview.totalEligibleBytes, 1) : ""})
                        </span>
                      </>
                    )}
                  </button>
                </>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
