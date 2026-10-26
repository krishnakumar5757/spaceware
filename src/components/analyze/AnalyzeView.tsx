import React, { useState } from "react";
import {
  Folder,
  FolderOpen,
  ChevronRight,
  Filter,
  Search,
  HardDrive,
  FileText,
  ArrowLeft,
  RotateCcw,
} from "lucide-react";
import { DirectoryNode } from "../../types/storage";
import { mockDirectoryTree, formatBytes, formatNumber } from "../../mock/storageData";
import { EmptyState, LoadingState } from "../common/StateViews";
import { useScrollRevealContainer } from "../../hooks/useScrollReveal";
import { getMountedFilesystems } from "../../services/scannerService";

interface AnalyzeViewProps {
  directoryTree?: DirectoryNode;
  onSelectCleanup?: () => void;
}

export const AnalyzeView: React.FC<AnalyzeViewProps> = ({ directoryTree }) => {
  const containerRef = useScrollRevealContainer<HTMLDivElement>();

  // Navigation stack for drilldown
  const [currentFolder, setCurrentFolder] = useState<DirectoryNode>(
    directoryTree || mockDirectoryTree
  );
  const [navHistory, setNavHistory] = useState<DirectoryNode[]>([
    directoryTree || mockDirectoryTree,
  ]);
  const [selectedMount, setSelectedMount] = useState<string>("/home");
  const [sizeFilter, setSizeFilter] = useState<number>(0); // 0 = all, 100MB = 100*1024*1024, etc.
  const [searchQuery, setSearchQuery] = useState<string>("");
  const [isSimulatingScan, setIsSimulatingScan] = useState<boolean>(false);

  const [mountPoints, setMountPoints] = useState([
    { label: "/home (Btrfs NVMe)", path: "/home", size: "712.4 GB used" },
    { label: "/ (Root Btrfs)", path: "/", size: "84.2 GB used" },
    { label: "/mnt/storage (Ext4)", path: "/mnt/storage", size: "420.0 GB used" },
  ]);

  // Sync directory tree when real scan results are available
  React.useEffect(() => {
    if (directoryTree) {
      setCurrentFolder(directoryTree);
      setNavHistory([directoryTree]);
    }
  }, [directoryTree]);

  // Load real mounted filesystems on mount
  React.useEffect(() => {
    getMountedFilesystems()
      .then((realMounts) => {
        if (realMounts && realMounts.length > 0) {
          setMountPoints(
            realMounts.map((m) => ({
              label: `${m.mountPoint} (${m.fsType.toUpperCase()})`,
              path: m.mountPoint,
              size: `${formatBytes(m.usedBytes, 1)} used`,
            }))
          );
        }
      })
      .catch((err) => {
        console.warn("Could not query mounted filesystems for dropdown:", err);
      });
  }, []);

  // Drill down into a child folder
  const handleOpenFolder = (folder: DirectoryNode) => {
    if (folder.children && folder.children.length > 0) {
      setCurrentFolder(folder);
      setNavHistory((prev) => [...prev, folder]);
    }
  };

  // Navigate back to a specific breadcrumb level
  const handleJumpToHistory = (index: number) => {
    const target = navHistory[index];
    setCurrentFolder(target);
    setNavHistory((prev) => prev.slice(0, index + 1));
  };

  // Navigate up one level
  const handleGoUp = () => {
    if (navHistory.length > 1) {
      const newHistory = [...navHistory];
      newHistory.pop();
      const parent = newHistory[newHistory.length - 1];
      setCurrentFolder(parent);
      setNavHistory(newHistory);
    }
  };

  // Filter items in current folder
  const filteredChildren = (currentFolder.children || []).filter((item) => {
    const matchesQuery = item.name.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesSize = item.sizeBytes >= sizeFilter;
    return matchesQuery && matchesSize;
  });

  const handleSimulateRescan = () => {
    setIsSimulatingScan(true);
    setTimeout(() => {
      setIsSimulatingScan(false);
    }, 1200);
  };

  return (
    <div ref={containerRef} style={{ display: "flex", flexDirection: "column", gap: "20px" }}>
      {/* Top Controls Toolbar */}
      <div
        className="metric-card reveal-item"
        style={{
          flexDirection: "row",
          alignItems: "center",
          justifyContent: "space-between",
          flexWrap: "wrap",
          gap: "14px",
          padding: "16px 20px",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: "12px", flexWrap: "wrap" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "8px", fontSize: "13px" }}>
            <HardDrive size={16} color="var(--accent)" />
            <span style={{ fontWeight: 600 }}>Volume:</span>
          </div>

          <select
            value={selectedMount}
            onChange={(e) => {
              setSelectedMount(e.target.value);
              handleSimulateRescan();
            }}
            style={{
              backgroundColor: "var(--bg-panel-subtle)",
              color: "var(--text-primary)",
              border: "1px solid var(--border-subtle)",
              borderRadius: "var(--radius-sm)",
              padding: "6px 10px",
              fontSize: "13px",
              outline: "none",
              cursor: "pointer",
            }}
          >
            {mountPoints.map((m) => (
              <option key={m.path} value={m.path}>
                {m.label} — {m.size}
              </option>
            ))}
          </select>

          {/* Size Filter Dropdown */}
          <div style={{ display: "flex", alignItems: "center", gap: "6px", marginLeft: "12px" }}>
            <Filter size={14} color="var(--text-muted)" />
            <select
              value={sizeFilter}
              onChange={(e) => setSizeFilter(Number(e.target.value))}
              style={{
                backgroundColor: "var(--bg-panel-subtle)",
                color: "var(--text-primary)",
                border: "1px solid var(--border-subtle)",
                borderRadius: "var(--radius-sm)",
                padding: "6px 10px",
                fontSize: "13px",
                outline: "none",
                cursor: "pointer",
              }}
            >
              <option value={0}>All Sizes</option>
              <option value={100 * 1024 * 1024}>&gt; 100 MB</option>
              <option value={1024 * 1024 * 1024}>&gt; 1 GB</option>
              <option value={10 * 1024 * 1024 * 1024}>&gt; 10 GB</option>
              <option value={50 * 1024 * 1024 * 1024}>&gt; 50 GB</option>
            </select>
          </div>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
          <div className="search-input-box">
            <Search size={14} color="var(--text-muted)" />
            <input
              type="text"
              placeholder="Search in folder..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </div>

          <button
            className="btn-secondary"
            onClick={handleSimulateRescan}
            title="Re-index folder"
            style={{ padding: "6px 12px" }}
          >
            <RotateCcw size={13} />
            <span>Re-index</span>
          </button>
        </div>
      </div>

      {/* Breadcrumb Navigation Bar */}
      <div
        className="reveal-item"
        style={{
          display: "flex",
          alignItems: "center",
          gap: "8px",
          background: "var(--bg-panel)",
          border: "1px solid var(--border-subtle)",
          borderRadius: "var(--radius-md)",
          padding: "10px 16px",
          fontSize: "13px",
          flexWrap: "wrap",
        }}
      >
        <button
          className="btn-secondary"
          onClick={handleGoUp}
          disabled={navHistory.length <= 1}
          style={{ padding: "4px 8px", fontSize: "12px" }}
          title="Go to parent directory"
        >
          <ArrowLeft size={13} />
          <span>Up</span>
        </button>

        <div style={{ display: "flex", alignItems: "center", gap: "6px", flexWrap: "wrap", marginLeft: "6px" }}>
          {navHistory.map((node, index) => {
            const isLast = index === navHistory.length - 1;
            return (
              <React.Fragment key={node.id}>
                {index > 0 && <ChevronRight size={13} color="var(--text-muted)" />}
                <button
                  key={`crumb-${node.id}`}
                  onClick={() => handleJumpToHistory(index)}
                  className="breadcrumb-item-btn"
                  style={{
                    background: isLast ? "var(--accent-muted)" : "transparent",
                    color: isLast ? "var(--accent)" : "var(--text-secondary)",
                    border: isLast ? "1px solid var(--accent-border)" : "none",
                    borderRadius: "var(--radius-sm)",
                    padding: "3px 8px",
                    cursor: "pointer",
                    fontWeight: isLast ? 600 : 400,
                    fontSize: "12.5px",
                    display: "flex",
                    alignItems: "center",
                    gap: "5px",
                  }}
                >
                  {index === 0 ? <HardDrive size={13} /> : <Folder size={13} />}
                  <span>{node.name}</span>
                </button>
              </React.Fragment>
            );
          })}
        </div>

        <div style={{ marginLeft: "auto", fontSize: "12px", color: "var(--text-muted)" }}>
          Total in folder: <strong style={{ color: "var(--text-primary)" }}>{formatBytes(currentFolder.sizeBytes, 1)}</strong>
        </div>
      </div>

      {/* Directory Content List */}
      {isSimulatingScan ? (
        <LoadingState
          title={`Indexing ${currentFolder.path}...`}
          message="Calculating child directory tree allocations and extents."
        />
      ) : filteredChildren.length === 0 ? (
        <EmptyState
          title="No items matching filters"
          message={`No subdirectories in ${currentFolder.name} matched size threshold or query "${searchQuery}".`}
          actionLabel="Reset Filters"
          onAction={() => {
            setSearchQuery("");
            setSizeFilter(0);
          }}
        />
      ) : (
        <div className="files-panel reveal-item" style={{ padding: "0" }}>
          <div className="data-table-container" style={{ border: "none" }}>
            <table className="spacewise-table">
              <thead>
                <tr>
                  <th style={{ width: "40%" }}>Name</th>
                  <th style={{ width: "25%" }}>Allocation vs Parent</th>
                  <th style={{ width: "15%" }}>Files</th>
                  <th style={{ width: "15%", textAlign: "right" }}>Total Size</th>
                  <th style={{ width: "5%" }}></th>
                </tr>
              </thead>
              <tbody>
                {filteredChildren.map((item) => {
                  const percentOfCurrent = (item.sizeBytes / currentFolder.sizeBytes) * 100;
                  const hasChildren = item.children && item.children.length > 0;

                  return (
                    <tr
                      key={item.id}
                      style={{ cursor: hasChildren ? "pointer" : "default" }}
                      onClick={() => hasChildren && handleOpenFolder(item)}
                    >
                      <td>
                        <div className="table-file-cell">
                          <div
                            className="file-icon-box"
                            style={{
                              color: hasChildren ? "var(--accent)" : "var(--text-secondary)",
                              backgroundColor: hasChildren ? "var(--accent-muted)" : "var(--bg-panel-subtle)",
                            }}
                          >
                            {hasChildren ? <FolderOpen size={16} /> : <FileText size={16} />}
                          </div>
                          <div className="file-name-meta">
                            <span className="file-name-text">{item.name}</span>
                            <span className="file-path-subtle">{item.path}</span>
                          </div>
                        </div>
                      </td>

                      <td>
                        <div style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
                          <div style={{ display: "flex", justifyContent: "space-between", fontSize: "11px", color: "var(--text-muted)" }}>
                            <span>{percentOfCurrent.toFixed(1)}% of parent</span>
                          </div>
                          <div className="category-progress-track">
                            <div
                              className="category-progress-fill"
                              style={{
                                width: `${percentOfCurrent}%`,
                                backgroundColor:
                                  percentOfCurrent > 40
                                    ? "var(--accent)"
                                    : percentOfCurrent > 20
                                    ? "#38BDF8"
                                    : "#A78BFA",
                              }}
                            />
                          </div>
                        </div>
                      </td>

                      <td>
                        <span style={{ fontSize: "12px", color: "var(--text-secondary)" }}>
                          {item.fileCount ? `${formatNumber(item.fileCount)} files` : "—"}
                        </span>
                      </td>

                      <td style={{ textAlign: "right" }}>
                        <span className="table-size-badge" style={{ fontSize: "13.5px" }}>
                          {formatBytes(item.sizeBytes, 1)}
                        </span>
                      </td>

                      <td style={{ textAlign: "right" }}>
                        {hasChildren ? (
                          <ChevronRight size={16} color="var(--text-muted)" />
                        ) : null}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
};
