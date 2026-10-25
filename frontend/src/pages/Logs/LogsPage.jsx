import React, { useState, useEffect, useCallback } from 'react';
import { useServer } from '../../context/ServerContext';
import { useTimezone } from '../../context/TimezoneContext';
import { queryLogs } from '../../services/logs';
import {
  Search,
  RefreshCw,
  Server as ServerIcon,
  Terminal,
  AlertTriangle,
  ChevronDown,
  ChevronRight,
} from 'lucide-react';

const SEVERITY_LEVELS = ['ALL', 'CRITICAL', 'ERROR', 'WARN', 'INFO'];
const TIME_RANGES = [
  { label: '15m', value: '-15m' },
  { label: '1h', value: '-1h' },
  { label: '6h', value: '-6h' },
  { label: '24h', value: '-24h' },
];

export function LogsPage() {
  const { selectedHost, servers, selectServer, activeServer } = useServer();
  const { formatTimestamp } = useTimezone();

  const [logs, setLogs] = useState([]);
  const [logSource, setLogSource] = useState('victorialogs');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // Filters
  const [searchQuery, setSearchQuery] = useState('');
  const [levelFilter, setLevelFilter] = useState('ALL');
  const [timeRange, setTimeRange] = useState('-1h');
  const [expandedLogId, setExpandedLogId] = useState(null);
  const [autoRefresh, setAutoRefresh] = useState(false);

  // Fetch logs for currently selected host
  const fetchLogs = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = {
        host: selectedHost,
        start: timeRange,
        end: 'now',
        limit: 150,
      };
      if (levelFilter && levelFilter !== 'ALL') {
        params.level = levelFilter;
      }
      if (searchQuery.trim()) {
        params.query = searchQuery.trim();
      }

      const logsRes = await queryLogs(params);

      if (logsRes && logsRes.status === 'success') {
        setLogs(logsRes.logs || []);
        setLogSource(logsRes.source || 'victorialogs');
      } else {
        setLogs([]);
      }
    } catch (err) {
      setError(err?.response?.data?.detail || err?.message || 'Failed to fetch logs from server');
      setLogs([]);
    } finally {
      setLoading(false);
    }
  }, [selectedHost, levelFilter, timeRange, searchQuery]);

  useEffect(() => {
    fetchLogs();
  }, [fetchLogs]);

  // Live polling stream
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

  const getLevelBadge = (level) => {
    const l = (level || '').toUpperCase();
    if (l === 'CRITICAL') return { label: 'CRIT', class: 'badge-critical' };
    if (l === 'ERROR') return { label: 'ERR', class: 'badge-critical' };
    if (l === 'WARN' || l === 'WARNING') return { label: 'WARN', class: 'badge-warning' };
    return { label: 'INFO', class: 'badge-info' };
  };

  return (
    <div className="netra-logs-page font-sans">
      {/* 1. PAGE HEADER WITH ACTIVE HOST SELECTOR */}
      <div className="dashboard-main-header">
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <h1 className="header-page-title font-sans">Logs</h1>
          <span
            className={`text-xs px-2 py-0.5 rounded border ${
              activeServer?.isLive
                ? 'border-emerald-500/30 text-emerald-400 bg-emerald-500/10'
                : 'border-slate-500/30 text-slate-400 bg-slate-500/10'
            }`}
            style={{ fontSize: '11px', letterSpacing: '0.02em' }}
          >
            {activeServer?.environment || (selectedHost === 'ubuntu' ? 'Live Infrastructure' : 'Simulated Infrastructure')}
          </span>
        </div>

        <div className="server-host-selector font-sans">
          <span className="selector-label font-sans">Host:</span>
          {servers.map((s) => (
            <button
              key={s.host}
              type="button"
              onClick={() => selectServer(s.host)}
              className={`host-tab-btn ${selectedHost === s.host ? 'active' : ''}`}
            >
              <ServerIcon size={12} />
              <span>{s.name}</span>
            </button>
          ))}
        </div>
      </div>

      {/* 2. FILTER & SEARCH CONTROL STRIP */}
      <div className="netra-panel filter-panel">
        <div className="filter-controls-row">
          {/* Keyword Search */}
          <div className="search-box">
            <Search size={14} className="search-icon" />
            <input
              type="text"
              placeholder="Search log messages, services, or events..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="search-input font-sans"
            />
          </div>

          {/* Severity Tabs */}
          <div className="filter-section">
            <span className="filter-label">Severity:</span>
            <div className="segmented-tabs font-sans">
              {SEVERITY_LEVELS.map((lvl) => (
                <button
                  key={lvl}
                  type="button"
                  onClick={() => setLevelFilter(lvl)}
                  className={`tab-btn ${levelFilter === lvl ? 'active' : ''}`}
                >
                  {lvl}
                </button>
              ))}
            </div>
          </div>

          {/* Time Window Tabs */}
          <div className="filter-section">
            <span className="filter-label">Window:</span>
            <div className="segmented-tabs font-sans">
              {TIME_RANGES.map((tr) => (
                <button
                  key={tr.value}
                  type="button"
                  onClick={() => setTimeRange(tr.value)}
                  className={`tab-btn ${timeRange === tr.value ? 'active' : ''}`}
                >
                  {tr.label}
                </button>
              ))}
            </div>
          </div>

          {/* Live Stream & Refresh */}
          <div className="filter-actions">
            <button
              type="button"
              onClick={() => setAutoRefresh(!autoRefresh)}
              className={`stream-toggle-btn font-sans ${autoRefresh ? 'active' : ''}`}
              title="Toggle automatic 10-second polling"
            >
              <span className={`stream-dot ${autoRefresh ? 'dot-active' : ''}`} />
              Live Stream
            </button>

            <button
              type="button"
              onClick={fetchLogs}
              disabled={loading}
              className="refresh-btn font-sans"
              title="Refresh logs"
            >
              <RefreshCw size={13} className={loading ? 'spinning' : ''} />
            </button>
          </div>
        </div>
      </div>

      {/* 3. LOG VIEWER PANEL */}
      <div className="netra-panel logs-panel">
        <div className="panel-title-bar">
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <h2 className="panel-title font-sans">System & Application Logs</h2>
            <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
              {logs.length} events · Source: {logSource}
            </span>
          </div>
          {loading && <span className="loading-text font-sans">Syncing...</span>}
        </div>

        {error && (
          <div className="error-banner font-sans">
            <AlertTriangle size={15} />
            <span>{error}</span>
          </div>
        )}

        {logs.length === 0 && !loading && (
          <div className="empty-state font-sans">
            <Terminal size={32} className="empty-icon" />
            <h3 className="empty-title">No Logs Found</h3>
            <p className="empty-desc">No log events match the active filter criteria for {activeServer?.name || selectedHost}.</p>
          </div>
        )}

        <div className="log-entries-list font-sans">
          {logs.map((entry, idx) => {
            const entryId = entry.id || idx;
            const isExpanded = expandedLogId === entryId;
            const badge = getLevelBadge(entry.level);

            return (
              <div key={entryId} className={`log-row ${isExpanded ? 'log-row-expanded' : ''}`}>
                <div className="log-row-summary" onClick={() => toggleExpand(entryId)}>
                  <button type="button" className="expand-chevron" aria-label="Toggle details">
                    {isExpanded ? <ChevronDown size={13} /> : <ChevronRight size={13} />}
                  </button>

                  <span className="log-ts tabular-nums">
                    {entry.timestamp ? formatTimestamp(entry.timestamp, true, false) : '—'}
                  </span>

                  <span className={`nokia-badge ${badge.class} log-badge-pill`}>
                    {badge.label}
                  </span>

                  <span className="log-host font-medium">
                    {entry.host || selectedHost}
                  </span>

                  <span className="log-source">
                    [{entry.source || 'system'}]
                  </span>

                  <span className="log-msg">
                    {entry.message}
                  </span>
                </div>

                {isExpanded && (
                  <div className="log-detail-drawer font-sans">
                    <div className="detail-grid">
                      <div className="detail-item">
                        <span className="detail-label">HOST</span>
                        <span className="detail-val font-medium">{entry.host || selectedHost}</span>
                      </div>
                      <div className="detail-item">
                        <span className="detail-label">TIMESTAMP</span>
                        <span className="detail-val tabular-nums">{entry.timestamp}</span>
                      </div>
                      <div className="detail-item">
                        <span className="detail-label">COMPONENT</span>
                        <span className="detail-val font-medium">{entry.source || 'system'}</span>
                      </div>
                      <div className="detail-item">
                        <span className="detail-label">SEVERITY</span>
                        <span className="detail-val font-medium">{entry.level || 'INFO'}</span>
                      </div>
                    </div>
                    <div className="raw-msg-block">
                      <div className="raw-msg-title">SANITIZED MESSAGE</div>
                      <pre className="raw-msg-text font-sans">{entry.message}</pre>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      <style>{`
        .netra-logs-page {
          display: flex;
          flex-direction: column;
          gap: 16px;
        }

        .dashboard-main-header {
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding-bottom: 2px;
        }

        .header-page-title {
          font-size: 24px;
          font-weight: 600;
          letter-spacing: -0.02em;
          color: var(--text-primary);
          line-height: 1.2;
        }

        .server-host-selector {
          display: flex;
          align-items: center;
          gap: 4px;
          background: var(--bg-surface);
          border: 1px solid var(--border-subtle);
          border-radius: var(--radius-sm);
          padding: 3px 4px;
        }

        .selector-label {
          font-size: 11px;
          color: var(--text-muted);
          padding: 0 6px;
          font-weight: 500;
        }

        .host-tab-btn {
          display: flex;
          align-items: center;
          gap: 6px;
          padding: 4px 10px;
          border-radius: var(--radius-xs);
          font-size: 12px;
          font-weight: 500;
          color: var(--text-secondary);
          background: transparent;
          border: none;
          cursor: pointer;
          transition: all 0.15s ease;
        }

        .host-tab-btn:hover {
          color: var(--text-primary);
          background: var(--bg-surface-hover);
        }

        .host-tab-btn.active {
          color: var(--text-primary);
          background: var(--bg-inset);
          font-weight: 600;
        }

        /* Netra Panels */
        .netra-panel {
          background-color: var(--bg-surface);
          border: 1px solid var(--border-subtle);
          border-radius: var(--radius-sm);
          overflow: hidden;
        }

        .panel-title-bar {
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: 10px 14px;
          border-bottom: 1px solid var(--border-subtle);
          background-color: var(--bg-surface);
        }

        .panel-title {
          font-size: 13px;
          font-weight: 600;
          letter-spacing: -0.01em;
          color: var(--text-primary);
        }

        .loading-text {
          font-size: 11px;
          color: var(--text-muted);
          animation: pulse 1.5s infinite;
        }

        /* Filter Controls */
        .filter-panel {
          padding: 10px 14px;
        }

        .filter-controls-row {
          display: flex;
          flex-wrap: wrap;
          align-items: center;
          gap: 12px;
        }

        .search-box {
          position: relative;
          flex: 1;
          min-width: 260px;
        }

        .search-icon {
          position: absolute;
          left: 10px;
          top: 50%;
          transform: translateY(-50%);
          color: var(--text-muted);
          pointer-events: none;
        }

        .search-input {
          width: 100%;
          padding: 6px 12px 6px 30px;
          background: var(--bg-canvas);
          border: 1px solid var(--border-subtle);
          border-radius: var(--radius-xs);
          color: var(--text-primary);
          font-size: 12px;
          outline: none;
          transition: border-color 0.15s ease;
        }

        .search-input:focus {
          border-color: var(--border-strong);
        }

        .filter-section {
          display: flex;
          align-items: center;
          gap: 6px;
        }

        .filter-label {
          font-size: 11px;
          color: var(--text-muted);
          font-weight: 500;
        }

        .segmented-tabs {
          display: flex;
          gap: 2px;
          background-color: var(--bg-canvas);
          border: 1px solid var(--border-subtle);
          border-radius: var(--radius-xs);
          padding: 2px;
        }

        .tab-btn {
          padding: 3px 8px;
          font-size: 11px;
          font-weight: 500;
          color: var(--text-secondary);
          background: transparent;
          border: none;
          border-radius: var(--radius-xs);
          cursor: pointer;
          transition: all 0.15s ease;
        }

        .tab-btn:hover {
          color: var(--text-primary);
        }

        .tab-btn.active {
          background-color: var(--bg-surface);
          color: var(--text-primary);
          font-weight: 600;
          box-shadow: 0 1px 2px rgba(0, 0, 0, 0.05);
        }

        .filter-actions {
          display: flex;
          align-items: center;
          gap: 6px;
          margin-left: auto;
        }

        .stream-toggle-btn {
          display: flex;
          align-items: center;
          gap: 6px;
          background: var(--bg-canvas);
          border: 1px solid var(--border-subtle);
          border-radius: var(--radius-xs);
          padding: 4px 10px;
          font-size: 11px;
          font-weight: 500;
          color: var(--text-secondary);
          cursor: pointer;
          transition: all 0.15s ease;
        }

        .stream-toggle-btn.active {
          color: var(--status-healthy);
          border-color: rgba(34, 197, 94, 0.3);
          background: rgba(34, 197, 94, 0.05);
        }

        .stream-dot {
          width: 6px;
          height: 6px;
          border-radius: 50%;
          background: var(--text-muted);
        }

        .stream-dot.dot-active {
          background: var(--status-healthy);
          box-shadow: 0 0 6px var(--status-healthy);
        }

        .refresh-btn {
          background: var(--bg-canvas);
          border: 1px solid var(--border-subtle);
          border-radius: var(--radius-xs);
          padding: 5px 8px;
          color: var(--text-secondary);
          cursor: pointer;
          display: flex;
          align-items: center;
          justify-content: center;
          transition: all 0.15s ease;
        }

        .refresh-btn:hover:not(:disabled) {
          color: var(--text-primary);
          background: var(--bg-surface-hover);
        }

        .spinning {
          animation: spin 1s linear infinite;
        }

        @keyframes spin {
          100% { transform: rotate(360deg); }
        }

        /* Log Entries List */
        .logs-panel {
          min-height: 480px;
          display: flex;
          flex-direction: column;
        }

        .log-entries-list {
          flex: 1;
          display: flex;
          flex-direction: column;
          font-size: 12px;
          max-height: 700px;
          overflow-y: auto;
        }

        .log-row {
          border-bottom: 1px solid var(--border-subtle);
          transition: background 0.1s ease;
        }

        .log-row:hover {
          background-color: var(--bg-surface-hover);
        }

        .log-row-summary {
          display: flex;
          align-items: center;
          gap: 10px;
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
          flex-shrink: 0;
        }

        .log-ts {
          color: var(--text-muted);
          font-size: 11px;
          white-space: nowrap;
          width: 140px;
          flex-shrink: 0;
        }

        .log-badge-pill {
          width: 44px;
          justify-content: center;
          padding: 1px 4px;
          font-size: 10px;
          flex-shrink: 0;
        }

        .log-host {
          color: var(--text-secondary);
          width: 75px;
          flex-shrink: 0;
          font-size: 11px;
        }

        .log-source {
          color: var(--text-muted);
          width: 120px;
          flex-shrink: 0;
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
          font-size: 11px;
        }

        .log-msg {
          color: var(--text-primary);
          flex: 1;
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
          font-size: 12px;
        }

        .log-detail-drawer {
          background: var(--bg-canvas);
          padding: 12px 16px 14px 42px;
          border-top: 1px dashed var(--border-subtle);
        }

        .detail-grid {
          display: grid;
          grid-template-columns: repeat(4, 1fr);
          gap: 12px;
          margin-bottom: 10px;
        }

        .detail-item {
          display: flex;
          flex-direction: column;
          gap: 2px;
        }

        .detail-label {
          font-size: 10px;
          color: var(--text-muted);
          font-weight: 500;
        }

        .detail-val {
          font-size: 12px;
          color: var(--text-primary);
        }

        .raw-msg-block {
          background: var(--bg-surface);
          border: 1px solid var(--border-subtle);
          border-radius: var(--radius-xs);
          padding: 8px 12px;
        }

        .raw-msg-title {
          font-size: 10px;
          color: var(--text-muted);
          margin-bottom: 4px;
          font-weight: 500;
        }

        .raw-msg-text {
          margin: 0;
          white-space: pre-wrap;
          word-break: break-all;
          font-size: 11px;
          color: var(--text-primary);
          line-height: 1.4;
        }

        .empty-state {
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          padding: 60px 16px;
          color: var(--text-muted);
          text-align: center;
        }

        .empty-icon {
          margin-bottom: 12px;
          opacity: 0.3;
        }

        .empty-title {
          font-size: 14px;
          font-weight: 600;
          color: var(--text-primary);
          margin-bottom: 4px;
        }

        .empty-desc {
          font-size: 12px;
          max-width: 380px;
          line-height: 1.4;
        }

        .error-banner {
          background: rgba(239, 68, 68, 0.08);
          color: var(--status-critical);
          padding: 8px 14px;
          display: flex;
          align-items: center;
          gap: 8px;
          font-size: 12px;
          border-bottom: 1px solid rgba(239, 68, 68, 0.2);
        }
      `}</style>
    </div>
  );
}

export default LogsPage;
