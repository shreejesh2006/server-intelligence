import React, { useEffect, useState, useCallback } from 'react';
import OfflineBanner from '../../components/common/OfflineBanner';
import TelemetryChart from '../../components/charts/TelemetryChart';
import { useServer } from '../../context/ServerContext';
import { useTimezone } from '../../context/TimezoneContext';
import { getCurrentMetrics, getMetricHistory } from '../../services/metrics';
import { 
  formatNumber, 
  formatPercent, 
  formatBytesPerSec, 
  formatUptime 
} from '../../utils/formatters';
import { 
  Server as ServerIcon, 
  RefreshCw 
} from 'lucide-react';

const ADDITIONAL_METRIC_OPTIONS = [
  { id: 'network_rx', label: 'Network RX', unit: ' B/s', type: 'bytes' },
  { id: 'network_tx', label: 'Network TX', unit: ' B/s', type: 'bytes' },
  { id: 'disk_read', label: 'Disk Read', unit: ' B/s', type: 'bytes' },
  { id: 'disk_write', label: 'Disk Write', unit: ' B/s', type: 'bytes' },
  { id: 'swap', label: 'Swap Usage', unit: '%', type: 'percent' },
  { id: 'process_count', label: 'Process Count', unit: '', type: 'number' },
  { id: 'cpu_iowait', label: 'CPU IOwait', unit: '%', type: 'percent' },
  { id: 'load_5m', label: 'Load (5m)', unit: '', type: 'number' },
  { id: 'load_15m', label: 'Load (15m)', unit: '', type: 'number' },
];

function getMetricValue(metricsObj, key, fallback = 0) {
  if (!metricsObj || metricsObj[key] == null) return fallback;
  const item = metricsObj[key];
  if (typeof item === 'object' && item !== null && 'value' in item) {
    return item.value != null ? Number(item.value) || fallback : fallback;
  }
  return typeof item === 'number' || typeof item === 'string' ? Number(item) || fallback : fallback;
}

function getMetricTimestamp(metricsObj) {
  if (!metricsObj) return null;
  let maxTs = 0;
  Object.values(metricsObj).forEach((item) => {
    if (item && typeof item === 'object' && typeof item.timestamp === 'number') {
      if (item.timestamp > maxTs) maxTs = item.timestamp;
    }
  });
  return maxTs > 0 ? maxTs : null;
}

