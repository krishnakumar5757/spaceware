import React from "react";
import { DemoBanner } from "../common/DemoBanner";
import { StorageMetricCards } from "./StorageMetricCards";
import { StorageVisualizer } from "./StorageVisualizer";
import { CategoryBreakdown } from "./CategoryBreakdown";
import { CleanupRecommendations } from "./CleanupRecommendations";
import { LargestFilesTable } from "./LargestFilesTable";
import { ErrorState, LoadingState } from "../common/StateViews";
import { useScrollRevealContainer } from "../../hooks/useScrollReveal";
import {
  StorageSummary,
  StorageCategory,
  FileItem,
  CleanupRecommendation,
  AppScanState,
} from "../../types/storage";

interface OverviewViewProps {
  summary: StorageSummary;
  categories: StorageCategory[];
  largestFiles: FileItem[];
  recommendations: CleanupRecommendation[];
  isSimulatedErrorActive: boolean;
  scanState?: AppScanState;
  isDemoMode?: boolean;
  totalFilesScanned?: number;
  permissionDeniedCount?: number;
  scanDurationMs?: number;
  errorMessage?: string | null;
  onClearSimulatedError: () => void;
  onTriggerScan: () => void;
  onRetry?: () => void;
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
  scanState = "ready",
  isDemoMode = false,
  totalFilesScanned = 0,
  permissionDeniedCount = 0,
  scanDurationMs = 0,
  errorMessage,
  onClearSimulatedError,
  onTriggerScan,
  onRetry,
  onInspectCategory,
  onReviewCleanup,
  onInspectFile,
}) => {
  const containerRef = useScrollRevealContainer<HTMLDivElement>(
    {},
    [scanState, isSimulatedErrorActive, summary.totalBytes, summary.usedBytes]
  );

  const hasCompletedScan =
    scanState === "completed" ||
    scanState === "completed_with_errors" ||
    (isDemoMode && categories.length > 0);

  return (
    <div ref={containerRef} style={{ display: "flex", flexDirection: "column", gap: "24px" }}>
      {isSimulatedErrorActive ? (
        <>
          <DemoBanner
            scanState="failed"
            isLiveData={summary.isLiveData}
            mountPoint={summary.mountPoint}
            filesystem={summary.filesystem}
            totalFilesScanned={totalFilesScanned}
            permissionDeniedCount={permissionDeniedCount}
          />
          <ErrorState
            title={`Mount Point Unavailable: ${summary.mountPoint} (${summary.filesystem})`}
            message="Simulated Error: The storage volume could not be accessed or queried. You can disable this simulation in Settings or click Retry below."
            onRetry={onClearSimulatedError}
          />
        </>
      ) : scanState === "initializing" ? (
        <>
          <DemoBanner
            scanState="initializing"
            mountPoint={summary.mountPoint}
            filesystem={summary.filesystem}
          />
          <LoadingState
            title="Querying Storage Volume..."
            message="Calling native Linux statvfs to retrieve actual capacity blocks and mount points."
          />
        </>
      ) : scanState === "no_filesystem" ? (
        <>
          <DemoBanner
            scanState="no_filesystem"
            mountPoint={summary.mountPoint}
            filesystem={summary.filesystem}
            errorMessage={errorMessage}
            onRetry={onRetry}
          />
          <ErrorState
            title="No Accessible Mounted Filesystem"
            message={
              errorMessage ||
              "Failed to retrieve storage statistics from Linux kernel. Hardcoded demo values were not substituted."
            }
            onRetry={onRetry}
          />
        </>
      ) : (
        <>
          {/* Demo / Live / Ready Mode Notice Banner */}
          <div className="reveal-item">
            <DemoBanner
              scanState={scanState}
              isDemoMode={isDemoMode}
              isLiveData={summary.isLiveData}
              mountPoint={summary.mountPoint}
              filesystem={summary.filesystem}
              totalBytes={summary.totalBytes}
              usedBytes={summary.usedBytes}
              totalFilesScanned={totalFilesScanned}
              permissionDeniedCount={permissionDeniedCount}
              scanDurationMs={scanDurationMs}
              errorMessage={errorMessage}
              onTriggerScan={onTriggerScan}
              onRetry={onRetry}
            />
          </div>

          {/* Storage Metric Cards (Total, Used, Free/Available, Reclaimable) */}
          <StorageMetricCards
            summary={summary}
            hasCompletedScan={hasCompletedScan}
            recommendationsCount={recommendations.length}
          />

          {/* Large Storage Usage Visualization */}
          <StorageVisualizer
            summary={summary}
            categories={categories}
            hasCompletedScan={hasCompletedScan}
            onTriggerScan={onTriggerScan}
            onSelectCategory={onInspectCategory}
          />

          {/* Two Columns: Category Breakdown & Cleanup Recommendations */}
          <div className="overview-grid-columns">
            <CategoryBreakdown
              categories={categories}
              onInspectCategory={onInspectCategory}
              onTriggerScan={onTriggerScan}
            />
            <CleanupRecommendations
              recommendations={recommendations}
              hasCompletedScan={hasCompletedScan}
              onReviewCleanup={onReviewCleanup}
              onTriggerScan={onTriggerScan}
            />
          </div>

          {/* Largest Files Table */}
          <LargestFilesTable
            files={largestFiles}
            onInspectFile={onInspectFile}
            onTriggerScan={onTriggerScan}
          />
        </>
      )}
    </div>
  );
};
