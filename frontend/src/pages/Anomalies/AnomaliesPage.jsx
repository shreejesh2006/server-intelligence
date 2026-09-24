import React, { useEffect, useState, useCallback } from 'react';
import OfflineBanner from '../../components/common/OfflineBanner';
import TelemetryChart from '../../components/charts/TelemetryChart';
import { useServer } from '../../context/ServerContext';
import { useTimezone } from '../../context/TimezoneContext';
import { getAnomaly, getAnomalyHistory } from '../../services/intelligence';
import { formatNumber } from '../../utils/formatters';
import { 
  AlertTriangle, 
  ShieldCheck, 
  Server as ServerIcon, 
  RefreshCw,
  AlertCircle,
  Clock
} from 'lucide-react';

const LOOKBACK_OPTIONS = [
  { id: '15m', label: '15m' },
  { id: '30m', label: '30m' },
  { id: '1h', label: '1h' },
  { id: '3h', label: '3h' },
  { id: '6h', label: '6h' },
  { id: '12h', label: '12h' },
  { id: '1d', label: '24h' },
];

function formatMetricVal(val, unit) {
  if (val == null || isNaN(val)) return '—';
  const numStr = formatNumber(val, 2);
  if (!unit) return numStr;
  const cleanUnit = unit.trim();
  if (cleanUnit === '%') return `${numStr}%`;
  return `${numStr} ${cleanUnit}`;
}

