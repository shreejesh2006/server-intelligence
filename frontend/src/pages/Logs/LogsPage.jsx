import React, { useState, useEffect, useCallback } from 'react';
import { useServer } from '../../context/ServerContext';
import { useTimezone } from '../../context/TimezoneContext';
import { queryLogs, getLogsHealth } from '../../services/logs';
import {
  Search,
  RefreshCw,
  Server,
  Filter,
  Clock,
  Terminal,
  AlertTriangle,
  ChevronDown,
  ChevronRight,
} from 'lucide-react';

const SEVERITY_LEVELS = ['ALL', 'CRITICAL', 'ERROR', 'WARN', 'INFO', 'DEBUG'];
const TIME_RANGES = [
  { label: 'Last 15m', value: '-15m' },
  { label: 'Last 1h', value: '-1h' },
  { label: 'Last 6h', value: '-6h' },
  { label: 'Last 24h', value: '-24h' },
];

export function LogsPage() {
  const { selectedHost, servers } = useServer();
  const { formatTimestamp } = useTimezone();

  const [logs, setLogs] = useState([]);
  const [_totalCount, setTotalCount] = useState(0);
  const [logSource, setLogSource] = useState('none');
  const [healthStatus, setHealthStatus] = useState('checking');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // Filters
  const [searchQuery, setSearchQuery] = useState('');
  const [hostFilter, setHostFilter] = useState(selectedHost || 'all');
  const [levelFilter, setLevelFilter] = useState('ALL');
  const [timeRange, setTimeRange] = useState('-1h');
  const [expandedLogId, setExpandedLogId] = useState(null);
  const [autoRefresh, setAutoRefresh] = useState(false);

  // Fetch logs
  const fetchLogs = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = {
        start: timeRange,
        end: 'now',
        limit: 150,
      };
      if (hostFilter && hostFilter !== 'all') {
        params.host = hostFilter;
      }
      if (levelFilter && levelFilter !== 'ALL') {
        params.level = levelFilter;
      }
      if (searchQuery.trim()) {
        params.query = searchQuery.trim();
      }

      const [logsRes, healthRes] = await Promise.all([
        queryLogs(params),
        getLogsHealth().catch(() => ({ status: 'unavailable' })),
      ]);

      if (logsRes && logsRes.status === 'success') {
        setLogs(logsRes.logs || []);
        setTotalCount(logsRes.total || (logsRes.logs ? logsRes.logs.length : 0));
        setLogSource(logsRes.source || 'victorialogs');
      } else {
        setLogs([]);
        setTotalCount(0);
      }
      setHealthStatus(healthRes.status || 'unavailable');
    } catch (err) {
      setError(err?.message || 'Failed to fetch logs from server');
      setLogs([]);
    } finally {
      setLoading(false);
    }
  }, [hostFilter, levelFilter, timeRange, searchQuery]);

  useEffect(() => {
    fetchLogs();
  }, [fetchLogs]);

  // Optional auto-refresh interval
  useEffect(() => {
    if (!autoRefresh) return;
    const interval = setInterval(() => {
      fetchLogs();
    }, 10000);
    return () => clearInterval(interval);
  }, [autoRefresh, fetchLogs]);

  const toggleExpand = (id) => {
    setExpandedLogId(expandedLogId === id ? null : id);
  };

  const getLevelBadgeClass = (level) => {
    const l = (level || '').toUpperCase();
    if (l === 'CRITICAL') return 'badge-critical';
    if (l === 'ERROR') return 'badge-error';
    if (l === 'WARN' || l === 'WARNING') return 'badge-warning';
    return 'badge-info';
  };

  return (
    <div className="logs-page">
      {/* Top Header */}
      <div className="page-header">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="page-title">Operational Logs</h1>
            <span className={`status-pill ${healthStatus === 'connected' ? 'status-live' : 'status-fallback'}`}>
              {healthStatus === 'connected' ? 'VictoriaLogs Live' : 'Database Storage Active'}
            </span>
          </div>
          <p className="page-subtitle font-mono">
            Centralized Log Observability & LogSQL Inspection · VictoriaLogs :9428
          </p>
        </div>

        <div className="header-actions">
          <button
            type="button"
            className={`btn-ghost ${autoRefresh ? 'active-pulse' : ''}`}
            onClick={() => setAutoRefresh(!autoRefresh)}
            title="Auto-refresh logs every 10 seconds"
          >
            Live Poll {autoRefresh ? 'ON' : 'OFF'}
          </button>
          <button
            type="button"
            className="btn-primary flex items-center gap-2"
            onClick={fetchLogs}
            disabled={loading}
          >
            <RefreshCw size={14} className={loading ? 'spinning' : ''} />
            <span>Refresh</span>
          </button>
        </div>
      </div>

      {/* Filter and Search Bar */}
      <div className="filters-card">
        <div className="filter-group-main">
          <div className="search-box">
            <Search size={14} className="search-icon" />
            <input
              type="text"
              placeholder="Filter by keyword, service, error message..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="search-input"
            />
          </div>

          <div className="select-wrapper">
            <Server size={14} className="select-icon" />
            <select
              value={hostFilter}
              onChange={(e) => setHostFilter(e.target.value)}
              className="filter-select"
            >
              <option value="all">All Monitored Hosts</option>
              {servers.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name} ({s.id})
                </option>
              ))}
            </select>
          </div>

          <div className="select-wrapper">
            <Filter size={14} className="select-icon" />
            <select
              value={levelFilter}
              onChange={(e) => setLevelFilter(e.target.value)}
              className="filter-select"
            >
              {SEVERITY_LEVELS.map((lvl) => (
                <option key={lvl} value={lvl}>
                  Severity: {lvl}
                </option>
              ))}
            </select>
          </div>

          <div className="select-wrapper">
            <Clock size={14} className="select-icon" />
            <select
              value={timeRange}
              onChange={(e) => setTimeRange(e.target.value)}
              className="filter-select"
            >
              {TIME_RANGES.map((tr) => (
                <option key={tr.value} value={tr.value}>
                  {tr.label}
                </option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {/* Main Log Viewer */}
      <div className="log-viewer-container">
        <div className="viewer-meta-bar">
          <span className="meta-text font-mono">
            SHOWING {logs.length} LOG EVENTS · SOURCE: {logSource.toUpperCase()}
          </span>
          {loading && <span className="meta-text font-mono animate-pulse">STREAMING...</span>}
        </div>

        {error && (
          <div className="error-banner">
            <AlertTriangle size={16} />
            <span>{error}</span>
          </div>
        )}

        {logs.length === 0 && !loading && (
          <div className="empty-state">
            <Terminal size={32} className="empty-icon" />
            <h3>No Operational Logs Found</h3>
            <p>No log events matched the active filters for the selected time horizon.</p>
          </div>
        )}

        <div className="log-entries-list font-mono">
          {logs.map((entry, idx) => {
            const entryId = entry.id || idx;
            const isExpanded = expandedLogId === entryId;

            return (
              <div key={entryId} className={`log-row ${isExpanded ? 'log-row-expanded' : ''}`}>
                <div className="log-row-summary" onClick={() => toggleExpand(entryId)}>
                  <button type="button" className="expand-chevron">
                    {isExpanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                  </button>

                  <span className="log-ts">
                    {entry.timestamp ? formatTimestamp(entry.timestamp) : 'N/A'}
                  </span>

                  <span className={`log-badge ${getLevelBadgeClass(entry.level)}`}>
                    {entry.level || 'INFO'}
                  </span>

                  <span className="log-host font-semibold">
                    {entry.host || 'ubuntu'}
                  </span>

                  <span className="log-source">
                    [{entry.source || 'system'}]
                  </span>

                  <span className="log-msg">
                    {entry.message}
                  </span>
                </div>

                {isExpanded && (
                  <div className="log-detail-drawer">
                    <div className="detail-grid">
                      <div className="detail-item">
                        <span className="detail-label">HOST IDENTIFIER</span>
                        <span className="detail-val">{entry.host}</span>
                      </div>
                      <div className="detail-item">
                        <span className="detail-label">EXACT TIMESTAMP</span>
                        <span className="detail-val">{entry.timestamp}</span>
                      </div>
                      <div className="detail-item">
                        <span className="detail-label">SOURCE COMPONENT</span>
                        <span className="detail-val">{entry.source}</span>
                      </div>
                      <div className="detail-item">
                        <span className="detail-label">SEVERITY LEVEL</span>
                        <span className="detail-val">{entry.level}</span>
                      </div>
                    </div>
                    <div className="raw-msg-block">
                      <div className="raw-msg-title">SANITIZED LOG MESSAGE</div>
                      <pre className="raw-msg-text">{entry.message}</pre>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      <style>{`
        .logs-page {
          padding: 24px 32px;
          display: flex;
          flex-direction: column;
          gap: 20px;
        }

        .page-header {
          display: flex;
          align-items: center;
          justify-content: space-between;
        }

        .page-title {
          font-size: 20px;
          font-weight: 600;
          color: var(--text-primary);
          margin: 0;
        }

        .page-subtitle {
          font-size: 11px;
          color: var(--text-muted);
          margin-top: 4px;
        }

        .status-pill {
          font-size: 10px;
          font-weight: 600;
          padding: 2px 8px;
          border-radius: 12px;
          letter-spacing: 0.05em;
        }

        .status-live {
          background-color: rgba(34, 197, 94, 0.15);
          color: #22c55e;
          border: 1px solid rgba(34, 197, 94, 0.3);
        }

        .status-fallback {
          background-color: rgba(59, 130, 246, 0.15);
          color: #3b82f6;
          border: 1px solid rgba(59, 130, 246, 0.3);
        }

        .header-actions {
          display: flex;
          align-items: center;
          gap: 12px;
        }

        .btn-ghost {
          background: transparent;
          border: 1px solid var(--border-subtle);
          color: var(--text-secondary);
          padding: 6px 14px;
          border-radius: var(--radius-sm);
          font-size: 12px;
          cursor: pointer;
          transition: all 0.15s ease;
        }

        .btn-ghost:hover {
          background: var(--bg-subtle);
          color: var(--text-primary);
        }

        .active-pulse {
          border-color: var(--accent);
          color: var(--accent);
        }

        .btn-primary {
          background: var(--accent);
          color: #ffffff;
          border: none;
          padding: 6px 14px;
          border-radius: var(--radius-sm);
          font-size: 12px;
          font-weight: 500;
          cursor: pointer;
          display: flex;
          align-items: center;
          gap: 6px;
        }

        .btn-primary:hover:not(:disabled) {
          opacity: 0.9;
        }

        .spinning {
          animation: spin 1s linear infinite;
        }

        @keyframes spin {
          100% { transform: rotate(360deg); }
        }

        .filters-card {
          background: var(--bg-surface);
          border: 1px solid var(--border-subtle);
          border-radius: var(--radius-sm);
          padding: 12px 16px;
        }

        .filter-group-main {
          display: flex;
          flex-wrap: wrap;
          gap: 12px;
          align-items: center;
        }

        .search-box {
          position: relative;
          flex: 1;
          min-width: 250px;
        }

        .search-icon {
          position: absolute;
          left: 10px;
          top: 50%;
          transform: translateY(-50%);
          color: var(--text-muted);
        }

        .search-input {
          width: 100%;
          padding: 6px 12px 6px 32px;
          background: var(--bg-surface-elevated, #ffffff);
          border: 1px solid var(--border-subtle);
          border-radius: var(--radius-sm);
          color: var(--text-primary);
          font-size: 12px;
        }

        .select-wrapper {
          position: relative;
          display: flex;
          align-items: center;
        }

        .select-icon {
          position: absolute;
          left: 10px;
          color: var(--text-muted);
          pointer-events: none;
        }

        .filter-select {
          padding: 6px 12px 6px 30px;
          background: var(--bg-surface-elevated, #ffffff);
          border: 1px solid var(--border-subtle);
          border-radius: var(--radius-sm);
          color: var(--text-primary);
          font-size: 12px;
          cursor: pointer;
        }

        .log-viewer-container {
          background: var(--bg-surface);
          border: 1px solid var(--border-subtle);
          border-radius: var(--radius-sm);
          overflow: hidden;
          display: flex;
          flex-direction: column;
        }

        .viewer-meta-bar {
          background: var(--bg-subtle);
          padding: 8px 16px;
          display: flex;
          justify-content: space-between;
          border-bottom: 1px solid var(--border-subtle);
          font-size: 10px;
          color: var(--text-muted);
          letter-spacing: 0.05em;
        }

        .log-entries-list {
          display: flex;
          flex-direction: column;
          font-size: 11px;
          max-height: 650px;
          overflow-y: auto;
        }

        .log-row {
          border-bottom: 1px solid var(--border-subtle);
          transition: background 0.1s ease;
        }

        .log-row:hover {
          background: var(--bg-subtle);
        }

        .log-row-summary {
          display: flex;
          align-items: center;
          gap: 12px;
          padding: 8px 14px;
          cursor: pointer;
        }

        .expand-chevron {
          background: transparent;
          border: none;
          color: var(--text-muted);
          cursor: pointer;
          display: flex;
          align-items: center;
          padding: 0;
        }

        .log-ts {
          color: var(--text-muted);
          font-size: 10px;
          white-space: nowrap;
          width: 130px;
          flex-shrink: 0;
        }

        .log-badge {
          font-size: 9px;
          font-weight: 700;
          padding: 1px 6px;
          border-radius: 4px;
          width: 55px;
          text-align: center;
          flex-shrink: 0;
        }

        .badge-critical {
          background-color: rgba(239, 68, 68, 0.2);
          color: #ef4444;
          border: 1px solid rgba(239, 68, 68, 0.3);
        }

        .badge-error {
          background-color: rgba(249, 115, 22, 0.2);
          color: #f97316;
          border: 1px solid rgba(249, 115, 22, 0.3);
        }

        .badge-warning {
          background-color: rgba(234, 179, 8, 0.2);
          color: #eab308;
          border: 1px solid rgba(234, 179, 8, 0.3);
        }

        .badge-info {
          background-color: rgba(59, 130, 246, 0.15);
          color: #3b82f6;
          border: 1px solid rgba(59, 130, 246, 0.25);
        }

        .log-host {
          color: var(--text-secondary);
          width: 70px;
          flex-shrink: 0;
        }

        .log-source {
          color: var(--text-muted);
          width: 100px;
          flex-shrink: 0;
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
        }

        .log-msg {
          color: var(--text-primary);
          flex: 1;
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
        }

        .log-detail-drawer {
          background: var(--bg-subtle);
          padding: 12px 20px 14px 40px;
          border-top: 1px dashed var(--border-subtle);
        }

        .detail-grid {
          display: grid;
          grid-template-columns: repeat(4, 1fr);
          gap: 12px;
          margin-bottom: 12px;
        }

        .detail-item {
          display: flex;
          flex-direction: column;
          gap: 2px;
        }

        .detail-label {
          font-size: 9px;
          color: var(--text-muted);
          letter-spacing: 0.05em;
        }

        .detail-val {
          font-size: 11px;
          color: var(--text-primary);
        }

        .raw-msg-block {
          background: var(--bg-surface);
          border: 1px solid var(--border-subtle);
          border-radius: var(--radius-sm);
          padding: 8px 12px;
        }

        .raw-msg-title {
          font-size: 9px;
          color: var(--text-muted);
          margin-bottom: 4px;
        }

        .raw-msg-text {
          margin: 0;
          white-space: pre-wrap;
          word-break: break-all;
          font-size: 11px;
          color: var(--text-primary);
        }

        .empty-state {
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          padding: 48px 16px;
          color: var(--text-muted);
          text-align: center;
        }

        .empty-icon {
          margin-bottom: 12px;
          opacity: 0.4;
        }

        .error-banner {
          background: rgba(239, 68, 68, 0.1);
          color: #ef4444;
          padding: 10px 16px;
          display: flex;
          align-items: center;
          gap: 8px;
          font-size: 12px;
        }
      `}</style>
    </div>
  );
}

export default LogsPage;
