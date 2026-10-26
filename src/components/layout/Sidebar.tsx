import React from "react";
import {
  LayoutDashboard,
  Search,
  Sparkles,
  Settings,
  HardDrive,
  Layers,
} from "lucide-react";
import { NavigationTab, StorageSummary } from "../../types/storage";
import { formatBytes } from "../../mock/storageData";

interface SidebarProps {
  currentTab: NavigationTab;
  onSelectTab: (tab: NavigationTab) => void;
  storageSummary: StorageSummary;
  isDemoMode?: boolean;
  hasCompletedScan?: boolean;
}

export const Sidebar: React.FC<SidebarProps> = ({
  currentTab,
  onSelectTab,
  storageSummary,
  isDemoMode = false,
  hasCompletedScan = false,
}) => {
  const total = storageSummary.totalBytes > 0 ? storageSummary.totalBytes : 1;
  const usedPercent = Math.min(
    100,
    Math.round((storageSummary.usedBytes / total) * 100)
  );

  const availBytes =
    typeof storageSummary.availableBytes === "number" && storageSummary.availableBytes > 0
      ? storageSummary.availableBytes
      : storageSummary.freeBytes;

  return (
    <aside className="sidebar">
      <div>
        <div className="sidebar-header">
          <div className="brand-wrapper">
            <div className="brand-icon-box">
              <HardDrive size={20} strokeWidth={2.3} />
            </div>
            <div className="brand-info">
              <span className="brand-title">
                Spacewise
                {isDemoMode ? (
                  <span className="badge-demo">Demo</span>
                ) : storageSummary.isLiveData ? (
                  <span
                    className="badge-demo"
                    style={{
                      background: "rgba(199, 243, 107, 0.15)",
                      color: "var(--accent)",
                      borderColor: "rgba(199, 243, 107, 0.3)",
                    }}
                  >
                    Live
                  </span>
                ) : null}
              </span>
              <span className="brand-subtitle">Disk Storage Manager</span>
            </div>
          </div>
        </div>

        <nav className="sidebar-nav">
          <span className="nav-section-label">Workspace</span>

          <button
            id="nav-overview"
            className={`nav-item ${currentTab === "overview" ? "active" : ""}`}
            onClick={() => onSelectTab("overview")}
          >
            <LayoutDashboard size={18} className="nav-icon" />
            <span className="nav-label">Overview</span>
          </button>

          <button
            id="nav-analyze"
            className={`nav-item ${currentTab === "analyze" ? "active" : ""}`}
            onClick={() => onSelectTab("analyze")}
          >
            <Search size={18} className="nav-icon" />
            <span className="nav-label">Analyze</span>
            <span className="nav-badge">Files</span>
          </button>

          <button
            id="nav-cleanup"
            className={`nav-item ${currentTab === "cleanup" ? "active" : ""}`}
            onClick={() => onSelectTab("cleanup")}
          >
            <Sparkles size={18} className="nav-icon" />
            <span className="nav-label">Cleanup</span>
            <span className="nav-badge accent">
              {hasCompletedScan
                ? formatBytes(storageSummary.reclaimableBytes, 0)
                : "—"}
            </span>
          </button>

          <span className="nav-section-label" style={{ marginTop: "12px" }}>
            Preferences
          </span>

          <button
            id="nav-settings"
            className={`nav-item ${currentTab === "settings" ? "active" : ""}`}
            onClick={() => onSelectTab("settings")}
          >
            <Settings size={18} className="nav-icon" />
            <span className="nav-label">Settings</span>
          </button>
        </nav>
      </div>

      <div className="sidebar-footer">
        <div className="sidebar-disk-widget">
          <div className="disk-widget-header">
            <span style={{ display: "flex", alignItems: "center", gap: "6px" }}>
              <Layers size={12} color="var(--accent)" />
              {storageSummary.mountPoint} ({storageSummary.filesystem.split(" ")[0]})
            </span>
            <span style={{ fontWeight: 600, color: "var(--text-primary)" }}>
              {usedPercent}%
            </span>
          </div>

          <div className="disk-widget-bar">
            <div
              className="disk-widget-fill"
              style={{ width: `${usedPercent}%` }}
            />
          </div>

          <div className="disk-widget-footer">
            <span>{formatBytes(storageSummary.usedBytes, 0)} used</span>
            <span>{formatBytes(availBytes, 0)} free</span>
          </div>
        </div>

        <div className="sidebar-system-tag">
          <div className="system-status-dot" />
          <span>CachyOS Linux (znver4)</span>
        </div>
      </div>
    </aside>
  );
};
