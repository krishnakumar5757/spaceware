import React from "react";
import { HardDrive, PieChart, CheckCircle2, Sparkles } from "lucide-react";
import { StorageSummary } from "../../types/storage";
import { formatBytes } from "../../mock/storageData";

interface StorageMetricCardsProps {
  summary: StorageSummary;
}

export const StorageMetricCards: React.FC<StorageMetricCardsProps> = ({ summary }) => {
  const usedPercent = ((summary.usedBytes / summary.totalBytes) * 100).toFixed(1);
  const freePercent = ((summary.freeBytes / summary.totalBytes) * 100).toFixed(1);

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
        <div className="metric-card-value">{formatBytes(summary.totalBytes, 1)}</div>
        <div className="metric-card-footer">
          <span>{summary.driveName}</span>
          <span className="badge-tag">{summary.filesystem.split(" ")[0]}</span>
        </div>
      </div>

      {/* Used Storage Card */}
      <div className="metric-card">
        <div className="metric-card-top">
          <span className="metric-card-label">Used Storage</span>
          <div className="metric-card-icon">
            <PieChart size={16} />
          </div>
        </div>
        <div className="metric-card-value">{formatBytes(summary.usedBytes, 1)}</div>
        <div className="metric-card-footer">
          <span>Mount: {summary.mountPoint}</span>
          <span className="badge-tag info">{usedPercent}% Used</span>
        </div>
      </div>

      {/* Free Storage Card */}
      <div className="metric-card">
        <div className="metric-card-top">
          <span className="metric-card-label">Free Storage</span>
          <div className="metric-card-icon">
            <CheckCircle2 size={16} />
          </div>
        </div>
        <div className="metric-card-value">{formatBytes(summary.freeBytes, 1)}</div>
        <div className="metric-card-footer">
          <span>Available capacity</span>
          <span className="badge-tag success">{freePercent}% Free</span>
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
          {formatBytes(summary.reclaimableBytes, 1)}
        </div>
        <div className="metric-card-footer">
          <span>Estimated cleanable</span>
          <span className="badge-tag accent">5 Safe Recommendations</span>
        </div>
      </div>
    </div>
  );
};
