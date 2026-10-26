import React from "react";
import { Loader2, FolderSearch, AlertTriangle, RefreshCw } from "lucide-react";

interface LoadingStateProps {
  title?: string;
  message?: string;
}

export const LoadingState: React.FC<LoadingStateProps> = ({
  title = "Analyzing Storage...",
  message = "Traversing directory trees, computing btrfs extents, and cataloging file sizes.",
}) => {
  return (
    <div className="state-box">
      <div className="state-icon" style={{ color: "var(--accent)" }}>
        <Loader2 size={28} className="spin-animation" style={{ animation: "spin 1s linear infinite" }} />
      </div>
      <div className="state-title">{title}</div>
      <div className="state-desc">{message}</div>
    </div>
  );
};

interface EmptyStateProps {
  title?: string;
  message?: string;
  actionLabel?: string;
  onAction?: () => void;
}

export const EmptyState: React.FC<EmptyStateProps> = ({
  title = "No files or items found",
  message = "Try clearing search filters or adjusting the minimum file size threshold.",
  actionLabel,
  onAction,
}) => {
  return (
    <div className="state-box">
      <div className="state-icon">
        <FolderSearch size={26} />
      </div>
      <div className="state-title">{title}</div>
      <div className="state-desc">{message}</div>
      {actionLabel && onAction && (
        <button className="btn-secondary" onClick={onAction}>
          {actionLabel}
        </button>
      )}
    </div>
  );
};

interface ErrorStateProps {
  title?: string;
  message?: string;
  onRetry?: () => void;
}

export const ErrorState: React.FC<ErrorStateProps> = ({
  title = "Unable to inspect storage volume",
  message = "The mount point is currently busy or requires elevated permissions to scan.",
  onRetry,
}) => {
  return (
    <div className="state-box" style={{ borderColor: "rgba(248, 113, 113, 0.3)" }}>
      <div className="state-icon" style={{ color: "var(--status-danger)", backgroundColor: "var(--status-danger-bg)" }}>
        <AlertTriangle size={26} />
      </div>
      <div className="state-title" style={{ color: "var(--status-danger)" }}>{title}</div>
      <div className="state-desc">{message}</div>
      {onRetry && (
        <button className="btn-secondary" onClick={onRetry}>
          <RefreshCw size={14} /> Retry Scan
        </button>
      )}
    </div>
  );
};
