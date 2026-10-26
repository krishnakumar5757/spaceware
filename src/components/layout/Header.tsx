import React from "react";
import { RefreshCw, Clock } from "lucide-react";
import { NavigationTab, ScanStatus } from "../../types/storage";

interface HeaderProps {
  currentTab: NavigationTab;
  scanStatus: ScanStatus;
  onTriggerScan: () => void;
  onCancelScan?: () => void;
}

const TAB_TITLES: Record<NavigationTab, { title: string; subtitle: string }> = {
  overview: {
    title: "Storage Overview",
    subtitle: "High-level capacity, usage distribution, and actionable cleanup insights",
  },
  analyze: {
    title: "Detailed Storage Analysis",
    subtitle: "Deep-dive into folders, tree hierarchies, and file size distributions",
  },
  cleanup: {
    title: "Disk Space Cleanup",
    subtitle: "Review system caches, dev artifacts, and safely simulate space reclamation",
  },
  settings: {
    title: "Application Settings",
    subtitle: "Configure filesystem scanning thresholds, exclusions, and display modes",
  },
};

export const Header: React.FC<HeaderProps> = ({
  currentTab,
  scanStatus,
  onTriggerScan,
  onCancelScan,
}) => {
  const meta = TAB_TITLES[currentTab];

  return (
    <header className="top-header">
      <div className="header-title-section" key={currentTab}>
        <div className="header-breadcrumbs">
          <span>Spacewise</span>
          <span>/</span>
          <span style={{ color: "var(--text-secondary)", textTransform: "capitalize" }}>
            {currentTab}
          </span>
        </div>
        <h1 className="header-title">{meta.title}</h1>
      </div>

      <div className="header-actions">
        <div className="scan-status-pill">
          {scanStatus.isScanning ? (
            <>
              <RefreshCw
                size={14}
                className="spin-animation"
                style={{
                  color: "var(--accent)",
                  animation: "spin 1s linear infinite",
                  flexShrink: 0,
                }}
              />
              <span
                style={{
                  color: "var(--accent)",
                  fontWeight: 500,
                  maxWidth: "280px",
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  whiteSpace: "nowrap",
                }}
              >
                {scanStatus.filesScannedCount > 0
                  ? `Scanning (${scanStatus.filesScannedCount.toLocaleString()} files): ${scanStatus.currentPath}`
                  : `Scanning ${scanStatus.progressPercent}%: ${scanStatus.currentPath}`}
              </span>
            </>
          ) : (
            <>
              <div
                className="pulse-indicator"
                style={{
                  backgroundColor: scanStatus.isLiveData
                    ? "var(--status-success)"
                    : "var(--accent)",
                }}
              />
              <span style={{ display: "flex", alignItems: "center", gap: "5px" }}>
                <Clock size={12} color="var(--text-muted)" />
                {scanStatus.isLiveData ? "Live scan" : "Demo"}: {scanStatus.lastCompleted}
              </span>
            </>
          )}
        </div>

        {scanStatus.isScanning ? (
          <button
            id="btn-cancel-scan"
            className="btn-secondary"
            onClick={onCancelScan}
            style={{
              padding: "8px 16px",
              borderColor: "rgba(239, 68, 68, 0.4)",
              color: "#EF4444",
            }}
          >
            <span>Cancel</span>
          </button>
        ) : (
          <button
            id="btn-scan-storage"
            className="btn-primary"
            onClick={onTriggerScan}
            disabled={scanStatus.isScanning}
          >
            <RefreshCw
              size={15}
              style={{
                animation: scanStatus.isScanning ? "spin 1s linear infinite" : "none",
              }}
            />
            <span>Scan Storage</span>
          </button>
        )}
      </div>
    </header>
  );
};
