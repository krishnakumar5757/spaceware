import React, { useState, useEffect } from "react";
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
  Terminal,
  Copy,
  Check,
  Info,
  Archive,
} from "lucide-react";
import {
  CleanupRecommendation,
  CleanupExecutionSummary,
} from "../../types/storage";
import {
  formatBytes,
  formatNumber,
} from "../../mock/storageData";
import { useScrollRevealContainer } from "../../hooks/useScrollReveal";
import {
  executeCleanup,
} from "../../services/scannerService";

interface CleanupViewProps {
  recommendations?: CleanupRecommendation[];
  isDemoMode?: boolean;
  hasCompletedScan?: boolean;
  onTriggerScan?: () => void;
  onCleanupExecuted?: (summary: CleanupExecutionSummary) => void;
}

export const CleanupView: React.FC<CleanupViewProps> = ({
  recommendations,
  isDemoMode = false,
  hasCompletedScan = false,
  onTriggerScan,
  onCleanupExecuted,
}) => {
  const containerRef = useScrollRevealContainer<HTMLDivElement>();

  const [items, setItems] = useState<CleanupRecommendation[]>(
    recommendations || []
  );
  const [isModalOpen, setIsModalOpen] = useState<boolean>(false);
  const [cleanupAction, setCleanupAction] = useState<"trash" | "permanent_delete">("trash");
  const [confirmPermanentDelete, setConfirmPermanentDelete] = useState<boolean>(false);
  const [isCleaning, setIsCleaning] = useState<boolean>(false);
  const [lastExecutionSummary, setLastExecutionSummary] = useState<CleanupExecutionSummary | null>(null);
  const [copiedCommand, setCopiedCommand] = useState<string | null>(null);
  const [executionError, setExecutionError] = useState<string | null>(null);

  // Sync when parent provides updated recommendations
  useEffect(() => {
    setItems(recommendations || []);
  }, [recommendations]);

  const toggleItem = (id: string) => {
    setItems((prev) =>
      prev.map((item) => {
        if (item.id === id) {
          // Do not allow checking manual instruction items (e.g. pacman)
          if (item.actionType === "manual_instruction") return item;
          return { ...item, checked: !item.checked };
        }
        return item;
      })
    );
  };

  const handleSelectAll = (select: boolean) => {
    setItems((prev) =>
      prev.map((item) =>
        item.actionType === "manual_instruction"
          ? item
          : { ...item, checked: select }
      )
    );
  };

  const handleSelectSafeOnly = () => {
    setItems((prev) =>
      prev.map((item) => ({
        ...item,
        checked: item.riskLevel === "safe" && item.actionType !== "manual_instruction",
      }))
    );
  };

  const selectedItems = items.filter(
    (item) => item.checked && item.actionType !== "manual_instruction"
  );

  const totalReclaimableSelected = selectedItems.reduce(
    (acc, item) => acc + item.reclaimableBytes,
    0
  );

  const handleCopyCommand = (cmd: string) => {
    navigator.clipboard.writeText(cmd).catch(() => {});
    setCopiedCommand(cmd);
    setTimeout(() => {
      setCopiedCommand(null);
    }, 2500);
  };

  // Real selective cleanup execution with pre-validation and per-item reporting
  const handleExecuteCleanup = async () => {
    if (isDemoMode) {
      setExecutionError("Cleanup execution is disabled for mock fixtures in Demo Mode.");
      return;
    }

    if (selectedItems.length === 0 || isCleaning) return;

    setIsCleaning(true);
    setExecutionError(null);

    const candidateIds = selectedItems.map((item) => item.id);

    try {
      const summary = await executeCleanup(candidateIds, cleanupAction);
      setLastExecutionSummary(summary);

      // Remove successfully cleaned items or mark them 0 bytes
      const successfulIds = new Set(
        summary.itemResults
          .filter((res) => res.success)
          .map((res) => res.id)
      );

      setItems((prev) =>
        prev
          .filter((item) => !successfulIds.has(item.id))
          .map((item) => (item.checked ? { ...item, checked: false } : item))
      );

      if (onCleanupExecuted) {
        onCleanupExecuted(summary);
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      setExecutionError(msg);
    } finally {
      setIsCleaning(false);
    }
  };

  const handleDismissSummary = () => {
    setLastExecutionSummary(null);
  };

  return (
    <div ref={containerRef} style={{ display: "flex", flexDirection: "column", gap: "20px" }}>
      {/* Explicit Demo Mode Warning Banner */}
      {isDemoMode && (
        <div
          className="demo-banner reveal-item"
          style={{
            borderLeftColor: "var(--accent)",
            borderColor: "rgba(199, 243, 107, 0.3)",
            background: "linear-gradient(90deg, rgba(35, 38, 30, 0.95) 0%, rgba(28, 32, 26, 0.95) 100%)",
          }}
        >
          <div className="demo-banner-content">
            <div className="demo-banner-icon" style={{ color: "var(--accent)" }}>
              <Sparkles size={18} />
            </div>
            <div>
              <div className="demo-banner-title" style={{ color: "var(--accent)" }}>
                Demo Mode Active — Preview Fixtures Only
              </div>
              <div className="demo-banner-desc">
                Cleanup execution is strictly disabled for mock fixtures to safeguard real files. Disable demo mode or run a real scan to enable cleaning.
              </div>
            </div>
          </div>
          <span className="badge-tag accent">
            <Sparkles size={12} /> Execution Disabled
          </span>
        </div>
      )}

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
            <span
              className="badge-tag accent"
              style={{
                background: "rgba(199, 243, 107, 0.15)",
                color: "var(--accent)",
                borderColor: "rgba(199, 243, 107, 0.3)",
              }}
            >
              Milestone 3 Live Engine
            </span>
          </div>
          <div style={{ fontSize: "13px", color: "var(--text-secondary)" }}>
            Selected <strong>{selectedItems.length}</strong> of{" "}
            {items.filter((i) => i.actionType !== "manual_instruction").length} actionable targets to clean
          </div>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: "24px" }}>
          <div style={{ textAlign: "right" }}>
            <div
              style={{
                fontSize: "11px",
                textTransform: "uppercase",
                letterSpacing: "0.5px",
                color: "var(--text-secondary)",
              }}
            >
              Estimated to Reclaim
            </div>
            <div
              className="reclaim-counter-value"
              key={totalReclaimableSelected}
              style={{
                fontSize: "28px",
                fontWeight: 700,
                color: "var(--accent)",
                fontVariantNumeric: "tabular-nums",
              }}
            >
              {formatBytes(totalReclaimableSelected, 1)}
            </div>
          </div>

          <button
            id="btn-simulate-cleanup"
            className="btn-primary"
            onClick={() => {
              setExecutionError(null);
              setConfirmPermanentDelete(false);
              setIsModalOpen(true);
            }}
            disabled={selectedItems.length === 0 || isDemoMode}
            title={isDemoMode ? "Cleanup execution disabled in demo mode" : undefined}
            style={{ padding: "10px 20px", fontSize: "14px" }}
          >
            <Trash2 size={16} />
            <span>
              {isDemoMode
                ? "Cleanup Disabled (Demo)"
                : `Clean Selected (${selectedItems.length})`}
            </span>
          </button>
        </div>
      </div>

      {/* Post-execution notification with exact actual space reclaimed */}
      {lastExecutionSummary && (
        <div
          className="reveal-item"
          style={{
            background:
              lastExecutionSummary.failureCount === 0
                ? "rgba(52, 211, 153, 0.12)"
                : "rgba(251, 191, 36, 0.12)",
            border: `1px solid ${
              lastExecutionSummary.failureCount === 0
                ? "rgba(52, 211, 153, 0.3)"
                : "rgba(251, 191, 36, 0.3)"
            }`,
            borderRadius: "var(--radius-md)",
            padding: "16px 20px",
            display: "flex",
            flexDirection: "column",
            gap: "10px",
            color:
              lastExecutionSummary.failureCount === 0
                ? "var(--status-success)"
                : "var(--status-warning)",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
              <CheckCircle2 size={18} />
              <span style={{ fontSize: "14px", fontWeight: 600 }}>
                Cleanup Completed: Actually reclaimed{" "}
                <strong>{formatBytes(lastExecutionSummary.totalBytesFreed, 1)}</strong> across{" "}
                {lastExecutionSummary.totalFilesRemoved.toLocaleString()} files (
                {lastExecutionSummary.successCount} succeeded, {lastExecutionSummary.failureCount} skipped/failed).
              </span>
            </div>
            <button
              className="btn-secondary"
              onClick={handleDismissSummary}
              style={{ fontSize: "12px", padding: "4px 10px" }}
            >
              Dismiss
            </button>
          </div>

          {/* Per-item execution status report */}
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              gap: "6px",
              marginTop: "4px",
              fontSize: "12px",
            }}
          >
            {lastExecutionSummary.itemResults.map((res) => (
              <div
                key={res.id}
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  background: "rgba(0,0,0,0.2)",
                  padding: "6px 10px",
                  borderRadius: "var(--radius-sm)",
                }}
              >
                <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                  {res.success ? (
                    <Check size={14} color="var(--status-success)" />
                  ) : (
                    <AlertTriangle size={14} color="var(--status-warning)" />
                  )}
                  <span style={{ fontFamily: "'JetBrains Mono', monospace" }}>{res.path || res.id}</span>
                </div>
                <span>
                  {res.success
                    ? `${formatBytes(res.bytesFreed, 1)} freed (${res.filesRemoved} files)`
                    : res.error || "Failed"}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Item Checklist Panel */}
      <div className="files-panel reveal-item">
        <div className="files-panel-header">
          <div className="panel-title-group">
            <div className="panel-title">
              <span>Discovered Cleanup Targets</span>
            </div>
            <span className="panel-subtitle">
              Verified user caches, FreeDesktop Trash entries, and stale build targets. Revalidated prior to removal.
            </span>
          </div>

          <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
            <button
              className="btn-secondary"
              onClick={handleSelectSafeOnly}
              style={{ fontSize: "12px", padding: "6px 12px" }}
            >
              Select Safe
            </button>
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

        {items.length === 0 ? (
          <div className="state-box" style={{ padding: "48px 24px", margin: "16px 0" }}>
            <div className="state-icon" style={{ color: "var(--accent)" }}>
              <Sparkles size={28} />
            </div>
            <div className="state-title">
              {hasCompletedScan
                ? "No Cleanup Targets Discovered"
                : "Cleanup Analysis Not Scanned Yet"}
            </div>
            <div className="state-desc" style={{ maxWidth: "440px" }}>
              {hasCompletedScan
                ? "Your system is clean. No eligible cache directories or trash items were detected."
                : "Run a storage scan to discover real user caches (~/.cache), FreeDesktop Trash files, and build artifacts."}
            </div>
            {!hasCompletedScan && onTriggerScan && (
              <button
                className="btn-primary"
                onClick={onTriggerScan}
                style={{ marginTop: "14px", fontSize: "13px" }}
              >
                <RefreshCw size={14} />
                <span>Scan Storage</span>
              </button>
            )}
          </div>
        ) : (
          <div className="stagger-container" style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
            {items.map((item) => {
            const isChecked = !!item.checked;
            const isManual = item.actionType === "manual_instruction";

            return (
              <div
                key={item.id}
                onClick={() => !isManual && toggleItem(item.id)}
                className="rec-item"
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  padding: "16px 18px",
                  background: isChecked ? "var(--bg-elevated)" : "var(--bg-card)",
                  border: isChecked
                    ? "1px solid var(--accent-border)"
                    : isManual
                    ? "1px dashed rgba(251, 191, 36, 0.35)"
                    : "1px solid var(--border-subtle)",
                  borderRadius: "var(--radius-md)",
                  cursor: isManual ? "default" : "pointer",
                }}
              >
                <div style={{ display: "flex", alignItems: "flex-start", gap: "14px", flex: 1, marginRight: "16px" }}>
                  <div style={{ color: isChecked ? "var(--accent)" : "var(--text-muted)", marginTop: "2px" }}>
                    {isManual ? (
                      <Terminal size={20} color="var(--status-warning)" />
                    ) : isChecked ? (
                      <CheckSquare size={20} />
                    ) : (
                      <Square size={20} />
                    )}
                  </div>

                  <div style={{ display: "flex", flexDirection: "column", gap: "4px", width: "100%" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: "10px", flexWrap: "wrap" }}>
                      <span style={{ fontSize: "14px", fontWeight: 600, color: "var(--text-primary)" }}>
                        {item.title}
                      </span>

                      {item.riskLevel === "safe" ? (
                        <span
                          className="badge-tag"
                          style={{
                            background: "rgba(52, 211, 153, 0.12)",
                            color: "var(--status-success)",
                            fontSize: "10.5px",
                          }}
                        >
                          <ShieldCheck size={11} /> Safe to prune
                        </span>
                      ) : isManual ? (
                        <span
                          className="badge-tag"
                          style={{
                            background: "rgba(251, 191, 36, 0.12)",
                            color: "var(--status-warning)",
                            fontSize: "10.5px",
                          }}
                        >
                          <Terminal size={11} /> Manual Command Required
                        </span>
                      ) : (
                        <span
                          className="badge-tag"
                          style={{
                            background: "rgba(251, 191, 36, 0.12)",
                            color: "var(--status-warning)",
                            fontSize: "10.5px",
                          }}
                        >
                          <AlertTriangle size={11} /> Review Recommended
                        </span>
                      )}

                      {item.category === "trash" && (
                        <span
                          className="badge-tag"
                          style={{
                            background: "rgba(56, 189, 248, 0.12)",
                            color: "#38BDF8",
                            fontSize: "10.5px",
                          }}
                        >
                          <Archive size={11} /> FreeDesktop Trash
                        </span>
                      )}
                    </div>

                    <span style={{ fontSize: "12px", color: "var(--text-secondary)" }}>
                      {item.description}
                    </span>

                    {item.reason && (
                      <span style={{ fontSize: "11.5px", color: "var(--text-muted)", fontStyle: "italic" }}>
                        Reason: {item.reason}
                      </span>
                    )}

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

                    {/* Explanatory command snippet for package managers (Requirement D) */}
                    {isManual && item.manualCommand && (
                      <div
                        style={{
                          display: "flex",
                          alignItems: "center",
                          gap: "8px",
                          marginTop: "6px",
                          background: "var(--bg-panel-subtle)",
                          padding: "6px 10px",
                          borderRadius: "var(--radius-sm)",
                          border: "1px solid var(--border-subtle)",
                          width: "fit-content",
                        }}
                      >
                        <Terminal size={13} color="var(--accent)" />
                        <code style={{ fontSize: "11.5px", color: "var(--accent)", fontFamily: "'JetBrains Mono', monospace" }}>
                          {item.manualCommand}
                        </code>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            handleCopyCommand(item.manualCommand!);
                          }}
                          className="btn-secondary"
                          style={{ padding: "2px 6px", fontSize: "10px", display: "flex", alignItems: "center", gap: "4px" }}
                          title="Copy command to clipboard"
                        >
                          {copiedCommand === item.manualCommand ? (
                            <>
                              <Check size={11} color="var(--status-success)" />
                              <span>Copied!</span>
                            </>
                          ) : (
                            <>
                              <Copy size={11} />
                              <span>Copy</span>
                            </>
                          )}
                        </button>
                      </div>
                    )}
                  </div>
                </div>

                <div style={{ textAlign: "right", whiteSpace: "nowrap" }}>
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
        )}
      </div>

      {/* Confirmation & Execution Modal */}
      {isModalOpen && (
        <div className="modal-backdrop">
          <div className="modal-content" style={{ maxWidth: "560px" }}>
            <div className="modal-header">
              <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                <Trash2 size={18} color="var(--accent)" />
                <span style={{ fontWeight: 700, fontSize: "15px" }}>Confirm Storage Cleanup</span>
              </div>
              <button
                onClick={() => !isCleaning && setIsModalOpen(false)}
                style={{ background: "none", border: "none", color: "var(--text-muted)", cursor: "pointer" }}
              >
                <X size={18} />
              </button>
            </div>

            <div className="modal-body" style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
              {/* Cleanup Operation Mode Selector */}
              <div>
                <label style={{ fontSize: "12px", fontWeight: 600, color: "var(--text-secondary)", marginBottom: "6px", display: "block" }}>
                  Cleanup Mode:
                </label>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "10px" }}>
                  <button
                    type="button"
                    onClick={() => {
                      setCleanupAction("trash");
                      setConfirmPermanentDelete(false);
                    }}
                    className={cleanupAction === "trash" ? "btn-primary" : "btn-secondary"}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      gap: "6px",
                      padding: "8px 12px",
                      fontSize: "12.5px",
                    }}
                  >
                    <Archive size={14} />
                    <span>Move to Trash (Safe)</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      setCleanupAction("permanent_delete");
                      setConfirmPermanentDelete(false);
                    }}
                    className={cleanupAction === "permanent_delete" ? "btn-danger" : "btn-secondary"}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      gap: "6px",
                      padding: "8px 12px",
                      fontSize: "12.5px",
                      borderColor: cleanupAction === "permanent_delete" ? "rgba(239, 68, 68, 0.4)" : undefined,
                    }}
                  >
                    <Trash2 size={14} />
                    <span>Permanently Delete</span>
                  </button>
                </div>
              </div>

              {/* Explanatory Mode Banner */}
              <div
                style={{
                  background:
                    cleanupAction === "trash"
                      ? "rgba(56, 189, 248, 0.08)"
                      : "rgba(239, 68, 68, 0.08)",
                  border: `1px solid ${
                    cleanupAction === "trash"
                      ? "rgba(56, 189, 248, 0.25)"
                      : "rgba(239, 68, 68, 0.25)"
                  }`,
                  borderRadius: "var(--radius-md)",
                  padding: "10px 14px",
                  fontSize: "12.5px",
                  color: "var(--text-secondary)",
                }}
              >
                {cleanupAction === "trash" ? (
                  <div>
                    <strong style={{ color: "#38BDF8" }}>FreeDesktop Trash Integration:</strong>
                    <p style={{ marginTop: "3px" }}>
                      Eligible files will be safely moved to ~/.local/share/Trash preserving timestamps and original path metadata. You can inspect or restore them at any time.
                    </p>
                  </div>
                ) : (
                  <div>
                    <strong style={{ color: "#F87171" }}>Permanent Removal:</strong>
                    <p style={{ marginTop: "3px" }}>
                      Selected files and cache contents will be permanently deleted from disk. This operation recovers disk space immediately and cannot be undone.
                    </p>
                  </div>
                )}
              </div>

              {/* Explicit Permanent Deletion Intent Confirmation */}
              {cleanupAction === "permanent_delete" && (
                <div
                  style={{
                    display: "flex",
                    alignItems: "flex-start",
                    gap: "10px",
                    background: "rgba(239, 68, 68, 0.08)",
                    border: "1px solid rgba(239, 68, 68, 0.3)",
                    borderRadius: "var(--radius-sm)",
                    padding: "10px 14px",
                  }}
                >
                  <input
                    type="checkbox"
                    id="confirm-permanent-delete-checkbox"
                    checked={confirmPermanentDelete}
                    onChange={(e) => setConfirmPermanentDelete(e.target.checked)}
                    style={{ marginTop: "2px", accentColor: "var(--status-danger)", cursor: "pointer" }}
                  />
                  <label
                    htmlFor="confirm-permanent-delete-checkbox"
                    style={{ fontSize: "12px", color: "var(--text-primary)", cursor: "pointer", lineHeight: "1.4" }}
                  >
                    I understand that permanent deletion cannot be undone and these files will be permanently erased from disk immediately.
                  </label>
                </div>
              )}

              {/* Exact Targets Confirmation List */}
              <div>
                <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "6px", fontSize: "12px", color: "var(--text-muted)" }}>
                  <span>Exact target paths ({selectedItems.length}):</span>
                  <span>Estimated: {formatBytes(totalReclaimableSelected, 1)}</span>
                </div>

                <div
                  style={{
                    maxHeight: "150px",
                    overflowY: "auto",
                    background: "var(--bg-panel-subtle)",
                    border: "1px solid var(--border-subtle)",
                    borderRadius: "var(--radius-sm)",
                    padding: "8px 12px",
                    display: "flex",
                    flexDirection: "column",
                    gap: "6px",
                  }}
                >
                  {selectedItems.map((item) => (
                    <div
                      key={item.id}
                      style={{
                        display: "flex",
                        justifyContent: "space-between",
                        fontSize: "11.5px",
                        fontFamily: "'JetBrains Mono', monospace",
                        color: "var(--text-primary)",
                      }}
                    >
                      <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: "360px" }}>
                        {item.path}
                      </span>
                      <span style={{ color: "var(--accent)" }}>{formatBytes(item.reclaimableBytes, 0)}</span>
                    </div>
                  ))}
                </div>
              </div>

              {/* Safety & Pre-validation note */}
              <div style={{ display: "flex", alignItems: "center", gap: "6px", fontSize: "11.5px", color: "var(--text-muted)" }}>
                <Info size={13} color="var(--accent)" />
                <span>
                  Backend strictly revalidates path boundaries, non-symlink metadata, and permissions prior to deletion.
                </span>
              </div>

              {executionError && (
                <div style={{ color: "#F87171", fontSize: "12px", background: "rgba(239, 68, 68, 0.1)", padding: "8px 12px", borderRadius: "var(--radius-sm)" }}>
                  {executionError}
                </div>
              )}

              {isCleaning && (
                <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: "8px", color: "var(--accent)", fontSize: "13px" }}>
                    <RefreshCw size={14} className="spin-animation" style={{ animation: "spin 1s linear infinite" }} />
                    <span>Executing validated cleanup...</span>
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
                className={cleanupAction === "permanent_delete" ? "btn-danger" : "btn-primary"}
                onClick={async () => {
                  await handleExecuteCleanup();
                  setIsModalOpen(false);
                }}
                disabled={isCleaning || (cleanupAction === "permanent_delete" && !confirmPermanentDelete)}
              >
                {cleanupAction === "permanent_delete" ? <Trash2 size={15} /> : <Archive size={15} />}
                <span>
                  {isCleaning
                    ? "Processing..."
                    : cleanupAction === "permanent_delete"
                    ? "Permanently Delete Selected"
                    : "Move Selected to Trash"}
                </span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
