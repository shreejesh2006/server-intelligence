import React, { useEffect, useState } from 'react';
import { Link } from 'react-router';
import OfflineBanner from '../../components/common/OfflineBanner';
import TelemetryChart from '../../components/charts/TelemetryChart';
import { useServer } from '../../context/ServerContext';
import { useTimezone } from '../../context/TimezoneContext';
import { getMetricHistory } from '../../services/metrics';
import { getForecast, getAnomaly } from '../../services/intelligence';
import { getAlertsApi } from '../../services/alerts';
import { formatNumber } from '../../utils/formatters';
import { 
  AlertTriangle, 
  Server as ServerIcon,
  ArrowUpRight,
  ArrowDownRight,
  ShieldCheck,
  ArrowRight
} from 'lucide-react';

const TIME_WINDOWS = [
  { id: '5m', label: '5m', start: '-5m', step: '5s' },
  { id: '15m', label: '15m', start: '-15m', step: '15s' },
  { id: '30m', label: '30m', start: '-30m', step: '30s' },
  { id: '1h', label: '1h', start: '-1h', step: '30s' },
  { id: '3h', label: '3h', start: '-3h', step: '1m' },
  { id: '6h', label: '6h', start: '-6h', step: '2m' },
  { id: '12h', label: '12h', start: '-12h', step: '5m' },
  { id: '24h', label: '24h', start: '-24h', step: '10m' },
];

const ALL_METRICS_LIST = [
  { id: 'cpu', label: 'CPU Usage', unit: '%' },
  { id: 'memory', label: 'Memory Usage', unit: '%' },
  { id: 'disk', label: 'Disk Usage', unit: '%' },
  { id: 'swap', label: 'Swap Usage', unit: '%' },
  { id: 'load_1m', label: 'Load (1m)', unit: '' },
  { id: 'load_5m', label: 'Load (5m)', unit: '' },
  { id: 'load_15m', label: 'Load (15m)', unit: '' },
  { id: 'network_rx', label: 'Network RX', unit: ' B/s' },
  { id: 'network_tx', label: 'Network TX', unit: ' B/s' },
  { id: 'disk_read', label: 'Disk Read', unit: ' B/s' },
  { id: 'disk_write', label: 'Disk Write', unit: ' B/s' },
  { id: 'process_count', label: 'Processes', unit: '' },
  { id: 'cpu_iowait', label: 'CPU IOwait', unit: '%' },
  { id: 'uptime_seconds', label: 'Uptime', unit: 's' },
];

