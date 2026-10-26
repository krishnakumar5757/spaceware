import React from "react";
import { FileItem } from "../../types/storage";
import { formatBytes } from "../../mock/storageData";
import { X, FileText, ShieldCheck } from "lucide-react";

interface InspectModalProps {
  file: FileItem | null;
  onClose: () => void;
}

export const InspectModal: React.FC<InspectModalProps> = ({ file, onClose }) => {
  if (!file) return null;

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal-content" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
            <FileText size={18} color="var(--accent)" />
            <span style={{ fontWeight: 700, fontSize: "15px" }}>File Details</span>
          </div>
          <button
            onClick={onClose}
            style={{ background: "none", border: "none", color: "var(--text-muted)", cursor: "pointer" }}
          >
            <X size={18} />
          </button>
        </div>

        <div className="modal-body">
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: "12px",
              background: "var(--bg-panel-subtle)",
              padding: "14px",
              borderRadius: "var(--radius-md)",
              border: "1px solid var(--border-subtle)",
            }}
          >
            <div className="file-icon-box" style={{ width: "36px", height: "36px", color: "var(--accent)" }}>
              <FileText size={20} />
            </div>
            <div style={{ overflow: "hidden" }}>
              <div style={{ fontWeight: 600, color: "var(--text-primary)", fontSize: "14px" }}>
                {file.name}
              </div>
              <div style={{ fontSize: "11px", color: "var(--text-muted)", fontFamily: "'JetBrains Mono', monospace" }}>
                {file.path}
              </div>
            </div>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px", fontSize: "13px" }}>
            <div style={{ background: "var(--bg-card)", padding: "10px 14px", borderRadius: "var(--radius-sm)", border: "1px solid var(--border-subtle)" }}>
              <span style={{ color: "var(--text-muted)", fontSize: "11px", display: "block" }}>Size</span>
              <strong style={{ color: "var(--accent)", fontVariantNumeric: "tabular-nums" }}>
                {formatBytes(file.sizeBytes, 2)}
              </strong>
            </div>

            <div style={{ background: "var(--bg-card)", padding: "10px 14px", borderRadius: "var(--radius-sm)", border: "1px solid var(--border-subtle)" }}>
              <span style={{ color: "var(--text-muted)", fontSize: "11px", display: "block" }}>Category</span>
              <strong style={{ color: "var(--text-primary)" }}>{file.category}</strong>
            </div>

            <div style={{ background: "var(--bg-card)", padding: "10px 14px", borderRadius: "var(--radius-sm)", border: "1px solid var(--border-subtle)" }}>
              <span style={{ color: "var(--text-muted)", fontSize: "11px", display: "block" }}>Modified</span>
              <span style={{ color: "var(--text-secondary)" }}>{file.lastModified}</span>
            </div>

            <div style={{ background: "var(--bg-card)", padding: "10px 14px", borderRadius: "var(--radius-sm)", border: "1px solid var(--border-subtle)" }}>
              <span style={{ color: "var(--text-muted)", fontSize: "11px", display: "block" }}>Last Accessed</span>
              <span style={{ color: "var(--text-secondary)" }}>{file.lastAccessed}</span>
            </div>
          </div>

          <div
            style={{
              fontSize: "12px",
              color: "var(--text-muted)",
              background: "var(--bg-card)",
              padding: "10px 14px",
              borderRadius: "var(--radius-sm)",
              border: "1px solid var(--border-subtle)",
              display: "flex",
              alignItems: "center",
              gap: "8px",
            }}
          >
            <ShieldCheck size={16} color="var(--status-success)" />
            <span>Filesystem action: Real deletion and file reveal commands will be hooked to Tauri in Milestone 2.</span>
          </div>
        </div>

        <div className="modal-footer">
          <button className="btn-secondary" onClick={onClose}>
            Close
          </button>
        </div>
      </div>
    </div>
  );
};
