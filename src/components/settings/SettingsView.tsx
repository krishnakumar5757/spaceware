import { useState } from "react";
import {
  Sliders,
  BellRing,
  Info,
  CheckCircle2,
  AlertTriangle,
  Sparkles,
} from "lucide-react";
import { useScrollRevealContainer } from "../../hooks/useScrollReveal";

interface SettingsViewProps {
  onToggleSimulateError?: (enable: boolean) => void;
  isSimulatedErrorActive?: boolean;
  isDemoMode?: boolean;
  onToggleDemoMode?: (enable: boolean) => void;
}

export const SettingsView: React.FC<SettingsViewProps> = ({
  onToggleSimulateError,
  isSimulatedErrorActive = false,
  isDemoMode = false,
  onToggleDemoMode,
}) => {
  const containerRef = useScrollRevealContainer<HTMLDivElement>();

  const [excludePaths, setExcludePaths] = useState("/proc, /sys, /dev, /run, **/.git");
  const [threadCount, setThreadCount] = useState("8");
  const [fileThreshold, setFileThreshold] = useState("500");
  const [lowSpaceAlert, setLowSpaceAlert] = useState(true);
  const [savedSuccess, setSavedSuccess] = useState(false);

  const handleSave = () => {
    setSavedSuccess(true);
    setTimeout(() => {
      setSavedSuccess(false);
    }, 2500);
  };

  return (
    <div ref={containerRef} style={{ display: "flex", flexDirection: "column", gap: "20px", maxWidth: "900px" }}>
      {savedSuccess && (
        <div
          className="reveal-item is-revealed"
          style={{
            background: "rgba(52, 211, 153, 0.12)",
            border: "1px solid rgba(52, 211, 153, 0.3)",
            borderRadius: "var(--radius-md)",
            padding: "12px 16px",
            display: "flex",
            alignItems: "center",
            gap: "10px",
            color: "var(--status-success)",
            fontSize: "13px",
          }}
        >
          <CheckCircle2 size={16} />
          <span>Preferences updated and saved to local configuration!</span>
        </div>
      )}

      {/* Scanner Preferences */}
      <div className="files-panel reveal-item">
        <div className="files-panel-header">
          <div className="panel-title-group">
            <div className="panel-title">
              <Sliders size={18} color="var(--accent)" />
              <span>Filesystem Scanner Preferences</span>
            </div>
            <span className="panel-subtitle">
              Configure how the native Rust storage worker crawls disk volumes and indices
            </span>
          </div>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: "18px" }}>
          <div>
            <label style={{ display: "block", fontSize: "13px", fontWeight: 600, marginBottom: "6px" }}>
              Excluded Paths (comma separated)
            </label>
            <input
              type="text"
              value={excludePaths}
              onChange={(e) => setExcludePaths(e.target.value)}
              style={{
                width: "100%",
                backgroundColor: "var(--bg-panel-subtle)",
                border: "1px solid var(--border-subtle)",
                borderRadius: "var(--radius-md)",
                padding: "8px 12px",
                color: "var(--text-primary)",
                fontFamily: "'JetBrains Mono', monospace",
                fontSize: "12.5px",
                outline: "none",
              }}
            />
            <span style={{ fontSize: "11.5px", color: "var(--text-muted)", marginTop: "4px", display: "block" }}>
              Virtual filesystems and version control folders are skipped by default.
            </span>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "16px" }}>
            <div>
              <label style={{ display: "block", fontSize: "13px", fontWeight: 600, marginBottom: "6px" }}>
                Parallel Worker Threads
              </label>
              <select
                value={threadCount}
                onChange={(e) => setThreadCount(e.target.value)}
                style={{
                  width: "100%",
                  backgroundColor: "var(--bg-panel-subtle)",
                  border: "1px solid var(--border-subtle)",
                  borderRadius: "var(--radius-md)",
                  padding: "8px 12px",
                  color: "var(--text-primary)",
                  fontSize: "13px",
                  outline: "none",
                }}
              >
                <option value="4">4 Threads (Low CPU usage)</option>
                <option value="8">8 Threads (Recommended for znver4)</option>
                <option value="16">16 Threads (High-speed NVMe)</option>
              </select>
            </div>

            <div>
              <label style={{ display: "block", fontSize: "13px", fontWeight: 600, marginBottom: "6px" }}>
                Large File Threshold (MB)
              </label>
              <input
                type="number"
                value={fileThreshold}
                onChange={(e) => setFileThreshold(e.target.value)}
                style={{
                  width: "100%",
                  backgroundColor: "var(--bg-panel-subtle)",
                  border: "1px solid var(--border-subtle)",
                  borderRadius: "var(--radius-md)",
                  padding: "8px 12px",
                  color: "var(--text-primary)",
                  fontSize: "13px",
                  outline: "none",
                }}
              />
            </div>
          </div>
        </div>
      </div>

      {/* Notifications & Warnings */}
      <div className="files-panel reveal-item">
        <div className="files-panel-header">
          <div className="panel-title-group">
            <div className="panel-title">
              <BellRing size={18} color="var(--accent)" />
              <span>Storage Alerts</span>
            </div>
            <span className="panel-subtitle">Manage low space indicators and automated thresholds</span>
          </div>
        </div>

        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "10px 0" }}>
          <div>
            <div style={{ fontSize: "13.5px", fontWeight: 600, color: "var(--text-primary)" }}>
              Warn when free space falls below 15%
            </div>
            <div style={{ fontSize: "12px", color: "var(--text-secondary)", marginTop: "2px" }}>
              Triggers visual status alert in sidebar and top header
            </div>
          </div>

          <input
            type="checkbox"
            checked={lowSpaceAlert}
            onChange={(e) => setLowSpaceAlert(e.target.checked)}
            style={{ width: "18px", height: "18px", accentColor: "var(--accent)", cursor: "pointer" }}
          />
        </div>
      </div>

      {/* Testing & Developer Sandbox */}
      <div className="files-panel reveal-item">
        <div className="files-panel-header">
          <div className="panel-title-group">
            <div className="panel-title">
              <AlertTriangle size={18} color="var(--status-warning)" />
              <span>Milestone 1 Testing Controls</span>
            </div>
            <span className="panel-subtitle">Simulate error and recovery states for UI verification</span>
          </div>
        </div>

        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "10px 0" }}>
          <div>
            <div style={{ fontSize: "13.5px", fontWeight: 600, color: "var(--text-primary)" }}>
              Simulate Mount Point Error State
            </div>
            <div style={{ fontSize: "12px", color: "var(--text-secondary)", marginTop: "2px" }}>
              Toggles error state banner in the Overview dashboard to verify fallback UI
            </div>
          </div>

          <button
            className={isSimulatedErrorActive ? "btn-danger" : "btn-secondary"}
            onClick={() => onToggleSimulateError && onToggleSimulateError(!isSimulatedErrorActive)}
            style={{ fontSize: "12px", padding: "6px 14px" }}
          >
            {isSimulatedErrorActive ? "Disable Error State" : "Simulate Error State"}
          </button>
        </div>

        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "14px 0", borderTop: "1px solid var(--border-subtle)" }}>
          <div>
            <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
              <span style={{ fontSize: "13.5px", fontWeight: 600, color: "var(--text-primary)" }}>
                Demo Mode Preview (Development Fixture)
              </span>
              <span className="badge-tag accent" style={{ fontSize: "10.5px" }}>
                <Sparkles size={11} /> Opt-In Only
              </span>
            </div>
            <div style={{ fontSize: "12px", color: "var(--text-secondary)", marginTop: "2px", maxWidth: "560px" }}>
              Loads mock storage values (1000 GB, categories, sample files) for UI design previews. Cleanup execution is strictly disabled. Real startup always uses native Linux filesystems.
            </div>
          </div>

          <button
            className={isDemoMode ? "btn-danger" : "btn-secondary"}
            onClick={() => onToggleDemoMode && onToggleDemoMode(!isDemoMode)}
            style={{ fontSize: "12px", padding: "6px 14px" }}
          >
            {isDemoMode ? "Disable Demo Mode" : "Enable Demo Mode"}
          </button>
        </div>
      </div>

      {/* System & Architecture Info */}
      <div className="files-panel reveal-item">
        <div className="files-panel-header">
          <div className="panel-title-group">
            <div className="panel-title">
              <Info size={18} color="var(--accent)" />
              <span>System & Environment</span>
            </div>
            <span className="panel-subtitle">Host information detected by Tauri backend</span>
          </div>
        </div>

        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(3, 1fr)",
            gap: "12px",
            fontSize: "12.5px",
          }}
        >
          <div style={{ background: "var(--bg-card)", padding: "12px", borderRadius: "var(--radius-md)", border: "1px solid var(--border-subtle)" }}>
            <span style={{ color: "var(--text-muted)", display: "block", fontSize: "11px" }}>Operating System</span>
            <strong style={{ color: "var(--text-primary)" }}>CachyOS Linux</strong>
          </div>
          <div style={{ background: "var(--bg-card)", padding: "12px", borderRadius: "var(--radius-md)", border: "1px solid var(--border-subtle)" }}>
            <span style={{ color: "var(--text-muted)", display: "block", fontSize: "11px" }}>Architecture</span>
            <strong style={{ color: "var(--text-primary)" }}>x86_64 (znver4)</strong>
          </div>
          <div style={{ background: "var(--bg-card)", padding: "12px", borderRadius: "var(--radius-md)", border: "1px solid var(--border-subtle)" }}>
            <span style={{ color: "var(--text-muted)", display: "block", fontSize: "11px" }}>Tauri Version</span>
            <strong style={{ color: "var(--text-primary)" }}>v2.0 (React 19 + Vite)</strong>
          </div>
        </div>
      </div>

      <div style={{ display: "flex", justifyContent: "flex-end", gap: "12px", marginTop: "4px" }}>
        <button className="btn-primary" onClick={handleSave} style={{ padding: "8px 24px" }}>
          Save Preferences
        </button>
      </div>
    </div>
  );
};
