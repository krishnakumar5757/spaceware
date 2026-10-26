import React from "react";
import { Info, Sparkles, CheckCircle2, ShieldAlert } from "lucide-react";

interface DemoBannerProps {
  isLiveData?: boolean;
  mountPoint?: string;
  filesystem?: string;
  totalFilesScanned?: number;
  permissionDeniedCount?: number;
}

export const DemoBanner: React.FC<DemoBannerProps> = ({
  isLiveData = false,
  mountPoint = "/home",
  filesystem = "Linux",
  totalFilesScanned = 0,
  permissionDeniedCount = 0,
}) => {
  if (isLiveData) {
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
              Displaying real measurements scanned by native Rust worker ({totalFilesScanned.toLocaleString()} files analyzed).
              {permissionDeniedCount > 0 && (
                <span style={{ color: "var(--status-warning)", marginLeft: "6px" }}>
                  ({permissionDeniedCount} restricted system folders skipped safely).
                </span>
              )}
            </div>
          </div>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
          {permissionDeniedCount > 0 && (
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
          )}
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

  return (
    <div className="demo-banner">
      <div className="demo-banner-content">
        <div className="demo-banner-icon">
          <Info size={18} />
        </div>
        <div>
          <div className="demo-banner-title">
            Milestone 2 Ready — Demo Storage Data Active
          </div>
          <div className="demo-banner-desc">
            Showing initial baseline storage. Click <strong>"Scan Storage"</strong> in the top header to run the real Linux filesystem scanner on your drive.
          </div>
        </div>
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
        <span className="badge-tag accent">
          <Sparkles size={12} /> Safe Dry-Run Mode
        </span>
      </div>
    </div>
  );
};