export function AnomaliesPage({ isOffline, lastUpdated, refetch }) {
  const { servers, selectedHost, selectServer, activeServer } = useServer();
  const { formatTimestamp } = useTimezone();

  const [loading, setLoading] = useState(true);
  const [anomalyData, setAnomalyData] = useState(null);
  const [historyData, setHistoryData] = useState(null);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [lookbackWindow, setLookbackWindow] = useState('1h');
  const [errorMsg, setErrorMsg] = useState(null);

  // Load current anomaly status & historical evaluations
  const loadData = useCallback(async () => {
    setLoading(true);
    setErrorMsg(null);

    try {
      const [curRes, histRes] = await Promise.all([
        getAnomaly(selectedHost).catch((err) => {
          console.warn('[Anomalies] Current fetch error:', err);
          return null;
        }),
        getAnomalyHistory(selectedHost, lookbackWindow).catch((err) => {
          console.warn('[Anomalies] History fetch error:', err);
          return null;
        }),
      ]);

      if (!curRes && !histRes) {
        setErrorMsg('Anomaly detection service unavailable');
      } else {
        setAnomalyData(curRes);
        setHistoryData(histRes);
      }
    } catch (err) {
      setErrorMsg(err?.response?.data?.detail || 'Failed to load anomaly telemetry');
    } finally {
      setLoading(false);
    }
  }, [selectedHost, lookbackWindow]);

  useEffect(() => {
    loadData();
  }, [loadData, lastUpdated]);

  // Handle lookback window change specifically
  const handleLookbackChange = async (newLookback) => {
    setLookbackWindow(newLookback);
    setHistoryLoading(true);
    try {
      const histRes = await getAnomalyHistory(selectedHost, newLookback);
      setHistoryData(histRes);
    } catch (_err) {
      // Keep existing data on error
    } finally {
      setHistoryLoading(false);
    }
  };

  const isAnomaly = anomalyData?.is_anomaly ?? false;
  const severity = anomalyData?.severity || (isAnomaly ? 'WARNING' : 'NORMAL');
  const anomalyScore = anomalyData?.anomaly_score ?? 0.0;
  const primaryReason = anomalyData?.primary_reason || 'Operating within normal bounds.';
  const telemetryTimestamp = anomalyData?.telemetry_timestamp;

  const signals = anomalyData?.contributing_signals?.length > 0
    ? anomalyData.contributing_signals
    : anomalyData?.all_metrics_evaluated || [];

  const historyPoints = historyData?.points || [];

  const hasCriticalSignal = signals.some((s) => s.status === 'CRITICAL' || s.status === 'HIGH');
  const hasWarningSignal = signals.some((s) => s.status === 'WARNING' || s.status === 'ELEVATED' || s.status === 'MEDIUM');

  const isAnomalousState = isAnomaly || severity === 'CRITICAL' || severity === 'WARNING' || hasCriticalSignal || hasWarningSignal;

  const effectiveSeverity = isAnomaly || hasCriticalSignal
    ? (severity === 'CRITICAL' || hasCriticalSignal ? 'CRITICAL' : 'WARNING')
    : (hasWarningSignal ? 'WARNING' : (severity && severity !== 'NORMAL' ? severity : 'NORMAL'));

  const statusBadgeClass = isAnomalousState
    ? (effectiveSeverity === 'CRITICAL' ? 'badge-critical' : 'badge-warning')
    : 'badge-healthy';

  const statusDotClass = isAnomalousState
    ? (effectiveSeverity === 'CRITICAL' ? 'dot-critical' : 'dot-warning')
    : 'dot-healthy';

  const displayScore = formatNumber(Math.max(0, anomalyScore), 4);

  const chartTimeline = historyPoints.map((pt) => {
    const tsNum = typeof pt.timestamp === 'number'
      ? pt.timestamp
      : Math.floor(new Date(pt.timestamp).getTime() / 1000);
    return {
      timestamp: tsNum,
      value: pt.score ?? 0,
    };
  });

  return (
    <div className="anomalies-page font-sans">
      {isOffline && <OfflineBanner onRetry={refetch} />}

      {/* HEADER WITH HOST SELECTOR */}
      <div className="page-header-block">
        <div>
          <h1 className="page-title font-sans">Anomalies</h1>
        </div>

        {/* Active Host Selector */}
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

      {loading ? (
        <div className="netra-panel anomaly-state-box font-sans">
          <RefreshCw size={18} className="spinning text-muted" />
          <span className="text-muted text-xs font-medium">Evaluating anomaly intelligence for {activeServer.name}...</span>
        </div>
      ) : errorMsg && !anomalyData ? (
        <div className="netra-panel anomaly-state-box font-sans">
          <AlertCircle size={18} className="text-warning-icon" />
          <div className="error-text-group">
            <span className="error-msg font-medium text-xs">{errorMsg}</span>
            <button type="button" onClick={loadData} className="retry-btn font-sans">
              Retry fetch
            </button>
          </div>
        </div>
      ) : (
        <>
          {/* 1. CURRENT ANOMALY STATUS PANEL */}
          <div className="netra-panel current-status-panel">
            <div className="panel-title-bar">
              <h2 className="panel-title font-sans">Current Anomaly Status</h2>
              <span className={`nokia-badge ${statusBadgeClass} font-sans`}>
                <span className={`status-dot ${statusDotClass}`} />
                {effectiveSeverity}
              </span>
            </div>

            <div className="status-readout-grid font-sans">
              {/* Status Banner Card */}
              <div className="status-readout-card highlight-card">
                <div className="card-top-icon">
                  {isAnomalousState ? (
                    <AlertTriangle size={18} className={effectiveSeverity === 'CRITICAL' ? 'text-critical-icon' : 'text-warning-icon'} />
                  ) : (
                    <ShieldCheck size={18} className="text-healthy-icon" />
                  )}
                  <div className="card-status-label font-sans">
                    <span className="label-title font-semibold">
                      {isAnomalousState 
                        ? (effectiveSeverity === 'CRITICAL' ? 'Telemetry Anomaly Detected' : 'Elevated Metric Signals') 
                        : 'Operating Normally'}
                    </span>
                  </div>
                </div>
                <div className="primary-reason-box font-sans text-xs">
                  <span className="reason-label font-medium text-muted">Primary Reason:</span>
                  <span className="reason-text font-medium">{primaryReason}</span>
                </div>
              </div>

              {/* Anomaly Score Card */}
              <div className="status-readout-card metric-card">
                <span className="metric-card-label font-sans">Anomaly Score</span>
                <div className="metric-card-value font-sans">
                  {displayScore}
                </div>
              </div>

              {/* Observation Timestamp Card */}
              <div className="status-readout-card metric-card">
                <span className="metric-card-label font-sans">Observation Timestamp</span>
                <div className="metric-card-timestamp font-mono">
                  {telemetryTimestamp
                    ? formatTimestamp(typeof telemetryTimestamp === 'number' ? telemetryTimestamp : new Date(telemetryTimestamp).getTime() / 1000, true, false)
                    : 'N/A'}
                </div>
              </div>
            </div>
          </div>

          {/* 2. ANOMALY SIGNALS PANEL */}
          <div className="netra-panel anomaly-signals-panel">
            <div className="panel-title-bar">
              <h2 className="panel-title font-sans">Anomaly Signals</h2>
              <span className="nokia-badge badge-neutral font-sans text-xs font-mono">
                {signals.length} Telemetry Dimensions
              </span>
            </div>

            {signals.length === 0 ? (
              <div className="signals-empty-state font-sans text-muted text-xs">
                No signal breakdown returned for current observation.
              </div>
            ) : (
              <div className="nokia-table-container font-sans">
                <table className="nokia-table font-sans">
                  <thead>
                    <tr>
                      <th>Signal / Dimension</th>
                      <th>Observed Value</th>
                      <th>Baseline Value</th>
                      <th>Deviation / Reason</th>
                      <th>Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {signals.map((sig, idx) => {
                      const statusClass = 
                        sig.status === 'CRITICAL' || sig.status === 'HIGH'
                          ? 'badge-critical'
                          : sig.status === 'WARNING' || sig.status === 'ELEVATED' || sig.status === 'MEDIUM'
                          ? 'badge-warning'
                          : 'badge-healthy';

                      return (
                        <tr key={sig.metric || idx}>
                          <td className="font-medium text-xs">{sig.display_name || sig.metric}</td>
                          <td className="font-mono text-xs">
                            {formatMetricVal(sig.current_value, sig.unit)}
                          </td>
                          <td className="font-mono text-xs text-muted">
                            {formatMetricVal(sig.baseline_value, sig.unit)}
                          </td>
                          <td className="font-sans text-xs text-secondary">
                            {sig.reason || (sig.deviation_percent != null ? `${formatNumber(sig.deviation_percent, 1)}% deviation` : 'Operating within nominal baseline')}
                          </td>
                          <td>
                            <span className={`nokia-badge ${statusClass} font-sans`}>
                              {sig.status || 'NORMAL'}
                            </span>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* 3. HISTORICAL ANOMALY ACTIVITY PANEL */}
          <div className="netra-panel historical-activity-panel">
            <div className="panel-title-bar">
              <div className="title-left">
                <Clock size={16} className="text-muted" />
                <h2 className="panel-title font-sans">Historical Anomaly Activity</h2>
              </div>

              {/* Lookback Window Selector */}
              <div className="segmented-tabs font-sans">
                {LOOKBACK_OPTIONS.map((w) => (
                  <button
                    key={w.id}
                    type="button"
                    onClick={() => handleLookbackChange(w.id)}
                    className={`tab-btn ${lookbackWindow === w.id ? 'active' : ''}`}
                  >
                    {w.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Historical Score Chart */}
            <div className="historical-chart-box">
              {historyLoading ? (
                <div className="chart-loading-overlay font-sans text-muted text-xs">
                  Updating evaluation timeline...
                </div>
              ) : chartTimeline.length === 0 ? (
                <div className="chart-empty-box font-sans text-muted text-xs">
                  No historical telemetry evaluation points recorded for {activeServer.name}.
                </div>
              ) : (
                <TelemetryChart
                  data={chartTimeline}
                  series={[{ key: 'value', label: 'Anomaly Score', color: 'var(--text-primary)', fillOpacity: 0.05 }]}
                  unitFormatter={(v) => formatNumber(v, 3)}
                  yDomain={[0, 1]}
                />
              )}
            </div>

            {/* Historical Points Log Table */}
            {historyPoints.length > 0 && (
              <div className="historical-table-wrap margin-top-sm">
                <div className="table-caption font-sans text-xs text-muted font-medium margin-bottom-xs">
                  Evaluation History ({historyPoints.length} sample points)
                </div>
                <div className="nokia-table-container font-sans">
                  <table className="nokia-table font-sans">
                    <thead>
                      <tr>
                        <th>Timestamp</th>
                        <th>Status</th>
                        <th>Severity</th>
                        <th>Score</th>
                        <th>CPU</th>
                        <th>Memory</th>
                        <th>Load 1m</th>
                      </tr>
                    </thead>
                    <tbody>
                      {historyPoints.slice(0, 10).map((pt, idx) => {
                        const tsNum = typeof pt.timestamp === 'number'
                          ? pt.timestamp
                          : Math.floor(new Date(pt.timestamp).getTime() / 1000);

                        return (
                          <tr key={idx}>
                            <td className="font-mono text-xs">
                              {formatTimestamp(tsNum, true, false)}
                            </td>
                            <td>
                              <span className={`nokia-badge ${pt.is_anomaly ? 'badge-critical' : 'badge-healthy'} font-sans`}>
                                {pt.is_anomaly ? 'ANOMALY' : 'NORMAL'}
                              </span>
                            </td>
                            <td>
                              <span className="nokia-badge badge-neutral font-sans">
                                {pt.severity || 'NORMAL'}
                              </span>
                            </td>
                            <td className="font-mono text-xs">{formatNumber(pt.score ?? 0, 4)}</td>
                            <td className="font-mono text-xs">{formatNumber(pt.cpu, 1)}%</td>
                            <td className="font-mono text-xs">{formatNumber(pt.memory, 1)}%</td>
                            <td className="font-mono text-xs">{formatNumber(pt.load_1m, 2)}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>
        </>
      )}

      <style>{`
        .anomalies-page {
          display: flex;
          flex-direction: column;
          gap: 16px;
        }

        /* Header */
        .page-header-block {
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding-bottom: 2px;
        }

        .page-title {
          font-size: 24px;
          font-weight: 600;
          letter-spacing: -0.02em;
          color: var(--text-primary);
          line-height: 1.2;
        }

        .server-host-selector {
          display: flex;
          align-items: center;
          gap: 8px;
        }

        .selector-label {
          font-size: 12px;
          color: var(--text-muted);
        }

        .host-tab-btn {
          display: flex;
          align-items: center;
          gap: 6px;
          background: transparent;
          border: 1px solid var(--border-subtle);
          color: var(--text-secondary);
          font-family: var(--font-sans);
          font-size: 12px;
          padding: 4px 10px;
          border-radius: var(--radius-sm);
          cursor: pointer;
          transition: all 0.15s ease;
        }

        .host-tab-btn:hover {
          background-color: var(--bg-surface-hover);
          color: var(--text-primary);
        }

        .host-tab-btn.active {
          background-color: var(--bg-surface);
          border-color: var(--border-strong);
          color: var(--text-primary);
          font-weight: 500;
        }

        /* Panels */
        .netra-panel {
          background-color: var(--bg-surface);
          border: 1px solid var(--border-subtle);
          border-radius: var(--radius-md);
          padding: 20px;
          display: flex;
          flex-direction: column;
          gap: 16px;
        }

        .panel-title-bar {
          display: flex;
          align-items: center;
          justify-content: space-between;
        }

        .title-left {
          display: flex;
          align-items: center;
          gap: 8px;
        }

        .panel-title {
          font-size: 15px;
          font-weight: 600;
          color: var(--text-primary);
          letter-spacing: -0.01em;
        }

        /* Status Readout Grid */
        .status-readout-grid {
          display: grid;
          grid-template-columns: 2fr 1fr 1fr;
          gap: 12px;
        }

        .status-readout-card {
          background-color: var(--bg-canvas);
          border: 1px solid var(--border-subtle);
          border-radius: var(--radius-sm);
          padding: 16px;
          display: flex;
          flex-direction: column;
          justify-content: space-between;
          gap: 10px;
        }

        .card-top-icon {
          display: flex;
          align-items: center;
          gap: 10px;
        }

        .card-status-label {
          display: flex;
          flex-direction: column;
        }

        .label-title {
          font-size: 14px;
          color: var(--text-primary);
        }

        .primary-reason-box {
          display: flex;
          flex-direction: column;
          gap: 2px;
          background-color: var(--bg-surface);
          border: 1px solid var(--border-subtle);
          border-radius: var(--radius-xs);
          padding: 8px 10px;
        }

        .reason-label {
          font-size: 11px;
        }

        .reason-text {
          color: var(--text-primary);
          line-height: 1.3;
        }

        .metric-card-label {
          font-size: 12px;
          font-weight: 500;
          color: var(--text-secondary);
        }

        .metric-card-value {
          font-size: 26px;
          font-weight: 600;
          color: var(--text-primary);
          letter-spacing: -0.02em;
        }

        .metric-card-timestamp {
          font-size: 14px;
          font-weight: 600;
          color: var(--text-primary);
        }

        /* Segmented Tabs */
        .segmented-tabs {
          display: flex;
          background-color: var(--bg-subtle);
          padding: 3px;
          border-radius: var(--radius-sm);
          gap: 2px;
        }

        .tab-btn {
          background: transparent;
          border: none;
          padding: 3px 8px;
          font-family: var(--font-sans);
          font-size: 11px;
          color: var(--text-muted);
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
          font-weight: 500;
          box-shadow: 0 1px 2px rgba(0, 0, 0, 0.05);
        }

        /* Signals & Table */
        .signals-empty-state {
          padding: 12px 0;
        }

        .margin-top-sm { margin-top: 10px; }
        .margin-bottom-xs { margin-bottom: 6px; }

        /* Historical Chart Box */
        .historical-chart-box {
          height: 180px;
          width: 100%;
          position: relative;
        }

        .chart-loading-overlay, .chart-empty-box {
          height: 100%;
          display: flex;
          align-items: center;
          justify-content: center;
        }

        /* State Boxes */
        .anomaly-state-box {
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 10px;
          padding: 40px;
          text-align: center;
        }

        .error-text-group {
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 8px;
        }

        .error-msg {
          color: var(--text-secondary);
        }

        .retry-btn {
          background: var(--bg-subtle);
          border: 1px solid var(--border-subtle);
          color: var(--text-primary);
          font-size: 11px;
          padding: 4px 10px;
          border-radius: var(--radius-xs);
          cursor: pointer;
        }

        .retry-btn:hover {
          background: var(--bg-surface-hover);
        }

        .text-healthy-icon { color: var(--status-healthy); }
        .text-warning-icon { color: var(--status-warning); }
        .text-critical-icon { color: var(--status-critical); }

        .spinning {
          animation: spin 1s linear infinite;
        }

        @keyframes spin {
          100% { transform: rotate(360deg); }
        }

        @media (max-width: 1000px) {
          .status-readout-grid {
            grid-template-columns: 1fr;
          }
        }
      `}</style>
    </div>
  );
}

export default AnomaliesPage;
