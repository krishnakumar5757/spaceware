import React from "react";
import {
  Film,
  Boxes,
  Cpu,
  Code2,
  FileArchive,
  FolderMinus,
  PieChart,
  ChevronRight,
} from "lucide-react";
import { StorageCategory } from "../../types/storage";
import { formatBytes, formatNumber } from "../../mock/storageData";

interface CategoryBreakdownProps {
  categories: StorageCategory[];
  onInspectCategory: (categoryId: string) => void;
}

const ICON_MAP: Record<string, React.ReactNode> = {
  Film: <Film size={16} />,
  Boxes: <Boxes size={16} />,
  Cpu: <Cpu size={16} />,
  Code2: <Code2 size={16} />,
  FileArchive: <FileArchive size={16} />,
  FolderMinus: <FolderMinus size={16} />,
};

export const CategoryBreakdown: React.FC<CategoryBreakdownProps> = ({
  categories,
  onInspectCategory,
}) => {
  return (
    <div className="categories-container reveal-item">
      <div className="visualizer-header">
        <div className="panel-title-group">
          <div className="panel-title">
            <PieChart size={18} color="var(--accent)" />
            <span>Category Breakdown</span>
          </div>
          <span className="panel-subtitle">
            Classified file types and distributions across active storage
          </span>
        </div>
      </div>

      <div className="category-items-grid stagger-container">
        {categories.map((cat) => {
          const icon = ICON_MAP[cat.iconName] || <FolderMinus size={16} />;

          return (
            <div
              key={cat.id}
              className="category-tile"
              onClick={() => onInspectCategory(cat.id)}
            >
              <div className="category-tile-header">
                <div className="category-tile-title-group">
                  <div
                    className="category-icon-pill"
                    style={{
                      backgroundColor: `${cat.color}22`,
                      color: cat.color,
                      border: `1px solid ${cat.color}44`,
                    }}
                  >
                    {icon}
                  </div>
                  <div>
                    <div className="category-tile-name">{cat.name}</div>
                    <div className="category-tile-files">
                      {formatNumber(cat.fileCount)} files • {cat.percentageOfUsed}% of used
                    </div>
                  </div>
                </div>

                <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                  <span className="category-tile-size">{formatBytes(cat.sizeBytes, 1)}</span>
                  <ChevronRight size={15} color="var(--text-muted)" />
                </div>
              </div>

              <div className="category-progress-track">
                <div
                  className="category-progress-fill"
                  style={{
                    width: `${cat.percentageOfUsed}%`,
                    backgroundColor: cat.color,
                  }}
                />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};
