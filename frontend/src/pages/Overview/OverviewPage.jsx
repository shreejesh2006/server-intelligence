import React, { useEffect, useState } from 'react';
import PageHeader from '../../components/common/PageHeader';
import MetricDisplay from '../../components/common/MetricDisplay';
import DataStrip from '../../components/common/DataStrip';
import OfflineBanner from '../../components/common/OfflineBanner';
import ChartFrame from '../../components/charts/ChartFrame';
import TelemetryChart from '../../components/charts/TelemetryChart';
import { 
  getMetricHistory, 
  getMultiMetricHistory 
} from '../../services/metrics';
import { 
  formatPercent, 
  formatBytesPerSec, 
  formatNumber 
} from '../../utils/formatters';

const TIME_WINDOWS = [
  { id: '5m', label: '5 MIN', start: '-5m', step: '5s', subtitle: 'OVER 5m (5s STEP)' },
  { id: '15m', label: '15 MIN', start: '-15m', step: '15s', subtitle: 'OVER 15m (15s STEP)' },
  { id: '30m', label: '30 MIN', start: '-30m', step: '30s', subtitle: 'OVER 30m (30s STEP)' },
  { id: '1h', label: '1 HOUR', start: '-1h', step: '30s', subtitle: 'OVER 60m (30s STEP)' },
  { id: '3h', label: '3 HOURS', start: '-3h', step: '1m', subtitle: 'OVER 3h (1m STEP)' },
  { id: '6h', label: '6 HOURS', start: '-6h', step: '2m', subtitle: 'OVER 6h (2m STEP)' },
  { id: '12h', label: '12 HOURS', start: '-12h', step: '5m', subtitle: 'OVER 12h (5m STEP)' },
];