export function OverviewPage({ metrics, isOffline, lastUpdated, refetch }) {
  const { servers, selectedHost, selectedServer, selectServer } = useServer();
  const { formatTimestamp } = useTimezone();

  // Unified trend time window selector (8 options: 5m, 15m, 30m, 1h, 3h, 6h, 12h, 24h)
  const [trendWindowId, setTrendWindowId] = useState('15m');
  const activeWindow = TIME_WINDOWS.find((w) => w.id === trendWindowId) || TIME_WINDOWS[1];

  // Unified Trend Chart metric selection (ALL 14 metrics)
  const [trendMetric, setTrendMetric] = useState('cpu');
  const [trendData, setTrendData] = useState([]);
  const [trendLoading, setTrendLoading] = useState(true);

  // Forecast state
  const [forecastMetric, setForecastMetric] = useState('cpu'); // 'cpu' | 'memory' | 'load_1m'
  const [forecastData, setForecastData] = useState(null);

  // Anomaly state
  const [anomalyData, setAnomalyData] = useState(null);

  // Alerts Summary state
  const [alertsData, setAlertsData] = useState([]);
  const [alertsLoading, setAlertsLoading] = useState(true);
  const [alertsError, setAlertsError] = useState(null);

  // Load telemetry history for the single unified trend chart
  useEffect(() => {
    let isCancelled = false;
    async function loadTrendData() {
      setTrendLoading(true);
      try {
        const res = await getMetricHistory(trendMetric, activeWindow.start, 'now', activeWindow.step, selectedHost);
        if (!isCancelled) {
          setTrendData(res.values || []);
        }
      } catch (err) {
        if (!isCancelled) setTrendData([]);
      } finally {
        if (!isCancelled) setTrendLoading(false);
      }
    }
    loadTrendData();
    return () => { isCancelled = true; };
  }, [lastUpdated, trendWindowId, activeWindow, trendMetric, selectedHost]);

  // Load Forecast & Anomaly data
  useEffect(() => {
    let isCancelled = false;
    async function loadIntelligence() {
      try {
        const [fcRes, anomRes] = await Promise.all([
          getForecast(selectedHost).catch(() => null),
          getAnomaly(selectedHost).catch(() => null),
        ]);
        if (!isCancelled) {
          if (fcRes) setForecastData(fcRes);
          if (anomRes) setAnomalyData(anomRes);
        }
      } catch (err) {
        // silent
      }
    }
    loadIntelligence();
    return () => { isCancelled = true; };
  }, [lastUpdated, selectedHost]);

  // Load active alerts for Alerts Summary block
  useEffect(() => {
    let isCancelled = false;
    async function loadAlerts() {
      setAlertsLoading(true);
      setAlertsError(null);
      try {
        const res = await getAlertsApi({ server: selectedHost });
        if (!isCancelled) {
          setAlertsData(Array.isArray(res) ? res : []);
        }
      } catch (err) {
        if (!isCancelled) {
          setAlertsError('Alerts service unavailable');
          setAlertsData([]);
        }
      } finally {
        if (!isCancelled) setAlertsLoading(false);
      }
    }
    loadAlerts();
    return () => { isCancelled = true; };
  }, [lastUpdated, selectedHost]);

  // Resource Values
  const cpuVal = metrics?.cpu != null ? metrics.cpu : 0;
  const memVal = metrics?.memory != null ? metrics.memory : 0;
  const diskVal = metrics?.disk != null ? metrics.disk : 0;
  const loadVal = metrics?.load_1m != null ? metrics.load_1m : 0;

  const getMetricStatus = (val, thresholds = [70, 85]) => {
    if (val >= thresholds[1]) return { text: 'Critical', class: 'status-critical' };
    if (val >= thresholds[0]) return { text: 'Elevated', class: 'status-warning' };
    return { text: 'Normal', class: 'status-normal' };
  };

  const isAnomaly = anomalyData?.is_anomaly ?? false;

  // Selected forecast details
  const currentFc = forecastData?.[forecastMetric];

  const activeMetricObj = ALL_METRICS_LIST.find((m) => m.id === trendMetric) || ALL_METRICS_LIST[0];

  const forecastHorizons = ['5m', '15m', '30m', '1h', '3h', '6h', '12h', '24h', '48h', '72h'];

  const getPredictionValue = (h) => {
    if (currentFc?.predictions?.[h] != null) {
      return currentFc.predictions[h];
    }
    return null;
  };

  return (
    <div className="netra-dashboard-overview font-sans">
      {isOffline && <OfflineBanner onRetry={refetch} />}

      {/* 1. PAGE HEADING WITH ACTIVE HOST SELECTOR */}
      <div className="dashboard-main-header">
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <h1 className="header-page-title font-sans">Overview</h1>
          <span className={`text-xs px-2 py-0.5 rounded border ${
            selectedServer?.isLive
              ? 'border-emerald-500/30 text-emerald-400 bg-emerald-500/10'
              : 'border-slate-500/30 text-slate-400 bg-slate-500/10'
          }`} style={{ fontSize: '11px', letterSpacing: '0.02em' }}>
            {selectedServer?.environment || (selectedHost === 'ubuntu' ? 'Live Infrastructure' : 'Simulated Infrastructure')}
          </span>
        </div>

        <div className="server-host-selector">
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

      {/* UPPER MAIN GRID (Left Column: Resource Metrics + Forecast Outlook, Right Column: Telemetry Trends) */}
      <div className="upper-dashboard-grid">
        {/* LEFT COLUMN */}
        <div className="upper-left-column">
          {/* 2. CURRENT RESOURCE METRICS BLOCK */}
          <div className="netra-panel resource-metrics-panel">
            <div className="panel-title-bar">
              <h2 className="panel-title font-sans">Current Resource Metrics</h2>
            </div>

            <div className="resource-metrics-grid">
              {/* CPU */}
              <div className="resource-metric-card">
                <div className="metric-header font-sans">
                  <span className="card-label">CPU</span>
                  <span className={`card-status ${getMetricStatus(cpuVal).class}`}>
                    {getMetricStatus(cpuVal).text}
                  </span>
                </div>
                <div className="card-value font-sans">
                  {formatNumber(cpuVal, 1)}<span className="unit-symbol">%</span>
                </div>
              </div>

              {/* Memory */}
              <div className="resource-metric-card">
                <div className="metric-header font-sans">
                  <span className="card-label">Memory</span>
                  <span className={`card-status ${getMetricStatus(memVal).class}`}>
                    {getMetricStatus(memVal).text}
                  </span>
                </div>
                <div className="card-value font-sans">
                  {formatNumber(memVal, 1)}<span className="unit-symbol">%</span>
                </div>
              </div>

              {/* Disk */}
              <div className="resource-metric-card">
                <div className="metric-header font-sans">
                  <span className="card-label">Disk</span>
                  <span className={`card-status ${getMetricStatus(diskVal).class}`}>
                    {getMetricStatus(diskVal).text}
                  </span>
                </div>
                <div className="card-value font-sans">
                  {formatNumber(diskVal, 1)}<span className="unit-symbol">%</span>
                </div>
              </div>

              {/* Load 1m */}
              <div className="resource-metric-card">
                <div className="metric-header font-sans">
                  <span className="card-label">Load 1m</span>
                  <span className={`card-status ${getMetricStatus(loadVal, [2.0, 4.0]).class}`}>
                    {getMetricStatus(loadVal, [2.0, 4.0]).text}
                  </span>
                </div>
                <div className="card-value font-sans">
                  {formatNumber(loadVal, 2)}
                </div>
              </div>
            </div>
          </div>

          {/* 3. FORECAST OUTLOOK BLOCK */}
          <div className="netra-panel forecast-panel">
            <div className="panel-title-bar">
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <h2 className="panel-title font-sans">Forecast Outlook</h2>
                <span style={{ fontSize: '11px', color: 'var(--text-muted)' }} className="font-sans">
                  {forecastData?.model ? `(${forecastData.model})` : '(iTransformer)'}
                </span>
              </div>

              {/* Forecast Metric Selector */}
              <div className="segmented-tabs font-sans">
                {[
                  { id: 'cpu', label: 'CPU' },
                  { id: 'memory', label: 'Memory' },
                  { id: 'load_1m', label: 'Load' },
                ].map((m) => (
                  <button
                    key={m.id}
                    type="button"
                    onClick={() => setForecastMetric(m.id)}
                    className={`tab-btn ${forecastMetric === m.id ? 'active' : ''}`}
                  >
                    {m.label}
                  </button>
                ))}
              </div>
            </div>

            <div className="forecast-body-content font-sans">
              <div className="forecast-headline-strip">
                <span className="nokia-label">Current:</span>
                <span className="actual-val font-semibold font-sans">
                  {formatNumber(
                    forecastMetric === 'cpu' ? cpuVal : forecastMetric === 'memory' ? memVal : loadVal,
                    forecastMetric === 'load_1m' ? 2 : 1
                  )}
                  {forecastMetric !== 'load_1m' ? '%' : ''}
                </span>
              </div>

              {/* 4x2 Horizon Cards Grid */}
              <div className="horizon-cards-grid">
                {forecastHorizons.map((h) => {
                  const predVal = getPredictionValue(h);
                  const actualVal = forecastMetric === 'cpu' ? cpuVal : forecastMetric === 'memory' ? memVal : loadVal;
                  const isUp = predVal != null && predVal > actualVal;

                  return (
                    <div key={h} className="horizon-card-compact">
                      <div className="horizon-header font-sans">
                        <span className="horizon-name font-sans">{h}</span>
                        {predVal != null && (
                          isUp 
                            ? <ArrowUpRight size={12} className="text-critical-icon" /> 
                            : <ArrowDownRight size={12} className="text-healthy-icon" />
                        )}
                      </div>
                      <div className="horizon-val font-sans">
                        {predVal != null 
                          ? `${formatNumber(predVal, forecastMetric === 'load_1m' ? 2 : 1)}${forecastMetric !== 'load_1m' ? '%' : ''}`
                          : '—'}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        </div>

        {/* RIGHT COLUMN — 5. TELEMETRY TRENDS SECTION */}
        <div className="upper-right-column">
          <div className="netra-panel trend-chart-panel full-height-panel">
            <div className="panel-title-bar trend-header-wrap font-sans">
              <div className="trend-select-group">
                <h2 className="panel-title font-sans">Telemetry Trends</h2>
                <select
                  value={trendMetric}
                  onChange={(e) => setTrendMetric(e.target.value)}
                  className="netra-metric-dropdown font-sans"
                >
                  {ALL_METRICS_LIST.map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.label}
                    </option>
                  ))}
                </select>
              </div>

              {/* 8 Time Window Selector Pills */}
              <div className="segmented-tabs window-tabs-wrap font-sans">
                {TIME_WINDOWS.map((w) => (
                  <button
                    key={w.id}
                    type="button"
                    onClick={() => setTrendWindowId(w.id)}
                    className={`tab-btn ${trendWindowId === w.id ? 'active' : ''}`}
                  >
                    {w.label}
                  </button>
                ))}
              </div>
            </div>

            <div className="unified-chart-wrapper">
              <TelemetryChart
                data={trendData}
                loading={trendLoading}
                series={[{ 
                  key: 'value', 
                  label: activeMetricObj.label, 
                  color: 'var(--text-primary)', 
                  fillOpacity: 0.05 
                }]}
                unitFormatter={(v) => {
                  const unit = activeMetricObj.unit;
                  if (unit === '%') return `${formatNumber(v, 1)}%`;
                  if (unit === ' B/s') return `${formatNumber(v / 1024, 1)} KB/s`;
                  return `${formatNumber(v, 2)}${unit}`;
                }}
              />
            </div>
          </div>
        </div>
      </div>

      {/* 4. ALERTS SUMMARY BLOCK */}
      <div className="netra-panel alerts-summary-panel">
        <div className="panel-title-bar">
          <h2 className="panel-title font-sans">Alerts Summary</h2>
          <div className="title-right-group font-sans">
            {alertsData.length > 0 && (
              <span className="nokia-badge badge-warning font-sans">
                <span className="status-dot dot-warning" />
                {alertsData.length} Active
              </span>
            )}
            <Link to="/alerts" className="view-alerts-link font-sans">
              <span>View all alerts</span>
              <ArrowRight size={12} />
            </Link>
          </div>
        </div>

        <div className="alerts-summary-content font-sans">
          {alertsLoading ? (
            <div className="alerts-empty-state font-sans text-muted text-xs">
              Loading alerts...
            </div>
          ) : alertsError ? (
            <div className="alerts-empty-state font-sans text-muted text-xs">
              {alertsError}
            </div>
          ) : alertsData.length === 0 ? (
            <div className="anomaly-state-healthy font-sans">
              <ShieldCheck size={18} className="text-healthy-icon" />
              <span className="healthy-text font-medium">No active infrastructure alerts recorded</span>
            </div>
          ) : (
            <div className="alerts-compact-grid font-sans">
              {alertsData.slice(0, 3).map((alertItem) => (
                <div key={alertItem.id} className="alert-compact-card">
                  <div className="alert-card-top font-sans">
                    <span className={`nokia-badge ${alertItem.severity === 'CRITICAL' ? 'badge-critical' : alertItem.severity === 'WARNING' ? 'badge-warning' : 'badge-neutral'}`}>
                      {alertItem.severity || 'WARNING'}
                    </span>
                    <span className="alert-host-tag font-sans text-xs">{alertItem.server || selectedHost}</span>
                  </div>
                  <div className="alert-card-msg font-sans font-medium text-xs">
                    {alertItem.title || alertItem.message}
                  </div>
                  <div className="alert-card-time font-sans text-muted text-xs">
                    {alertItem.created_at ? formatTimestamp(new Date(alertItem.created_at).getTime() / 1000, true, false) : 'Recently'}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* 6. ANOMALIES & TELEMETRY HEALTH SECTION */}
      <div className="netra-panel anomalies-panel margin-top-md">
        <div className="panel-title-bar">
          <h2 className="panel-title font-sans">Anomalies & Telemetry Health</h2>
          <span className={`nokia-badge ${isAnomaly ? 'badge-critical' : 'badge-healthy'} font-sans`}>
            <span className={`status-dot ${isAnomaly ? 'dot-critical' : 'dot-healthy'}`} />
            {isAnomaly ? 'Anomaly' : 'Healthy'}
          </span>
        </div>

        <div className="anomalies-content-body font-sans">
          {!isAnomaly ? (
            <div className="anomaly-state-healthy font-sans">
              <ShieldCheck size={18} className="text-healthy-icon" />
              <span className="healthy-text font-medium">No telemetry anomalies detected</span>
            </div>
          ) : (
            <div className="anomaly-state-active font-sans">
              <AlertTriangle size={18} className="text-warning-icon" />
              <div className="anomaly-detail">
                <div className="anomaly-main font-medium">
                  {anomalyData?.primary_reason || 'Multivariate telemetry anomaly detected'}
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      <style>{`
        .netra-dashboard-overview {
          display: flex;
          flex-direction: column;
          gap: 16px;
        }

        /* Main Header */
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
          padding: 16px;
          display: flex;
          flex-direction: column;
          gap: 14px;
        }

        .panel-title-bar {
          display: flex;
          align-items: center;
          justify-content: space-between;
        }

        .panel-title {
          font-size: 15px;
          font-weight: 600;
          color: var(--text-primary);
          letter-spacing: -0.01em;
        }

        .title-right-group {
          display: flex;
          align-items: center;
          gap: 16px;
        }

        .view-alerts-link {
          display: flex;
          align-items: center;
          gap: 4px;
          font-size: 12px;
          color: var(--text-secondary);
          text-decoration: none;
          transition: color 0.15s ease;
        }

        .view-alerts-link:hover {
          color: var(--text-primary);
        }

        /* Upper Grid */
        .upper-dashboard-grid {
          display: grid;
          grid-template-columns: 370px 1fr;
          gap: 16px;
        }

        .upper-left-column {
          display: flex;
          flex-direction: column;
          gap: 16px;
        }

        .upper-right-column {
          display: flex;
          flex-direction: column;
        }

        .full-height-panel {
          height: 100%;
          display: flex;
          flex-direction: column;
          justify-content: space-between;
        }

        /* Resource Metrics Grid */
        .resource-metrics-grid {
          display: grid;
          grid-template-columns: repeat(2, 1fr);
          gap: 10px;
        }

        .resource-metric-card {
          background-color: var(--bg-canvas);
          border: 1px solid var(--border-subtle);
          border-radius: var(--radius-sm);
          padding: 12px 14px;
          display: flex;
          flex-direction: column;
          gap: 4px;
        }

        .metric-header {
          display: flex;
          align-items: center;
          justify-content: space-between;
        }

        .card-label {
          font-size: 12px;
          font-weight: 500;
          color: var(--text-secondary);
        }

        .card-status {
          font-size: 11px;
          font-weight: 500;
        }

        .status-normal { color: var(--text-muted); }
        .status-warning { color: var(--status-warning); }
        .status-critical { color: var(--status-critical); }

        .card-value {
          font-size: 22px;
          font-weight: 600;
          color: var(--text-primary);
          letter-spacing: -0.02em;
        }

        .unit-symbol {
          font-size: 13px;
          font-weight: 400;
          color: var(--text-muted);
          margin-left: 2px;
        }

        /* Alerts Summary Content */
        .alerts-summary-content {
          padding-top: 2px;
        }

        .alerts-empty-state {
          display: flex;
          align-items: center;
          gap: 8px;
          padding: 8px 0;
          color: var(--text-muted);
        }

        .alerts-compact-grid {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(240px, 1fr));
          gap: 10px;
        }

        .alert-compact-card {
          background-color: var(--bg-canvas);
          border: 1px solid var(--border-subtle);
          border-radius: var(--radius-sm);
          padding: 10px 12px;
          display: flex;
          flex-direction: column;
          gap: 6px;
        }

        .alert-card-top {
          display: flex;
          align-items: center;
          justify-content: space-between;
        }

        .alert-host-tag {
          color: var(--text-muted);
        }

        .alert-card-msg {
          color: var(--text-primary);
          line-height: 1.3;
        }

        .alert-card-time {
          color: var(--text-muted);
        }

        /* Anomalies Content */
        .anomalies-content-body {
          padding: 2px 0;
        }

        .anomaly-state-healthy {
          display: flex;
          align-items: center;
          gap: 10px;
          font-size: 13px;
          color: var(--text-primary);
        }

        .healthy-text {
          font-size: 13px;
          color: var(--text-primary);
        }

        .text-healthy-icon { color: var(--status-healthy); }
        .text-warning-icon { color: var(--status-warning); }
        .text-critical-icon { color: var(--status-critical); }

        .anomaly-state-active {
          display: flex;
          align-items: center;
          gap: 10px;
        }

        .anomaly-main {
          font-size: 13px;
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

        /* Forecast Body */
        .forecast-body-content {
          display: flex;
          flex-direction: column;
          gap: 12px;
          flex: 1;
        }

        .forecast-headline-strip {
          display: flex;
          align-items: center;
          justify-content: space-between;
          background-color: var(--bg-canvas);
          border: 1px solid var(--border-subtle);
          border-radius: var(--radius-sm);
          padding: 10px 14px;
        }

        .actual-badge-pill {
          display: flex;
          align-items: center;
          gap: 8px;
        }

        .badge-tag {
          font-size: 10px;
          font-weight: 600;
          letter-spacing: 0.05em;
          background-color: var(--bg-subtle);
          color: var(--text-secondary);
          padding: 2px 6px;
          border-radius: var(--radius-xs);
        }

        .actual-val {
          font-size: 16px;
          font-weight: 600;
          color: var(--text-primary);
        }

        .forecast-arrow-divider {
          display: flex;
          align-items: center;
          gap: 6px;
        }

        .trajectory-label {
          font-size: 11px;
          color: var(--text-muted);
        }

        /* 5x2 Horizon Cards Grid */
        .horizon-cards-grid {
          display: grid;
          grid-template-columns: repeat(5, 1fr);
          gap: 6px;
        }

        @media (max-width: 600px) {
          .horizon-cards-grid {
            grid-template-columns: repeat(2, 1fr);
          }
        }

        .horizon-card-compact {
          background-color: var(--bg-canvas);
          border: 1px solid var(--border-subtle);
          border-radius: var(--radius-sm);
          padding: 6px 8px;
          display: flex;
          flex-direction: column;
          gap: 2px;
        }

        .horizon-header {
          display: flex;
          align-items: center;
          justify-content: space-between;
        }

        .horizon-name {
          font-size: 11px;
          color: var(--text-muted);
        }

        .horizon-val {
          font-size: 13px;
          font-weight: 600;
          color: var(--text-primary);
        }

        /* Telemetry Trend Panel */
        .trend-header-wrap {
          display: flex;
          flex-wrap: wrap;
          align-items: center;
          justify-content: space-between;
          gap: 10px;
        }

        .trend-select-group {
          display: flex;
          align-items: center;
          gap: 10px;
        }

        .netra-metric-dropdown {
          background-color: var(--bg-canvas);
          border: 1px solid var(--border-subtle);
          border-radius: var(--radius-xs);
          color: var(--text-primary);
          font-size: 12px;
          padding: 4px 10px;
          outline: none;
          cursor: pointer;
          font-weight: 500;
        }

        .window-tabs-wrap {
          flex-wrap: wrap;
        }

        .unified-chart-wrapper {
          flex: 1;
          min-height: 260px;
          width: 100%;
          margin-top: 6px;
        }

        .margin-top-md { margin-top: 4px; }

        /* Responsive Layout */
        @media (max-width: 1100px) {
          .upper-dashboard-grid {
            grid-template-columns: 1fr;
          }
        }
      `}</style>
    </div>
  );
}

export default OverviewPage;
