import React from "react";
import { HardDrive, PieChart, CheckCircle2, Sparkles } from "lucide-react";
import { StorageSummary } from "../../types/storage";
import { formatBytes } from "../../mock/storageData";

interface StorageMetricCardsProps {
  summary: StorageSummary;
  hasCompletedScan?: boolean;
  recommendationsCount?: number;
}

export const StorageMetricCards: React.FC<StorageMetricCardsProps> = ({
  summary,
  hasCompletedScan = false,
  recommendationsCount = 0,
}) => {
  const total = summary.totalBytes > 0 ? summary.totalBytes : 1;
  const usedPercent = ((summary.usedBytes / total) * 100).toFixed(1);

  // Use actual backend available capacity from statvfs f_bavail
  const availableBytes =
    typeof summary.availableBytes === "number" && summary.availableBytes > 0
      ? summary.availableBytes
      : summary.freeBytes;
  const availablePercent = ((availableBytes / total) * 100).toFixed(1);

  const fsDisplay = summary.filesystem ? summary.filesystem.split(" ")[0] : "Filesystem";
  const deviceDisplay = summary.driveName.startsWith("/dev/")
    ? summary.driveName.replace("/dev/", "")
    : summary.driveName;

  return (
    <div className="metric-cards-grid stagger-container">
      {/* Total Storage Card */}
      <div className="metric-card">
        <div className="metric-card-top">
          <span className="metric-card-label">Total Storage</span>
          <div className="metric-card-icon">
            <HardDrive size={16} />
          </div>
        </div>
        <div className="metric-card-value">
          {summary.totalBytes > 0 ? formatBytes(summary.totalBytes, 1) : "—"}
        </div>
        <div className="metric-card-footer">
          <span>Mount: {summary.mountPoint || "/"}</span>
          <span className="badge-tag" title={summary.driveName}>
            {deviceDisplay} ({fsDisplay})
          </span>
        </div>
      </div>

      {/* Used Storage Card (from native filesystem statvfs statistics) */}
      <div className="metric-card">
        <div className="metric-card-top">
          <span className="metric-card-label">Used Storage</span>
          <div className="metric-card-icon">
            <PieChart size={16} />
          </div>
        </div>
        <div className="metric-card-value">
          {summary.totalBytes > 0 ? formatBytes(summary.usedBytes, 1) : "—"}
        </div>
        <div className="metric-card-footer">
          <span>Mount: {summary.mountPoint || "/"}</span>
          <span className="badge-tag info">
            {summary.totalBytes > 0 ? `${usedPercent}% Used` : "Statvfs"}
          </span>
        </div>
      </div>

      {/* Available Storage Card (from backend's actual available-block statvfs f_bavail) */}
      <div className="metric-card">
        <div className="metric-card-top">
          <span className="metric-card-label">Available Storage</span>
          <div className="metric-card-icon">
            <CheckCircle2 size={16} />
          </div>
        </div>
        <div className="metric-card-value">
          {summary.totalBytes > 0 ? formatBytes(availableBytes, 1) : "—"}
        </div>
        <div className="metric-card-footer">
          <span>Available on {summary.mountPoint || "/"}</span>
          <span className="badge-tag success">
            {summary.totalBytes > 0 ? `${availablePercent}% Free` : "Statvfs"}
          </span>
        </div>
      </div>

      {/* Reclaimable Space Card - Highlighted with Accent #C7F36B */}
      <div className="metric-card accent-highlight">
        <div className="metric-card-top">
          <span className="metric-card-label" style={{ color: "var(--accent)" }}>
            Reclaimable Space
          </span>
          <div className="metric-card-icon">
            <Sparkles size={16} />
          </div>
        </div>
        <div className="metric-card-value" style={{ color: "var(--accent)" }}>
          {hasCompletedScan
            ? formatBytes(summary.reclaimableBytes, 1)
            : "—"}
        </div>
        <div className="metric-card-footer">
          <span>{hasCompletedScan ? `Target: ${summary.mountPoint || "/"}` : "Not scanned yet"}</span>
          <span className="badge-tag accent">
            {hasCompletedScan
              ? `${recommendationsCount} Candidate${recommendationsCount === 1 ? "" : "s"}`
              : "Scan Required"}
          </span>
        </div>
      </div>
    </div>
  );
};
