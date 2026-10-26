import React from "react";
import {
  Info,
  Sparkles,
  CheckCircle2,
  ShieldAlert,
  AlertTriangle,
  RefreshCw,
  Layers,
} from "lucide-react";
import { AppScanState } from "../../types/storage";
import { formatBytes } from "../../mock/storageData";

interface DemoBannerProps {
  scanState?: AppScanState;
  isDemoMode?: boolean;
  isLiveData?: boolean;
  mountPoint?: string;
  filesystem?: string;
  totalBytes?: number;
  usedBytes?: number;
  totalFilesScanned?: number;
  permissionDeniedCount?: number;
  scanDurationMs?: number;
  errorMessage?: string | null;
  onTriggerScan?: () => void;
  onRetry?: () => void;
}

export const DemoBanner: React.FC<DemoBannerProps> = ({
  scanState = "ready",
  isDemoMode = false,
  isLiveData = false,
  mountPoint = "/home",
  filesystem = "Linux",
  totalBytes = 0,
  usedBytes = 0,
  totalFilesScanned = 0,
  permissionDeniedCount = 0,
  scanDurationMs = 0,
  errorMessage,
  onTriggerScan,
  onRetry,
}) => {
  // Explicit Demo Mode
  if (isDemoMode) {
    return (
      <div
        className="demo-banner"
        style={{
          borderLeftColor: "var(--accent)",
          borderColor: "rgba(199, 243, 107, 0.3)",
          background: "linear-gradient(90deg, rgba(35, 38, 30, 0.95) 0%, rgba(28, 32, 26, 0.95) 100%)",
        }}
      >
        <div className="demo-banner-content">
          <div className="demo-banner-icon" style={{ color: "var(--accent)" }}>
            <Sparkles size={18} />
          </div>
          <div>
            <div className="demo-banner-title" style={{ color: "var(--accent)" }}>
              Demo Mode Active — Preview Fixtures Only
            </div>
            <div className="demo-banner-desc">
              Displaying hardcoded development fixtures. Cleanup execution is disabled. Click{" "}
              <strong>"Scan Storage"</strong> or toggle Demo Mode in Settings to query your real Linux filesystem.
            </div>
          </div>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
          <span className="badge-tag accent">
            <Sparkles size={12} /> Demo Fixture
          </span>
          {onTriggerScan && (
            <button
              className="btn-primary"
              onClick={onTriggerScan}
              style={{ fontSize: "12px", padding: "5px 12px" }}
            >
              <RefreshCw size={12} />
              <span>Run Real Scan</span>
            </button>
          )}
        </div>
      </div>
    );
  }

  // Filesystem or Scan Error
  if (scanState === "no_filesystem" || scanState === "failed") {
    return (
      <div
        className="demo-banner"
        style={{
          borderLeftColor: "var(--status-danger)",
          borderColor: "rgba(248, 113, 113, 0.3)",
          background: "linear-gradient(90deg, rgba(38, 25, 25, 0.95) 0%, rgba(30, 22, 22, 0.95) 100%)",
        }}
      >
        <div className="demo-banner-content">
          <div className="demo-banner-icon" style={{ color: "var(--status-danger)" }}>
            <AlertTriangle size={18} />
          </div>
          <div>
            <div className="demo-banner-title" style={{ color: "var(--status-danger)" }}>
              {scanState === "no_filesystem"
                ? `Filesystem Mount Inaccessible: ${mountPoint}`
                : "Storage Scan Failed"}
            </div>
            <div className="demo-banner-desc">
              {errorMessage ||
                "Failed to query filesystem storage statistics from Linux kernel. Mock data was not substituted."}
            </div>
          </div>
        </div>
        {onRetry && (
          <button
            className="btn-secondary"
            onClick={onRetry}
            style={{ fontSize: "12px", padding: "6px 14px", color: "var(--status-danger)" }}
          >
            <RefreshCw size={13} />
            <span>Retry</span>
          </button>
        )}
      </div>
    );
  }

  // Initializing state
  if (scanState === "initializing") {
    return (
      <div className="demo-banner">
        <div className="demo-banner-content">
          <div className="demo-banner-icon" style={{ color: "var(--accent)" }}>
            <RefreshCw size={18} className="spin-animation" style={{ animation: "spin 1s linear infinite" }} />
          </div>
          <div>
            <div className="demo-banner-title">
              Detecting Native Storage Volumes...
            </div>
            <div className="demo-banner-desc">
              Querying Linux mounted filesystems and statvfs capacity blocks.
            </div>
          </div>
        </div>
      </div>
    );
  }

  // Live scan completed with permission warnings
  if (scanState === "completed_with_errors") {
    return (
      <div
        className="demo-banner"
        style={{
          borderLeftColor: "var(--status-warning)",
          borderColor: "rgba(251, 191, 36, 0.3)",
          background: "linear-gradient(90deg, rgba(36, 33, 24, 0.95) 0%, rgba(29, 27, 20, 0.95) 100%)",
        }}
      >
        <div className="demo-banner-content">
          <div className="demo-banner-icon" style={{ color: "var(--status-warning)" }}>
            <ShieldAlert size={18} />
          </div>
          <div>
            <div className="demo-banner-title" style={{ color: "#FFFFFF" }}>
              Live Scan Completed with Permission Notices — {mountPoint} ({filesystem})
            </div>
            <div className="demo-banner-desc">
              Indexed {totalFilesScanned.toLocaleString()} files.{" "}
              <strong style={{ color: "var(--status-warning)" }}>
                {permissionDeniedCount} restricted system folders were skipped safely
              </strong>{" "}
              without modification. Directory allocations reflect accessible files.
            </div>
          </div>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
          <span
            className="badge-tag"
            style={{
              background: "rgba(251, 191, 36, 0.12)",
              color: "var(--status-warning)",
              border: "1px solid rgba(251, 191, 36, 0.3)",
            }}
          >
            <ShieldAlert size={12} /> {permissionDeniedCount} Skipped
          </span>
          <span
            className="badge-tag"
            style={{
              background: "rgba(52, 211, 153, 0.15)",
              color: "var(--status-success)",
              border: "1px solid rgba(52, 211, 153, 0.3)",
            }}
          >
            <CheckCircle2 size={12} /> Real Measurements
          </span>
        </div>
      </div>
    );
  }

  // Live scan completed clean
  if (scanState === "completed" || (isLiveData && totalFilesScanned > 0)) {
    return (
      <div
        className="demo-banner"
        style={{
          borderLeftColor: "var(--status-success)",
          borderColor: "rgba(52, 211, 153, 0.3)",
          background: "linear-gradient(90deg, rgba(29, 36, 32, 0.95) 0%, rgba(24, 30, 27, 0.95) 100%)",
        }}
      >
        <div className="demo-banner-content">
          <div className="demo-banner-icon" style={{ color: "var(--status-success)" }}>
            <CheckCircle2 size={18} />
          </div>
          <div>
            <div className="demo-banner-title" style={{ color: "#FFFFFF" }}>
              Live Linux Filesystem Scan Active — {mountPoint} ({filesystem})
            </div>
            <div className="demo-banner-desc">
              Displaying real measurements scanned by native Rust worker ({totalFilesScanned.toLocaleString()} files analyzed
              {scanDurationMs > 0 ? ` in ${(scanDurationMs / 1000).toFixed(1)}s` : ""}).
              <span style={{ display: "block", color: "var(--text-muted)", fontSize: "11px", marginTop: "2px" }}>
                Directory scan reflects accessible user files; filesystem cards reflect native statvfs allocation.
              </span>
            </div>
          </div>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
          <span
            className="badge-tag"
            style={{
              background: "rgba(52, 211, 153, 0.15)",
              color: "var(--status-success)",
              border: "1px solid rgba(52, 211, 153, 0.3)",
            }}
          >
            <CheckCircle2 size={12} /> Real Measurements
          </span>
        </div>
      </div>
    );
  }

  // Ready state: Initial storage summary loaded from statvfs, directory scan not yet executed
  return (
    <div
      className="demo-banner"
      style={{
        borderLeftColor: "var(--accent)",
        borderColor: "rgba(199, 243, 107, 0.25)",
        background: "linear-gradient(90deg, rgba(30, 34, 38, 0.95) 0%, rgba(24, 27, 32, 0.95) 100%)",
      }}
    >
      <div className="demo-banner-content">
        <div className="demo-banner-icon" style={{ color: "var(--accent)" }}>
          <Layers size={18} />
        </div>
        <div>
          <div className="demo-banner-title" style={{ color: "#FFFFFF" }}>
            Mounted Storage Detected — {mountPoint} ({filesystem})
          </div>
          <div className="demo-banner-desc">
            Showing real filesystem capacity ({formatBytes(usedBytes, 1)} used of {formatBytes(totalBytes, 1)}).
            Directory usage breakdown and largest files have not been scanned yet. Click{" "}
            <strong>"Scan Storage"</strong> to analyze your drive.
          </div>
        </div>
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
        <span
          className="badge-tag"
          style={{
            background: "rgba(56, 189, 248, 0.15)",
            color: "#38BDF8",
            border: "1px solid rgba(56, 189, 248, 0.3)",
          }}
        >
          <Info size={12} /> Ready to Scan
        </span>
        <span
          className="badge-tag"
          style={{
            background: "rgba(52, 211, 153, 0.15)",
            color: "var(--status-success)",
            border: "1px solid rgba(52, 211, 153, 0.3)",
          }}
        >
          <CheckCircle2 size={12} /> Live Mount
        </span>
      </div>
    </div>
  );
};
