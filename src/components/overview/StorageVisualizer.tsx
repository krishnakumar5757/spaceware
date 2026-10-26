import React, { useState } from "react";
import { BarChart3, Layers } from "lucide-react";
import { StorageCategory, StorageSummary } from "../../types/storage";
import { formatBytes } from "../../mock/storageData";

interface StorageVisualizerProps {
  summary: StorageSummary;
  categories: StorageCategory[];
  onSelectCategory?: (categoryId: string) => void;
  hasCompletedScan?: boolean;
  onTriggerScan?: () => void;
}

export const StorageVisualizer: React.FC<StorageVisualizerProps> = ({
  summary,
  categories,
  onSelectCategory,
  hasCompletedScan = false,
  onTriggerScan,
}) => {
  const [activeCategory, setActiveCategory] = useState<string | null>(null);

  const total = summary.totalBytes > 0 ? summary.totalBytes : 1;
  const availBytes =
    typeof summary.availableBytes === "number" && summary.availableBytes > 0
      ? summary.availableBytes
      : summary.freeBytes;
  const freePercentage = Math.min(100, Math.max(0, (availBytes / total) * 100));
  const usedPercentage = Math.min(100, Math.max(0, (summary.usedBytes / total) * 100));

  const hasCategories = categories.length > 0;

  return (
    <div className="visualizer-panel reveal-item">
      <div className="visualizer-header">
        <div className="panel-title-group">
          <div className="panel-title">
            <BarChart3 size={18} color="var(--accent)" />
            <span>Capacity & Partition Distribution</span>
          </div>
          <span className="panel-subtitle">
            {hasCategories
              ? `Visual allocation of ${formatBytes(summary.totalBytes, 1)} across system categories and free space`
              : `Filesystem allocation of ${formatBytes(summary.totalBytes, 1)} on ${summary.mountPoint} (directory breakdown not scanned yet)`}
          </span>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: "10px", fontSize: "12px", color: "var(--text-secondary)" }}>
          <span style={{ display: "flex", alignItems: "center", gap: "4px" }}>
            <Layers size={13} color="var(--accent)" /> {summary.mountPoint} ({summary.filesystem.split(" ")[0]})
          </span>
        </div>
      </div>

      {/* Multi-Segment Storage Bar */}
      <div className="storage-bar-wrapper">
        {hasCategories ? (
          categories.map((cat) => {
            const widthPercent = (cat.sizeBytes / total) * 100;
            const isHighlighted = activeCategory === null || activeCategory === cat.id;

            return (
              <div
                key={cat.id}
                className="storage-bar-segment"
                style={{
                  width: `${widthPercent}%`,
                  backgroundColor: cat.color,
                  opacity: isHighlighted ? 1 : 0.35,
                }}
                title={`${cat.name}: ${formatBytes(cat.sizeBytes, 1)} (${widthPercent.toFixed(1)}% of total)`}
                onMouseEnter={() => setActiveCategory(cat.id)}
                onMouseLeave={() => setActiveCategory(null)}
                onClick={() => onSelectCategory && onSelectCategory(cat.id)}
              />
            );
          })
        ) : (
          /* When directory scan not run yet, render filesystem-level allocation from statvfs */
          <div
            className="storage-bar-segment"
            style={{
              width: `${usedPercentage}%`,
              backgroundColor: "rgba(199, 243, 107, 0.4)",
              borderRight: "1px solid var(--accent)",
              opacity: activeCategory === null || activeCategory === "used" ? 1 : 0.35,
            }}
            title={`Used Capacity: ${formatBytes(summary.usedBytes, 1)} (${usedPercentage.toFixed(1)}%)`}
            onMouseEnter={() => setActiveCategory("used")}
            onMouseLeave={() => setActiveCategory(null)}
          />
        )}

        {/* Free Space Segment */}
        <div
          className="storage-bar-segment free-space"
          style={{
            width: `${freePercentage}%`,
            opacity: activeCategory === null || activeCategory === "free" ? 1 : 0.35,
          }}
          title={`Available Free Space: ${formatBytes(availBytes, 1)} (${freePercentage.toFixed(1)}%)`}
          onMouseEnter={() => setActiveCategory("free")}
          onMouseLeave={() => setActiveCategory(null)}
        />
      </div>

      {/* Visualizer Legend Pills */}
      <div className="visualizer-legend">
        {hasCategories ? (
          categories.map((cat) => {
            const percentOfDrive = ((cat.sizeBytes / total) * 100).toFixed(1);
            const isActive = activeCategory === cat.id;

            return (
              <div
                key={cat.id}
                className={`legend-pill ${isActive ? "active" : ""}`}
                onMouseEnter={() => setActiveCategory(cat.id)}
                onMouseLeave={() => setActiveCategory(null)}
                onClick={() => onSelectCategory && onSelectCategory(cat.id)}
              >
                <div
                  className="legend-swatch"
                  style={{ backgroundColor: cat.color }}
                />
                <span className="legend-name">{cat.name}</span>
                <span className="legend-size">{formatBytes(cat.sizeBytes, 1)}</span>
                <span className="legend-percent">{percentOfDrive}%</span>
              </div>
            );
          })
        ) : (
          <>
            <div
              className={`legend-pill ${activeCategory === "used" ? "active" : ""}`}
              onMouseEnter={() => setActiveCategory("used")}
              onMouseLeave={() => setActiveCategory(null)}
            >
              <div
                className="legend-swatch"
                style={{ backgroundColor: "rgba(199, 243, 107, 0.6)" }}
              />
              <span className="legend-name">Used Capacity</span>
              <span className="legend-size">{formatBytes(summary.usedBytes, 1)}</span>
              <span className="legend-percent">{usedPercentage.toFixed(1)}%</span>
            </div>

            <div
              className={`legend-pill ${activeCategory === "free" ? "active" : ""}`}
              onMouseEnter={() => setActiveCategory("free")}
              onMouseLeave={() => setActiveCategory(null)}
            >
              <div
                className="legend-swatch"
                style={{
                  backgroundColor: "rgba(255, 255, 255, 0.2)",
                  border: "1px dashed rgba(255, 255, 255, 0.4)",
                }}
              />
              <span className="legend-name">Available Free Space</span>
              <span className="legend-size">{formatBytes(availBytes, 1)}</span>
              <span className="legend-percent">{freePercentage.toFixed(1)}%</span>
            </div>

            {!hasCompletedScan && onTriggerScan && (
              <button
                className="btn-secondary"
                onClick={onTriggerScan}
                style={{ marginLeft: "auto", fontSize: "11px", padding: "4px 10px" }}
              >
                Run Scan to Analyze Categories
              </button>
            )}
          </>
        )}

        {hasCategories && (
          <div
            className={`legend-pill ${activeCategory === "free" ? "active" : ""}`}
            onMouseEnter={() => setActiveCategory("free")}
            onMouseLeave={() => setActiveCategory(null)}
          >
            <div
              className="legend-swatch"
              style={{
                backgroundColor: "rgba(255, 255, 255, 0.2)",
                border: "1px dashed rgba(255, 255, 255, 0.4)",
              }}
            />
            <span className="legend-name">Available Free Space</span>
            <span className="legend-size">{formatBytes(availBytes, 1)}</span>
            <span className="legend-percent">{freePercentage.toFixed(1)}%</span>
          </div>
        )}
      </div>
    </div>
  );
};
