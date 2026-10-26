import React from "react";
import { DemoBanner } from "../common/DemoBanner";
import { StorageMetricCards } from "./StorageMetricCards";
import { StorageVisualizer } from "./StorageVisualizer";
import { CategoryBreakdown } from "./CategoryBreakdown";
import { CleanupRecommendations } from "./CleanupRecommendations";
import { LargestFilesTable } from "./LargestFilesTable";
import { ErrorState } from "../common/StateViews";
import { useScrollRevealContainer } from "../../hooks/useScrollReveal";
import {
  StorageSummary,
  StorageCategory,
  FileItem,
  CleanupRecommendation,
} from "../../types/storage";

interface OverviewViewProps {
  summary: StorageSummary;
  categories: StorageCategory[];
  largestFiles: FileItem[];
  recommendations: CleanupRecommendation[];
  isSimulatedErrorActive: boolean;
  totalFilesScanned?: number;
  permissionDeniedCount?: number;
  onClearSimulatedError: () => void;
  onInspectCategory: (categoryId: string) => void;
  onReviewCleanup: (recId?: string) => void;
  onInspectFile: (file: FileItem) => void;
}

export const OverviewView: React.FC<OverviewViewProps> = ({
  summary,
  categories,
  largestFiles,
  recommendations,
  isSimulatedErrorActive,
  totalFilesScanned,
  permissionDeniedCount,
  onClearSimulatedError,
  onInspectCategory,
  onReviewCleanup,
  onInspectFile,
}) => {
  const containerRef = useScrollRevealContainer<HTMLDivElement>();

  if (isSimulatedErrorActive) {
    return (
      <div style={{ display: "flex", flexDirection: "column", gap: "24px" }}>
        <DemoBanner
          isLiveData={summary.isLiveData}
          mountPoint={summary.mountPoint}
          filesystem={summary.filesystem}
          totalFilesScanned={totalFilesScanned}
          permissionDeniedCount={permissionDeniedCount}
        />
        <ErrorState
          title="Mount Point Unavailable: /home (Btrfs)"
          message="Simulated Error: The storage volume could not be accessed or queried. You can disable this simulation in Settings or click Retry below."
          onRetry={onClearSimulatedError}
        />
      </div>
    );
  }

  return (
    <div ref={containerRef} style={{ display: "flex", flexDirection: "column", gap: "24px" }}>
      {/* Demo / Live Mode Notice */}
      <div className="reveal-item">
        <DemoBanner
          isLiveData={summary.isLiveData}
          mountPoint={summary.mountPoint}
          filesystem={summary.filesystem}
          totalFilesScanned={totalFilesScanned}
          permissionDeniedCount={permissionDeniedCount}
        />
      </div>

      {/* Storage Metric Cards (Total, Used, Free, Reclaimable) */}
      <StorageMetricCards summary={summary} />

      {/* Large Storage Usage Visualization */}
      <StorageVisualizer
        summary={summary}
        categories={categories}
        onSelectCategory={onInspectCategory}
      />

      {/* Two Columns: Category Breakdown & Cleanup Recommendations */}
      <div className="overview-grid-columns">
        <CategoryBreakdown
          categories={categories}
          onInspectCategory={onInspectCategory}
        />
        <CleanupRecommendations
          recommendations={recommendations}
          onReviewCleanup={onReviewCleanup}
        />
      </div>

      {/* Largest Files Table */}
      <LargestFilesTable
        files={largestFiles}
        onInspectFile={onInspectFile}
      />
    </div>
  );
};