export function ServersPage({ metrics: propMetrics, isOffline: propOffline, lastUpdated: propLastUpdated, refetch: propRefetch }) {
  const { servers, selectedHost, selectServer, activeServer } = useServer();
  const { formatTimestamp } = useTimezone();

  const [nodeMetrics, setNodeMetrics] = useState(propMetrics || null);
  const [loading, setLoading] = useState(!propMetrics);
  const [error, setError] = useState(null);
  const [lastFetchTime, setLastFetchTime] = useState(propLastUpdated || null);

  // Detail trend chart state
  const [selectedDetailMetric, setSelectedDetailMetric] = useState('network_rx');
  const [detailChartData, setDetailChartData] = useState([]);
  const [detailChartLoading, setDetailChartLoading] = useState(false);

  // Fetch telemetry for current host
  const fetchHostMetrics = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await getCurrentMetrics(selectedHost);
      if (res && res.status === 'success') {
        setNodeMetrics(res.metrics || {});
        setLastFetchTime(new Date());
      } else if (res && res.metrics) {
        setNodeMetrics(res.metrics);
        setLastFetchTime(new Date());
      } else {
        throw new Error('No metrics returned for host');
      }
    } catch (err) {
      setError(err?.message || 'Failed to fetch server metrics');
      if (propMetrics) setNodeMetrics(propMetrics);
    } finally {
      setLoading(false);
    }
  }, [selectedHost, propMetrics]);

  useEffect(() => {
    fetchHostMetrics();
  }, [fetchHostMetrics, propLastUpdated]);

  // Load detail metric history for historical view
  useEffect(() => {
    let isCancelled = false;
    async function loadMetricHistory() {
      setDetailChartLoading(true);
      try {
        const res = await getMetricHistory(selectedDetailMetric, '-30m', 'now', '30s', selectedHost);
        if (!isCancelled) {
          setDetailChartData(res.values || []);
        }
      } catch (_err) {
        if (!isCancelled) setDetailChartData([]);
      } finally {
        if (!isCancelled) setDetailChartLoading(false);
      }
    }
    loadMetricHistory();
    return () => { isCancelled = true; };
  }, [selectedDetailMetric, selectedHost, propLastUpdated, lastFetchTime]);

  const activeMetrics = nodeMetrics || propMetrics || {};
  const isOffline = propOffline || !!error;

  // Stale check
  const latestTs = getMetricTimestamp(activeMetrics);
  let freshnessState = 'ONLINE';
  if (isOffline) {
    freshnessState = 'OFFLINE';
  } else if (latestTs) {
    const ageSec = Math.floor(Date.now() / 1000) - latestTs;
    if (ageSec > 60) freshnessState = 'STALE';
  } else if (lastFetchTime) {
    const ageSec = Math.floor((Date.now() - lastFetchTime.getTime()) / 1000);
    if (ageSec > 60) freshnessState = 'STALE';
  }

  // Value Extractors
  const cpuVal = getMetricValue(activeMetrics, 'cpu', 0);
  const memVal = getMetricValue(activeMetrics, 'memory', 0);
  const diskVal = getMetricValue(activeMetrics, 'disk', 0);
  const load1mVal = getMetricValue(activeMetrics, 'load_1m', 0);
  const uptimeVal = getMetricValue(activeMetrics, 'uptime_seconds', 0);

  const netRxVal = getMetricValue(activeMetrics, 'network_rx', 0);
  const netTxVal = getMetricValue(activeMetrics, 'network_tx', 0);
  const diskReadVal = getMetricValue(activeMetrics, 'disk_read', 0);
  const diskWriteVal = getMetricValue(activeMetrics, 'disk_write', 0);
  const swapVal = getMetricValue(activeMetrics, 'swap', 0);
  const procCountVal = getMetricValue(activeMetrics, 'process_count', 0);
  const iowaitVal = getMetricValue(activeMetrics, 'cpu_iowait', 0);
  const load5mVal = getMetricValue(activeMetrics, 'load_5m', 0);
  const load15mVal = getMetricValue(activeMetrics, 'load_15m', 0);

  const getMetricStatus = (val, thresholds = [70, 85]) => {
    if (val >= thresholds[1]) return { text: 'Critical', class: 'status-critical' };
    if (val >= thresholds[0]) return { text: 'Elevated', class: 'status-warning' };
    return { text: 'Normal', class: 'status-normal' };
  };

  const activeDetailObj = ADDITIONAL_METRIC_OPTIONS.find((m) => m.id === selectedDetailMetric) || ADDITIONAL_METRIC_OPTIONS[0];

  const formattedTimestampStr = latestTs 
    ? formatTimestamp(latestTs, true, false) 
    : lastFetchTime 
      ? formatTimestamp(lastFetchTime.getTime() / 1000, true, false)
      : 'N/A';

  return (
    <div className="netra-servers-detail font-sans">
      {isOffline && <OfflineBanner onRetry={propRefetch || fetchHostMetrics} />}

      {/* PAGE HEADER */}
      <div className="servers-main-header">
        <div>
          <h1 className="header-page-title font-sans">Servers</h1>
        </div>

        {/* HOST SELECTOR / HOST DISPLAY */}
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

      {/* 1. STATUS BLOCK */}
      <div className="netra-panel server-status-panel">
        <div className="panel-title-bar">
          <div className="title-left font-sans">
            <h2 className="panel-title font-sans">Status</h2>
            <span className="host-meta-tag font-mono text-xs">{activeServer?.ip || '192.168.64.22'}</span>
          </div>

          <div className="status-badge-group">
            {freshnessState === 'ONLINE' && (
              <span className="nokia-badge badge-healthy font-sans">
                <span className="status-dot dot-healthy" /> Online
              </span>
            )}
            {freshnessState === 'STALE' && (
              <span className="nokia-badge badge-warning font-sans">
                <span className="status-dot dot-warning" /> Stale
              </span>
            )}
            {freshnessState === 'OFFLINE' && (
              <span className="nokia-badge badge-critical font-sans">
                <span className="status-dot dot-critical" /> Offline
              </span>
            )}
          </div>
        </div>

        <div className="status-metrics-grid font-sans">
          {/* Node State */}
          <div className="status-card font-sans">
            <div className="status-card-header text-muted text-xs font-sans">Node State</div>
            <div className="status-card-val font-sans font-semibold text-primary">
              {freshnessState === 'ONLINE' ? 'Healthy Node' : freshnessState === 'STALE' ? 'Stale Data' : 'Unreachable'}
            </div>
            <div className="status-card-sub text-muted font-mono text-xs">
              {activeServer?.os || 'Ubuntu 24.04 LTS'}
            </div>
          </div>

          {/* Last Telemetry */}
          <div className="status-card font-sans">
            <div className="status-card-header text-muted text-xs font-sans">Last Telemetry</div>
            <div className="status-card-val font-mono font-medium text-primary">
              {formattedTimestampStr}
            </div>
            <div className="status-card-sub text-muted font-sans text-xs">
              {freshnessState === 'STALE' ? 'Telemetry delay >60s' : 'Real-time telemetry feed'}
            </div>
          </div>

          {/* Uptime */}
          <div className="status-card font-sans">
            <div className="status-card-header text-muted text-xs font-sans">Uptime</div>
            <div className="status-card-val font-mono font-semibold text-primary">
              {uptimeVal > 0 ? formatUptime(uptimeVal) : 'N/A'}
            </div>
            <div className="status-card-sub text-muted font-sans text-xs">
              System uptime duration
            </div>
          </div>
        </div>
      </div>

      {/* 2. RESOURCE SNAPSHOT BLOCK */}
      <div className="netra-panel resource-snapshot-panel">
        <div className="panel-title-bar">
          <h2 className="panel-title font-sans">Resource Snapshot</h2>
          <span className="panel-tag font-sans text-xs text-muted">Core Hardware Telemetry</span>
        </div>

        {loading && !nodeMetrics ? (
          <div className="metrics-loading-state text-muted text-xs font-sans">
            <RefreshCw size={14} className="spinning" />
            <span>Loading resource metrics...</span>
          </div>
        ) : (
          <div className="snapshot-cards-grid font-sans">
            {/* CPU */}
            <div className="snapshot-card font-sans">
              <div className="snapshot-card-top font-sans">
                <span className="card-label font-sans">CPU</span>
                <span className={`card-status ${getMetricStatus(cpuVal).class}`}>
                  {getMetricStatus(cpuVal).text}
                </span>
              </div>
              <div className="card-value font-sans">
                {formatNumber(cpuVal, 1)}<span className="unit-symbol">%</span>
              </div>
            </div>

            {/* Memory */}
            <div className="snapshot-card font-sans">
              <div className="snapshot-card-top font-sans">
                <span className="card-label font-sans">Memory</span>
                <span className={`card-status ${getMetricStatus(memVal).class}`}>
                  {getMetricStatus(memVal).text}
                </span>
              </div>
              <div className="card-value font-sans">
                {formatNumber(memVal, 1)}<span className="unit-symbol">%</span>
              </div>
            </div>

            {/* Disk */}
            <div className="snapshot-card font-sans">
              <div className="snapshot-card-top font-sans">
                <span className="card-label font-sans">Disk</span>
                <span className={`card-status ${getMetricStatus(diskVal).class}`}>
                  {getMetricStatus(diskVal).text}
                </span>
              </div>
              <div className="card-value font-sans">
                {formatNumber(diskVal, 1)}<span className="unit-symbol">%</span>
              </div>
            </div>

            {/* Load 1m */}
            <div className="snapshot-card font-sans">
              <div className="snapshot-card-top font-sans">
                <span className="card-label font-sans">Load 1m</span>
                <span className={`card-status ${getMetricStatus(load1mVal, [2.0, 4.0]).class}`}>
                  {getMetricStatus(load1mVal, [2.0, 4.0]).text}
                </span>
              </div>
              <div className="card-value font-sans">
                {formatNumber(load1mVal, 2)}
              </div>
            </div>
          </div>
        )}
      </div>

      {/* 3. ADDITIONAL TELEMETRY BLOCK */}
      <div className="netra-panel additional-telemetry-panel">
        <div className="panel-title-bar">
          <h2 className="panel-title font-sans">Additional Telemetry</h2>
          <span className="panel-tag font-sans text-xs text-muted">Extended Node Metrics</span>
        </div>

        <div className="additional-metrics-grid font-sans">
          {/* Network RX */}
          <div className="telemetry-card font-sans">
            <div className="telemetry-card-label font-sans text-muted">Network RX</div>
            <div className="telemetry-card-value font-mono font-semibold">
              {formatBytesPerSec(netRxVal)}
            </div>
            <div className="telemetry-card-unit font-sans text-muted">Inbound traffic rate</div>
          </div>

          {/* Network TX */}
          <div className="telemetry-card font-sans">
            <div className="telemetry-card-label font-sans text-muted">Network TX</div>
            <div className="telemetry-card-value font-mono font-semibold">
              {formatBytesPerSec(netTxVal)}
            </div>
            <div className="telemetry-card-unit font-sans text-muted">Outbound traffic rate</div>
          </div>

          {/* Disk Read */}
          <div className="telemetry-card font-sans">
            <div className="telemetry-card-label font-sans text-muted">Disk Read</div>
            <div className="telemetry-card-value font-mono font-semibold">
              {formatBytesPerSec(diskReadVal)}
            </div>
            <div className="telemetry-card-unit font-sans text-muted">Disk read throughput</div>
          </div>

          {/* Disk Write */}
          <div className="telemetry-card font-sans">
            <div className="telemetry-card-label font-sans text-muted">Disk Write</div>
            <div className="telemetry-card-value font-mono font-semibold">
              {formatBytesPerSec(diskWriteVal)}
            </div>
            <div className="telemetry-card-unit font-sans text-muted">Disk write throughput</div>
          </div>

          {/* Swap */}
          <div className="telemetry-card font-sans">
            <div className="telemetry-card-label font-sans text-muted">Swap</div>
            <div className="telemetry-card-value font-sans font-semibold">
              {formatPercent(swapVal, 1)}
            </div>
            <div className="telemetry-card-unit font-sans text-muted">Swap space utilized</div>
          </div>

          {/* Process Count */}
          <div className="telemetry-card font-sans">
            <div className="telemetry-card-label font-sans text-muted">Process Count</div>
            <div className="telemetry-card-value font-mono font-semibold">
              {formatNumber(procCountVal, 0)}
            </div>
            <div className="telemetry-card-unit font-sans text-muted">Active OS processes</div>
          </div>

          {/* CPU IOWait */}
          <div className="telemetry-card font-sans">
            <div className="telemetry-card-label font-sans text-muted">CPU IOwait</div>
            <div className="telemetry-card-value font-sans font-semibold">
              {formatPercent(iowaitVal, 1)}
            </div>
            <div className="telemetry-card-unit font-sans text-muted">CPU waiting for disk I/O</div>
          </div>

          {/* Load 5m */}
          <div className="telemetry-card font-sans">
            <div className="telemetry-card-label font-sans text-muted">Load 5m</div>
            <div className="telemetry-card-value font-mono font-semibold">
              {formatNumber(load5mVal, 2)}
            </div>
            <div className="telemetry-card-unit font-sans text-muted">5-minute system load average</div>
          </div>

          {/* Load 15m */}
          <div className="telemetry-card font-sans">
            <div className="telemetry-card-label font-sans text-muted">Load 15m</div>
            <div className="telemetry-card-value font-mono font-semibold">
              {formatNumber(load15mVal, 2)}
            </div>
            <div className="telemetry-card-unit font-sans text-muted">15-minute system load average</div>
          </div>
        </div>

        {/* HISTORICAL DETAIL TREND CHART */}
        <div className="telemetry-detail-chart-wrapper font-sans margin-top-sm">
          <div className="chart-header-bar font-sans">
            <div className="chart-title-group">
              <span className="chart-sub-label font-sans">Metric Trend Inspector</span>
              <select
                value={selectedDetailMetric}
                onChange={(e) => setSelectedDetailMetric(e.target.value)}
                className="netra-metric-dropdown font-sans text-xs"
              >
                {ADDITIONAL_METRIC_OPTIONS.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.label}
                  </option>
                ))}
              </select>
            </div>
            <span className="window-pill font-mono text-xs text-muted">Last 30m</span>
          </div>

          <div className="chart-container-inner">
            <TelemetryChart
              data={detailChartData}
              loading={detailChartLoading}
              series={[{
                key: 'value',
                label: activeDetailObj.label,
                color: 'var(--text-primary)',
                fillOpacity: 0.05
              }]}
              unitFormatter={(v) => {
                if (activeDetailObj.type === 'bytes') return formatBytesPerSec(v);
                if (activeDetailObj.type === 'percent') return `${formatNumber(v, 1)}%`;
                return `${formatNumber(v, 2)}`;
              }}
            />
          </div>
        </div>
      </div>

      <style>{`
        .netra-servers-detail {
          display: flex;
          flex-direction: column;
          gap: 16px;
        }

        .servers-main-header {
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

        .title-left {
          display: flex;
          align-items: center;
          gap: 10px;
        }

        .panel-title {
          font-size: 15px;
          font-weight: 600;
          color: var(--text-primary);
          letter-spacing: -0.01em;
        }

        .host-meta-tag {
          color: var(--text-muted);
          background: var(--bg-canvas);
          padding: 2px 6px;
          border-radius: var(--radius-xs);
          border: 1px solid var(--border-subtle);
        }

        /* Status Grid */
        .status-metrics-grid {
          display: grid;
          grid-template-columns: repeat(3, 1fr);
          gap: 12px;
        }

        .status-card {
          background-color: var(--bg-canvas);
          border: 1px solid var(--border-subtle);
          border-radius: var(--radius-sm);
          padding: 12px 14px;
          display: flex;
          flex-direction: column;
          gap: 4px;
        }

        .status-card-header {
          color: var(--text-muted);
        }

        .status-card-val {
          font-size: 16px;
          color: var(--text-primary);
        }

        .status-card-sub {
          color: var(--text-muted);
        }

        /* Snapshot Grid */
        .snapshot-cards-grid {
          display: grid;
          grid-template-columns: repeat(4, 1fr);
          gap: 12px;
        }

        .snapshot-card {
          background-color: var(--bg-canvas);
          border: 1px solid var(--border-subtle);
          border-radius: var(--radius-sm);
          padding: 12px 14px;
          display: flex;
          flex-direction: column;
          gap: 4px;
        }

        .snapshot-card-top {
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

        /* Additional Telemetry Grid */
        .additional-metrics-grid {
          display: grid;
          grid-template-columns: repeat(3, 1fr);
          gap: 12px;
        }

        .telemetry-card {
          background-color: var(--bg-canvas);
          border: 1px solid var(--border-subtle);
          border-radius: var(--radius-sm);
          padding: 12px 14px;
          display: flex;
          flex-direction: column;
          gap: 4px;
        }

        .telemetry-card-label {
          font-size: 12px;
          font-weight: 500;
        }

        .telemetry-card-value {
          font-size: 18px;
          color: var(--text-primary);
          letter-spacing: -0.01em;
        }

        .telemetry-card-unit {
          font-size: 11px;
        }

        /* Detail Chart Wrapper */
        .telemetry-detail-chart-wrapper {
          border-top: 1px solid var(--border-subtle);
          padding-top: 14px;
          display: flex;
          flex-direction: column;
          gap: 12px;
        }

        .chart-header-bar {
          display: flex;
          align-items: center;
          justify-content: space-between;
        }

        .chart-title-group {
          display: flex;
          align-items: center;
          gap: 10px;
        }

        .chart-sub-label {
          font-size: 13px;
          font-weight: 500;
          color: var(--text-primary);
        }

        .netra-metric-dropdown {
          background-color: var(--bg-canvas);
          border: 1px solid var(--border-subtle);
          color: var(--text-primary);
          padding: 3px 8px;
          border-radius: var(--radius-xs);
          outline: none;
          cursor: pointer;
        }

        .chart-container-inner {
          height: 200px;
          width: 100%;
        }

        .metrics-loading-state {
          display: flex;
          align-items: center;
          gap: 8px;
          padding: 16px 0;
        }

        .margin-top-sm { margin-top: 8px; }
        .spinning { animation: spin 1s linear infinite; }
        @keyframes spin { 100% { transform: rotate(360deg); } }
      `}</style>
    </div>
  );
}

export default ServersPage;
