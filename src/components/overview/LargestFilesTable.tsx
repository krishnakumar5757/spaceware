import React, { useState, useMemo } from "react";
import {
  FileText,
  Search,
  ArrowUpDown,
  ArrowUp,
  ArrowDown,
  Video,
  Box,
  FileCode,
  Archive,
  Eye,
} from "lucide-react";
import { FileItem } from "../../types/storage";
import { formatBytes } from "../../mock/storageData";
import { RefreshCw } from "lucide-react";

interface LargestFilesTableProps {
  files: FileItem[];
  onInspectFile?: (file: FileItem) => void;
  onTriggerScan?: () => void;
}

type SortField = "size" | "name" | "lastModified";
type SortOrder = "asc" | "desc";

export const LargestFilesTable: React.FC<LargestFilesTableProps> = ({
  files,
  onInspectFile,
  onTriggerScan,
}) => {
  const [searchQuery, setSearchQuery] = useState("");
  const [sortField, setSortField] = useState<SortField>("size");
  const [sortOrder, setSortOrder] = useState<SortOrder>("desc");

  const handleSort = (field: SortField) => {
    if (sortField === field) {
      setSortOrder(sortOrder === "asc" ? "desc" : "asc");
    } else {
      setSortField(field);
      setSortOrder("desc");
    }
  };

  const filteredAndSortedFiles = useMemo(() => {
    return files
      .filter((file) => {
        const query = searchQuery.toLowerCase();
        return (
          file.name.toLowerCase().includes(query) ||
          file.path.toLowerCase().includes(query) ||
          file.category.toLowerCase().includes(query)
        );
      })
      .sort((a, b) => {
        let diff = 0;
        if (sortField === "size") {
          diff = a.sizeBytes - b.sizeBytes;
        } else if (sortField === "name") {
          diff = a.name.localeCompare(b.name);
        } else if (sortField === "lastModified") {
          diff = a.lastModified.localeCompare(b.lastModified);
        }
        return sortOrder === "asc" ? diff : -diff;
      });
  }, [files, searchQuery, sortField, sortOrder]);

  const getFileIcon = (ext: string) => {
    switch (ext.toLowerCase()) {
      case "mov":
      case "mp4":
      case "braw":
        return <Video size={15} color="#38BDF8" />;
      case "iso":
      case "tar":
      case "zst":
      case "zip":
        return <Archive size={15} color="#FBBF24" />;
      case "raw":
      case "safetensors":
      case "vpk":
        return <Box size={15} color="#A78BFA" />;
      case "rs":
      case "ts":
      case "js":
      case "json":
        return <FileCode size={15} color="#C7F36B" />;
      default:
        return <FileText size={15} color="#A4A8B3" />;
    }
  };

  const renderSortIndicator = (field: SortField) => {
    if (sortField !== field) {
      return <ArrowUpDown size={12} style={{ opacity: 0.4 }} />;
    }
    return sortOrder === "asc" ? (
      <ArrowUp size={12} color="var(--accent)" />
    ) : (
      <ArrowDown size={12} color="var(--accent)" />
    );
  };

  return (
    <div className="files-panel reveal-item">
      <div className="files-panel-header">
        <div className="panel-title-group">
          <div className="panel-title">
            <FileText size={18} color="var(--accent)" />
            <span>Largest Detected Files</span>
          </div>
          <span className="panel-subtitle">
            Top storage-consuming files identified across primary directories
          </span>
        </div>

        <div className="files-search-filter">
          <div className="search-input-box">
            <Search size={14} color="var(--text-muted)" />
            <input
              type="text"
              placeholder="Filter by name, path..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </div>
        </div>
      </div>

      {files.length === 0 ? (
        <div className="state-box" style={{ padding: "44px 20px", margin: "10px 0" }}>
          <div className="state-icon" style={{ color: "var(--accent)" }}>
            <FileText size={24} />
          </div>
          <div className="state-title">Largest Files Not Scanned Yet</div>
          <div className="state-desc" style={{ maxWidth: "420px" }}>
            Top storage-consuming files across your drive will be discovered and listed here after running a storage scan.
          </div>
          {onTriggerScan && (
            <button
              className="btn-primary"
              onClick={onTriggerScan}
              style={{ marginTop: "12px", fontSize: "12.5px" }}
            >
              <RefreshCw size={13} />
              <span>Scan Storage</span>
            </button>
          )}
        </div>
      ) : filteredAndSortedFiles.length === 0 ? (
        <div style={{ padding: "32px 0", textAlign: "center", color: "var(--text-muted)" }}>
          No files match "<strong>{searchQuery}</strong>". Try a different query.
        </div>
      ) : (
        <div className="data-table-container">
          <table className="spacewise-table">
            <thead>
              <tr>
                <th
                  className="sortable"
                  onClick={() => handleSort("name")}
                  style={{ width: "42%" }}
                >
                  <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                    <span>File & Location</span>
                    {renderSortIndicator("name")}
                  </div>
                </th>
                <th style={{ width: "20%" }}>Category</th>
                <th
                  className="sortable"
                  onClick={() => handleSort("size")}
                  style={{ width: "16%" }}
                >
                  <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                    <span>Size</span>
                    {renderSortIndicator("size")}
                  </div>
                </th>
                <th
                  className="sortable"
                  onClick={() => handleSort("lastModified")}
                  style={{ width: "14%" }}
                >
                  <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                    <span>Modified</span>
                    {renderSortIndicator("lastModified")}
                  </div>
                </th>
                <th style={{ width: "8%", textAlign: "right" }}>Action</th>
              </tr>
            </thead>
            <tbody>
              {filteredAndSortedFiles.map((file) => (
                <tr key={file.id}>
                  <td>
                    <div className="table-file-cell">
                      <div className="file-icon-box">{getFileIcon(file.extension)}</div>
                      <div className="file-name-meta">
                        <span className="file-name-text" title={file.name}>
                          {file.name}
                        </span>
                        <span className="file-path-subtle" title={file.path}>
                          {file.path}
                        </span>
                      </div>
                    </div>
                  </td>
                  <td>
                    <span className="category-tag">{file.category}</span>
                  </td>
                  <td>
                    <span className="table-size-badge">
                      {formatBytes(file.sizeBytes, 1)}
                    </span>
                  </td>
                  <td>
                    <span style={{ fontSize: "12px", color: "var(--text-secondary)" }}>
                      {file.lastModified}
                    </span>
                  </td>
                  <td style={{ textAlign: "right" }}>
                    <button
                      className="btn-secondary"
                      style={{ padding: "4px 8px", fontSize: "11px" }}
                      title="Inspect in file browser"
                      onClick={() => onInspectFile && onInspectFile(file)}
                    >
                      <Eye size={12} />
                      <span>Inspect</span>
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
};
