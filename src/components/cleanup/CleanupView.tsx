import React, { useState } from "react";
import {
  Sparkles,
  ShieldCheck,
  AlertTriangle,
  CheckSquare,
  Square,
  Trash2,
  CheckCircle2,
  X,
  RefreshCw,
} from "lucide-react";
import { CleanupRecommendation } from "../../types/storage";
import { mockRecommendations, formatBytes, formatNumber } from "../../mock/storageData";
import { useScrollRevealContainer } from "../../hooks/useScrollReveal";

interface CleanupViewProps {
  recommendations?: CleanupRecommendation[];
}

export const CleanupView: React.FC<CleanupViewProps> = ({ recommendations }) => {
  const containerRef = useScrollRevealContainer<HTMLDivElement>();

  const [items, setItems] = useState<CleanupRecommendation[]>(
    recommendations || mockRecommendations
  );
  const [isModalOpen, setIsModalOpen] = useState<boolean>(false);
  const [isCleaning, setIsCleaning] = useState<boolean>(false);
  const [cleanedSuccess, setCleanedSuccess] = useState<boolean>(false);
  const [lastFreedAmount, setLastFreedAmount] = useState<number>(0);

  // Sync when real scanner recommendations update
  React.useEffect(() => {
    if (recommendations && recommendations.length > 0) {
      setItems(recommendations);
    }
  }, [recommendations]);

  const toggleItem = (id: string) => {
    setItems((prev) =>
      prev.map((item) =>
        item.id === id ? { ...item, checked: !item.checked } : item
      )
    );
  };

  const handleSelectAll = (select: boolean) => {
    setItems((prev) => prev.map((item) => ({ ...item, checked: select })));
  };

  const selectedItems = items.filter((item) => item.checked);
  const totalReclaimableSelected = selectedItems.reduce(
    (acc, item) => acc + item.reclaimableBytes,
    0
  );

  const handleStartSimulation = () => {
    setIsCleaning(true);
    setTimeout(() => {
      setIsCleaning(false);
      setCleanedSuccess(true);
      setLastFreedAmount(totalReclaimableSelected);
      // Uncheck cleaned items in demo
      setItems((prev) =>
        prev.map((item) => (item.checked ? { ...item, checked: false } : item))
      );
    }, 1500);
  };

  const handleResetDemo = () => {
    setItems(mockRecommendations);
    setCleanedSuccess(false);
  };

  return (
    <div ref={containerRef} style={{ display: "flex", flexDirection: "column", gap: "20px" }}>
      {/* Top Reclaimable Summary Banner */}
      <div
        className="metric-card reveal-item"
        style={{
          background: "linear-gradient(135deg, rgba(36, 39, 48, 1) 0%, rgba(29, 32, 40, 1) 100%)",
          border: "1px solid var(--accent-border)",
          padding: "24px 28px",
          display: "flex",
          flexDirection: "row",
          alignItems: "center",
          justifyContent: "space-between",
          flexWrap: "wrap",
          gap: "20px",
        }}
      >
        <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
            <Sparkles size={20} color="var(--accent)" />
            <span style={{ fontSize: "16px", fontWeight: 700, color: "var(--text-primary)" }}>
              Space Reclamation Hub
            </span>
            <span className="badge-tag accent">Dry-Run Preview</span>
          </div>
          <div style={{ fontSize: "13px", color: "var(--text-secondary)" }}>
            Selected <strong>{selectedItems.length}</strong> of {items.length} categories to purge
          </div>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: "24px" }}>
          <div style={{ textAlign: "right" }}>
            <div style={{ fontSize: "11px", textTransform: "uppercase", letterSpacing: "0.5px", color: "var(--text-secondary)" }}>
              Selected to Reclaim
            </div>
            <div
              className="reclaim-counter-value"
              key={totalReclaimableSelected}
              style={{ fontSize: "28px", fontWeight: 700, color: "var(--accent)", fontVariantNumeric: "tabular-nums" }}
            >
              {formatBytes(totalReclaimableSelected, 1)}
            </div>
          </div>

          <button
            id="btn-simulate-cleanup"
            className="btn-primary"
            onClick={() => setIsModalOpen(true)}
            disabled={selectedItems.length === 0}
            style={{ padding: "10px 20px", fontSize: "14px" }}
          >
            <Trash2 size={16} />
            <span>Simulate Cleanup</span>
          </button>
        </div>
      </div>

      {cleanedSuccess && (
        <div
          className="reveal-item"
          style={{
            background: "rgba(52, 211, 153, 0.12)",
            border: "1px solid rgba(52, 211, 153, 0.3)",
            borderRadius: "var(--radius-md)",
            padding: "14px 18px",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            color: "var(--status-success)",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
            <CheckCircle2 size={18} />
            <span style={{ fontSize: "13.5px", fontWeight: 500 }}>
              Dry-run simulation completed! In real mode, <strong>{formatBytes(lastFreedAmount, 1)}</strong> would be safely reclaimed.
            </span>
          </div>
          <button className="btn-secondary" onClick={handleResetDemo} style={{ fontSize: "12px", padding: "4px 10px" }}>
            Reset Items
          </button>
        </div>
      )}

      {/* Item Checklist Panel */}
      <div className="files-panel reveal-item">
        <div className="files-panel-header">
          <div className="panel-title-group">
            <div className="panel-title">
              <span>Configured Cleanup Targets</span>
            </div>
            <span className="panel-subtitle">
              Select safe categories to prune non-essential caches, obsolete package tars, and log archives
            </span>
          </div>

          <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
            <button
              className="btn-secondary"
              onClick={() => handleSelectAll(true)}
              style={{ fontSize: "12px", padding: "6px 12px" }}
            >
              Select All
            </button>
            <button
              className="btn-secondary"
              onClick={() => handleSelectAll(false)}
              style={{ fontSize: "12px", padding: "6px 12px" }}
            >
              Deselect All
            </button>
          </div>
        </div>

        <div className="stagger-container" style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
          {items.map((item) => {
            const isChecked = !!item.checked;
            return (
              <div
                key={item.id}
                onClick={() => toggleItem(item.id)}
                className="rec-item"
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  padding: "16px 18px",
                  background: isChecked ? "var(--bg-elevated)" : "var(--bg-card)",
                  border: isChecked ? "1px solid var(--accent-border)" : "1px solid var(--border-subtle)",
                  borderRadius: "var(--radius-md)",
                  cursor: "pointer",
                }}
              >
                <div style={{ display: "flex", alignItems: "flex-start", gap: "14px" }}>
                  <div style={{ color: isChecked ? "var(--accent)" : "var(--text-muted)", marginTop: "2px" }}>
                    {isChecked ? <CheckSquare size={20} /> : <Square size={20} />}
                  </div>

                  <div style={{ display: "flex", flexDirection: "column", gap: "3px" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                      <span style={{ fontSize: "14px", fontWeight: 600, color: "var(--text-primary)" }}>
                        {item.title}
                      </span>
                      {item.riskLevel === "safe" ? (
                        <span
                          className="badge-tag"
                          style={{
                            background: "rgba(52, 211, 153, 0.12)",
                            color: "var(--status-success)",
                            fontSize: "10px",
                          }}
                        >
                          <ShieldCheck size={11} /> Safe to prune
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
                          <AlertTriangle size={11} /> Review Recommended
                        </span>
                      )}
                    </div>

                    <span style={{ fontSize: "12px", color: "var(--text-secondary)" }}>
                      {item.description}
                    </span>

                    <span
                      style={{
                        fontSize: "11px",
                        color: "var(--text-muted)",
                        fontFamily: "'JetBrains Mono', monospace",
                        marginTop: "2px",
                      }}
                    >
                      Target: {item.path} ({formatNumber(item.fileCount)} files)
                    </span>
                  </div>
                </div>

                <div style={{ textAlign: "right" }}>
                  <span
                    style={{
                      fontSize: "15px",
                      fontWeight: 700,
                      color: isChecked ? "var(--accent)" : "var(--text-secondary)",
                      fontVariantNumeric: "tabular-nums",
                    }}
                  >
                    {formatBytes(item.reclaimableBytes, 1)}
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Simulation Modal */}
      {isModalOpen && (
        <div className="modal-backdrop">
          <div className="modal-content">
            <div className="modal-header">
              <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                <Sparkles size={18} color="var(--accent)" />
                <span style={{ fontWeight: 700, fontSize: "15px" }}>Simulate Storage Cleanup</span>
              </div>
              <button
                onClick={() => !isCleaning && setIsModalOpen(false)}
                style={{ background: "none", border: "none", color: "var(--text-muted)", cursor: "pointer" }}
              >
                <X size={18} />
              </button>
            </div>

            <div className="modal-body">
              <div
                style={{
                  background: "var(--bg-panel-subtle)",
                  border: "1px solid var(--border-subtle)",
                  borderRadius: "var(--radius-md)",
                  padding: "14px",
                  fontSize: "13px",
                  color: "var(--text-secondary)",
                }}
              >
                <strong style={{ color: "var(--text-primary)" }}>Milestone 1 Safe Sandbox:</strong>
                <p style={{ marginTop: "4px" }}>
                  This simulation computes and validates space reclamation without modifying, deleting, or invoking filesystem commands. In Milestone 2, this will link to native Rust commands with safety confirmation.
                </p>
              </div>

              <div>
                <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "8px", fontSize: "13px" }}>
                  <span>Targets to clean:</span>
                  <strong style={{ color: "var(--text-primary)" }}>{selectedItems.length} categories</strong>
                </div>
                <div style={{ display: "flex", justifyContent: "space-between", fontSize: "14px" }}>
                  <span>Estimated space reclaimed:</span>
                  <strong style={{ color: "var(--accent)" }}>{formatBytes(totalReclaimableSelected, 1)}</strong>
                </div>
              </div>

              {isCleaning && (
                <div style={{ marginTop: "12px", display: "flex", flexDirection: "column", gap: "8px" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: "8px", color: "var(--accent)", fontSize: "13px" }}>
                    <RefreshCw size={14} className="spin-animation" style={{ animation: "spin 1s linear infinite" }} />
                    <span>Running simulated clean on /var/cache and build folders...</span>
                  </div>
                  <div className="disk-widget-bar" style={{ height: "6px" }}>
                    <div className="disk-widget-fill" style={{ width: "100%", animation: "pulse 1s infinite" }} />
                  </div>
                </div>
              )}
            </div>

            <div className="modal-footer">
              <button
                className="btn-secondary"
                onClick={() => setIsModalOpen(false)}
                disabled={isCleaning}
              >
                Cancel
              </button>
              <button
                className="btn-primary"
                onClick={() => {
                  handleStartSimulation();
                  setTimeout(() => {
                    setIsModalOpen(false);
                  }, 1600);
                }}
                disabled={isCleaning}
              >
                <Trash2 size={15} />
                <span>{isCleaning ? "Simulating..." : "Confirm & Simulate"}</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
