import { Sparkles, ArrowRight, ShieldCheck, AlertCircle, RefreshCw } from "lucide-react";
import { CleanupRecommendation } from "../../types/storage";
import { formatBytes } from "../../mock/storageData";

interface CleanupRecommendationsProps {
  recommendations: CleanupRecommendation[];
  onReviewCleanup: (recommendationId?: string) => void;
  hasCompletedScan?: boolean;
  onTriggerScan?: () => void;
}

export const CleanupRecommendations: React.FC<CleanupRecommendationsProps> = ({
  recommendations,
  onReviewCleanup,
  hasCompletedScan = false,
  onTriggerScan,
}) => {
  const totalReclaimable = recommendations.reduce(
    (acc, item) => acc + item.reclaimableBytes,
    0
  );

  return (
    <div className="recommendations-container reveal-item">
      <div className="visualizer-header">
        <div className="panel-title-group">
          <div className="panel-title">
            <Sparkles size={18} color="var(--accent)" />
            <span>Cleanup Recommendations</span>
          </div>
          <span className="panel-subtitle">
            {hasCompletedScan ? (
              recommendations.length > 0 ? (
                <>
                  Reclaim up to <strong style={{ color: "var(--accent)" }}>{formatBytes(totalReclaimable, 1)}</strong> with automated cache cleanups
                </>
              ) : (
                "No safe cleanup targets discovered on this volume"
              )
            ) : (
              "Run a storage scan to discover cleanup candidates and calculate reclaimable space"
            )}
          </span>
        </div>

        <button
          className="btn-primary"
          style={{ fontSize: "12px", padding: "6px 12px" }}
          onClick={() => onReviewCleanup()}
          disabled={recommendations.length === 0}
        >
          <span>Open Cleanup</span>
          <ArrowRight size={14} />
        </button>
      </div>

      {recommendations.length === 0 ? (
        <div className="state-box" style={{ padding: "36px 20px", margin: "10px 0" }}>
          <div className="state-icon" style={{ color: "var(--accent)" }}>
            <Sparkles size={24} />
          </div>
          <div className="state-title">
            {hasCompletedScan ? "No Cleanup Items Found" : "Cleanup Analysis Not Scanned Yet"}
          </div>
          <div className="state-desc" style={{ maxWidth: "380px" }}>
            {hasCompletedScan
              ? "Storage is clean. No obsolete caches, orphan trash files, or stale build artifacts were found."
              : "Discover reclaimable cache targets, FreeDesktop Trash items, and stale build artifacts by running a scan."}
          </div>
          {!hasCompletedScan && onTriggerScan && (
            <button
              className="btn-secondary"
              onClick={onTriggerScan}
              style={{ marginTop: "12px", fontSize: "12px" }}
            >
              <RefreshCw size={13} />
              <span>Scan Storage</span>
            </button>
          )}
        </div>
      ) : (
        <div className="rec-list stagger-container">
          {recommendations.slice(0, 4).map((rec) => (
            <div key={rec.id} className="rec-item">
              <div className="rec-info">
                <div className="rec-title-row">
                  <span className="rec-title">{rec.title}</span>
                  {rec.riskLevel === "safe" ? (
                    <span
                      className="badge-tag"
                      style={{
                        background: "rgba(52, 211, 153, 0.12)",
                        color: "var(--status-success)",
                        fontSize: "10px",
                      }}
                    >
                      <ShieldCheck size={11} /> Safe
                    </span>
                  ) : (
                    <span
                      className="badge-tag"
                      style={{
                        background: "rgba(251, 191, 36, 0.12)",
                        color: "var(--status-warning)",
                        fontSize: "10px",
                      }}
                    >
                      <AlertCircle size={11} /> Caution
                    </span>
                  )}
                </div>
                <span className="rec-desc">{rec.description}</span>
              </div>

              <div className="rec-size-action">
                <span className="rec-size-badge">{formatBytes(rec.reclaimableBytes, 1)}</span>
                <button
                  className="btn-secondary"
                  style={{ fontSize: "11px", padding: "3px 8px" }}
                  onClick={() => onReviewCleanup(rec.id)}
                >
                  Review
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};