export function OverviewPage({ metrics, isOffline, lastUpdated, refetch, loading }) {
  // Selected time window state
  const [selectedWindowId, setSelectedWindowId] = useState('1h');
  const activeWindow = TIME_WINDOWS.find((w) => w.id === selectedWindowId) || TIME_WINDOWS[3];

  // History state for charts
  const [cpuHistory, setCpuHistory] = useState([]);
  const [memoryHistory, setMemoryHistory] = useState([]);
  const [loadHistory, setLoadHistory] = useState([]);
  const [networkHistory, setNetworkHistory] = useState([]);
  const [diskIoHistory, setDiskIoHistory] = useState([]);

  // Peaks
  const [cpuPeak, setCpuPeak] = useState(null);
  const [memPeak, setMemPeak] = useState(null);

  // Fetch telemetry history on load, refetch, or window change
  useEffect(() => {
    let isCancelled = false;

    async function loadHistoryData() {
      try {
        const { start, step } = activeWindow;
        const [cpuRes, memRes, swapRes, loadRes, netRes, diskRes] = await Promise.all([
          getMetricHistory('cpu', start, 'now', step).catch(() => ({ values: [] })),
          getMetricHistory('memory', start, 'now', step).catch(() => ({ values: [] })),
          getMetricHistory('swap', start, 'now', step).catch(() => ({ values: [] })),
          getMultiMetricHistory(['load_1m', 'load_5m', 'load_15m'], start, 'now', step),
          getMultiMetricHistory(['network_rx', 'network_tx'], start, 'now', step),
          getMultiMetricHistory(['disk_read', 'disk_write'], start, 'now', step),
        ]);

        if (isCancelled) return;

        // CPU
        const cpuVals = cpuRes.values || [];
        setCpuHistory(cpuVals);
        if (cpuVals.length > 0) {
          const maxCpu = Math.max(...cpuVals.map((v) => v.value));
          setCpuPeak(formatNumber(maxCpu, 1));
        } else {
          setCpuPeak(null);
        }

        // Memory + Swap merged
        const swapMap = new Map((swapRes.values || []).map((v) => [v.timestamp, v.value]));
        const mergedMem = (memRes.values || []).map((v) => ({
          timestamp: v.timestamp,
          memory: v.value,
          swap: swapMap.get(v.timestamp) ?? 0,
        }));
        setMemoryHistory(mergedMem);
        if (memRes.values && memRes.values.length > 0) {
          const maxMem = Math.max(...memRes.values.map((v) => v.value));
          setMemPeak(formatNumber(maxMem, 1));
        } else {
          setMemPeak(null);
        }

        // Load
        setLoadHistory(loadRes.timeline || []);

        // Network
        setNetworkHistory(netRes.timeline || []);

        // Disk IO
        setDiskIoHistory(diskRes.timeline || []);
      } catch (err) {
        console.warn('Error loading telemetry history:', err);
      }
    }

    loadHistoryData();

    return () => {
      isCancelled = true;
    };
  }, [lastUpdated, selectedWindowId]);

  const cpuCurrent = metrics?.cpu != null ? formatNumber(metrics.cpu, 1) : null;
  const memCurrent = metrics?.memory != null ? formatNumber(metrics.memory, 1) : null;
  const diskCurrent = metrics?.disk != null ? formatNumber(metrics.disk, 1) : null;

  return (
    <div className="overview-page">
      <PageHeader
        index="01"
        title="SYSTEM PULSE"
        subtitle="Live telemetry and operational state from VictoriaMetrics."
        tag="LIVE SYSTEM OBSERVABILITY"
      />

      {isOffline && <OfflineBanner onRetry={refetch} />}

      {/* System Health Hero */}
      <section className="health-hero font-mono">
        <div className="hero-status-row">
          <div className="hero-status-left">
            <span className="editorial-tag">OPERATIONAL STATE</span>
            <div className="hero-status-title">
              {isOffline ? (
                <span className="text-critical">SYSTEM OFFLINE — TELEMETRY UNREACHABLE</span>
              ) : (
                <span className="text-healthy">SYSTEM ONLINE — TELEMETRY ACTIVE</span>
              )}
            </div>
          </div>

          <div className="hero-status-right">
            <div className="engine-badge font-mono">
              <span className="engine-badge-label">INTELLIGENCE ENGINE:</span>
              <span className="engine-badge-status">HEURISTIC EVALUATION (HEALTH MODEL PENDING)</span>
            </div>
          </div>
        </div>
      </section>

      {/* Primary Telemetry Grid */}
      <section className="primary-telemetry-grid">
        <MetricDisplay
          label="CPU UTILIZATION"
          value={cpuCurrent}
          unit="%"
          sublabel="2 CORES AVAILABLE"
          secondaryText={metrics?.iowait != null ? `IO WAIT: ${formatPercent(metrics.iowait)}` : null}
          status={metrics?.cpu > 85 ? 'critical' : metrics?.cpu > 70 ? 'warning' : 'normal'}
        />
        <MetricDisplay
          label="MEMORY USAGE"
          value={memCurrent}
          unit="%"
          sublabel={metrics?.swap != null ? `SWAP: ${formatPercent(metrics.swap)}` : 'RAM USAGE'}
          secondaryText="SYSTEM MEMORY"
          status={metrics?.memory > 90 ? 'critical' : metrics?.memory > 80 ? 'warning' : 'normal'}
        />
        <MetricDisplay
          label="DISK STORAGE"
          value={diskCurrent}
          unit="%"
          sublabel="ROOT MOUNT (/)"
          secondaryText="PERSISTENT STORAGE"
          status={metrics?.disk > 90 ? 'critical' : metrics?.disk > 80 ? 'warning' : 'normal'}
        />
      </section>

      {/* Operational Strip */}
      <DataStrip metrics={metrics} isOffline={isOffline} lastUpdated={lastUpdated} />

      {/* Telemetry Figures Header & Window Selector */}
      <div className="editorial-header margin-top-lg">
        <div>
          <h2 className="editorial-title">HISTORICAL TELEMETRY FIGURES</h2>
          <p className="editorial-subtitle">
            Analytical telemetry time series ({activeWindow.subtitle})
          </p>
        </div>
        <span className="editorial-tag">SOURCE: VICTORIAMETRICS</span>
      </div>

      {/* Time Window Selector Strip */}
      <div className="time-window-strip font-mono">
        <span className="time-window-label">TIME WINDOW:</span>
        <div className="time-window-buttons">
          {TIME_WINDOWS.map((win) => (
            <button
              key={win.id}
              type="button"
              className={`editorial-btn ${selectedWindowId === win.id ? 'editorial-btn-active' : ''}`}
              onClick={() => setSelectedWindowId(win.id)}
            >
              {win.label}
            </button>
          ))}
        </div>
      </div>

      <div className="charts-grid">
        {/* CPU Chart */}
        <ChartFrame
          figNum="FIG. 01"
          title="CPU UTILIZATION HISTORY"
          subtitle={activeWindow.subtitle}
          currentValue={cpuCurrent}
          peakValue={cpuPeak}
          unit="%"
        >
          <TelemetryChart
            data={cpuHistory}
            series={[{ key: 'value', label: 'CPU %', color: '#f97316', fillOpacity: 0.15 }]}
            unitFormatter={(v) => `${Number(v).toFixed(1)}%`}
            yDomain={[0, 100]}
            chartType="area"
          />
        </ChartFrame>

        {/* Memory + Swap Chart */}
        <ChartFrame
          figNum="FIG. 02"
          title="MEMORY & SWAP UTILIZATION"
          subtitle={activeWindow.subtitle}
          currentValue={memCurrent}
          peakValue={memPeak}
          unit="%"
        >
          <TelemetryChart
            data={memoryHistory}
            series={[
              { key: 'memory', label: 'Memory %', color: '#38bdf8', fillOpacity: 0.15 },
              { key: 'swap', label: 'Swap %', color: '#fbbf24', fillOpacity: 0.05 },
            ]}
            unitFormatter={(v) => `${Number(v).toFixed(1)}%`}
            yDomain={[0, 100]}
            chartType="area"
          />
        </ChartFrame>

        {/* Load Average Chart */}
        <ChartFrame
          figNum="FIG. 03"
          title="SYSTEM LOAD AVERAGE"
          subtitle={activeWindow.subtitle}
          currentValue={metrics?.load_1m ? formatNumber(metrics.load_1m, 2) : '—'}
          unit=""
        >
          <TelemetryChart
            data={loadHistory}
            series={[
              { key: 'load_1m', label: 'Load 1m', color: '#f97316' },
              { key: 'load_5m', label: 'Load 5m', color: '#34d399' },
              { key: 'load_15m', label: 'Load 15m', color: '#a78bfa' },
            ]}
            unitFormatter={(v) => Number(v).toFixed(2)}
            yDomain={[0, 'auto']}
            chartType="line"
          />
        </ChartFrame>

        {/* Network Throughput */}
        <ChartFrame
          figNum="FIG. 04"
          title="NETWORK THROUGHPUT"
          subtitle={activeWindow.subtitle}
          currentValue={metrics?.network_rx ? formatBytesPerSec(metrics.network_rx) : '—'}
          unit=""
        >
          <TelemetryChart
            data={networkHistory}
            series={[
              { key: 'network_rx', label: 'RX Rate', color: '#38bdf8', fillOpacity: 0.15 },
              { key: 'network_tx', label: 'TX Rate', color: '#f43f5e', fillOpacity: 0.15 },
            ]}
            unitFormatter={formatBytesPerSec}
            yDomain={[0, 'auto']}
            chartType="area"
          />
        </ChartFrame>

        {/* Disk I/O Throughput */}
        <ChartFrame
          figNum="FIG. 05"
          title="DISK I/O THROUGHPUT"
          subtitle={activeWindow.subtitle}
          currentValue={metrics?.disk_write ? formatBytesPerSec(metrics.disk_write) : '—'}
          unit=""
        >
          <TelemetryChart
            data={diskIoHistory}
            series={[
              { key: 'disk_read', label: 'Disk Read', color: '#34d399', fillOpacity: 0.15 },
              { key: 'disk_write', label: 'Disk Write', color: '#fbbf24', fillOpacity: 0.15 },
            ]}
            unitFormatter={formatBytesPerSec}
            yDomain={[0, 'auto']}
            chartType="area"
          />
        </ChartFrame>
      </div>

      <style>{`
        .health-hero {
          background-color: var(--bg-surface);
          border: 1px solid var(--border-strong);
          padding: 20px 24px;
          margin-bottom: 24px;
        }

        .hero-status-row {
          display: flex;
          justify-content: space-between;
          align-items: center;
          gap: 20px;
          flex-wrap: wrap;
        }

        .hero-status-title {
          font-size: 15px;
          font-weight: 700;
          letter-spacing: 0.05em;
          margin-top: 4px;
        }

        .engine-badge {
          background: var(--bg-main);
          border: 1px solid var(--border-subtle);
          padding: 6px 12px;
          font-size: 10px;
          display: flex;
          gap: 6px;
        }

        .engine-badge-label {
          color: var(--text-tertiary);
        }

        .engine-badge-status {
          color: var(--text-secondary);
        }

        .primary-telemetry-grid {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
          gap: 20px;
          margin-bottom: 24px;
        }

        .margin-top-lg {
          margin-top: 36px;
        }

        .time-window-strip {
          display: flex;
          align-items: center;
          gap: 16px;
          background: var(--bg-surface);
          border: 1px solid var(--border-strong);
          padding: 12px 20px;
          margin-bottom: 24px;
          flex-wrap: wrap;
        }

        .time-window-label {
          font-size: 10px;
          color: var(--text-tertiary);
          letter-spacing: 0.08em;
        }

        .time-window-buttons {
          display: flex;
          gap: 8px;
          flex-wrap: wrap;
        }

        .charts-grid {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(480px, 1fr));
          gap: 24px;
        }

        @media (max-width: 768px) {
          .charts-grid {
            grid-template-columns: 1fr;
          }
        }

        .text-healthy { color: var(--status-healthy); }
        .text-critical { color: var(--status-critical); }
      `}</style>
    </div>
  );
}

export default OverviewPage;
