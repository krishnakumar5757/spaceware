import React, { useState } from "react";
import { BarChart3, Layers } from "lucide-react";
import { StorageCategory, StorageSummary } from "../../types/storage";
import { formatBytes } from "../../mock/storageData";

interface StorageVisualizerProps {
  summary: StorageSummary;
  categories: StorageCategory[];
  onSelectCategory?: (categoryId: string) => void;
}

export const StorageVisualizer: React.FC<StorageVisualizerProps> = ({
  summary,
  categories,
  onSelectCategory,
}) => {
  const [activeCategory, setActiveCategory] = useState<string | null>(null);

  const freePercentage = (summary.freeBytes / summary.totalBytes) * 100;

  return (
    <div className="visualizer-panel reveal-item">
      <div className="visualizer-header">
        <div className="panel-title-group">
          <div className="panel-title">
            <BarChart3 size={18} color="var(--accent)" />
            <span>Capacity & Partition Distribution</span>
          </div>
          <span className="panel-subtitle">
            Visual allocation of {formatBytes(summary.totalBytes, 1)} across system categories and free space
          </span>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: "10px", fontSize: "12px", color: "var(--text-secondary)" }}>
          <span style={{ display: "flex", alignItems: "center", gap: "4px" }}>
            <Layers size={13} color="var(--accent)" /> Btrfs Subvolume: /home
          </span>
        </div>
      </div>

      {/* Multi-Segment Storage Bar */}
      <div className="storage-bar-wrapper">
        {categories.map((cat) => {
          const widthPercent = (cat.sizeBytes / summary.totalBytes) * 100;
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
        })}

        {/* Free Space Segment */}
        <div
          className="storage-bar-segment free-space"
          style={{
            width: `${freePercentage}%`,
            opacity: activeCategory === null || activeCategory === "free" ? 1 : 0.35,
          }}
          title={`Free Space: ${formatBytes(summary.freeBytes, 1)} (${freePercentage.toFixed(1)}%)`}
          onMouseEnter={() => setActiveCategory("free")}
          onMouseLeave={() => setActiveCategory(null)}
        />
      </div>

      {/* Visualizer Legend Pills */}
      <div className="visualizer-legend">
        {categories.map((cat) => {
          const percentOfDrive = ((cat.sizeBytes / summary.totalBytes) * 100).toFixed(1);
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
        })}

        {/* Free Space Legend Pill */}
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
          <span className="legend-name">Free Space</span>
          <span className="legend-size">{formatBytes(summary.freeBytes, 1)}</span>
          <span className="legend-percent">{freePercentage.toFixed(1)}%</span>
        </div>
      </div>
    </div>
  );
};
