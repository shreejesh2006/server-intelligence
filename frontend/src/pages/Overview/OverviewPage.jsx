import React, { useEffect, useState } from 'react';
import PageHeader from '../../components/common/PageHeader';
import MetricDisplay from '../../components/common/MetricDisplay';
import DataStrip from '../../components/common/DataStrip';
import OfflineBanner from '../../components/common/OfflineBanner';
import ChartFrame from '../../components/charts/ChartFrame';
import TelemetryChart from '../../components/charts/TelemetryChart';
import IntelligenceSection from '../../components/intelligence/IntelligenceSection';
import { useServer } from '../../context/ServerContext';
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
  { id: '5m', label: '5M', start: '-5m', step: '5s', subtitle: 'OVER 5 MINUTES (5s STEP)' },
  { id: '15m', label: '15M', start: '-15m', step: '15s', subtitle: 'OVER 15 MINUTES (15s STEP)' },
  { id: '30m', label: '30M', start: '-30m', step: '30s', subtitle: 'OVER 30 MINUTES (30s STEP)' },
  { id: '1h', label: '1H', start: '-1h', step: '30s', subtitle: 'OVER 1 HOUR (30s STEP)' },
  { id: '3h', label: '3H', start: '-3h', step: '1m', subtitle: 'OVER 3 HOURS (1m STEP)' },
  { id: '6h', label: '6H', start: '-6h', step: '2m', subtitle: 'OVER 6 HOURS (2m STEP)' },
  { id: '12h', label: '12H', start: '-12h', step: '5m', subtitle: 'OVER 12 HOURS (5m STEP)' },
  { id: '24h', label: '24H', start: '-24h', step: '10m', subtitle: 'OVER 24 HOURS (10m STEP)' },
];

export function OverviewPage({ metrics, isOffline, lastUpdated, refetch }) {
  const { servers, selectedHost, activeServer, selectServer } = useServer();

  // Selected time window state
  const [selectedWindowId, setSelectedWindowId] = useState('1h');
  const activeWindow = TIME_WINDOWS.find((w) => w.id === selectedWindowId) || TIME_WINDOWS[3];

  // History loading state
  const [historyLoading, setHistoryLoading] = useState(true);

  // History state for charts
  const [cpuHistory, setCpuHistory] = useState([]);
  const [memoryHistory, setMemoryHistory] = useState([]);
  const [loadHistory, setLoadHistory] = useState([]);
  const [networkHistory, setNetworkHistory] = useState([]);
  const [diskIoHistory, setDiskIoHistory] = useState([]);

  // Peaks
  const [cpuPeak, setCpuPeak] = useState(null);
  const [memPeak, setMemPeak] = useState(null);

  // Fetch telemetry history on load, refetch, window change, or server selection change
  useEffect(() => {
    let isCancelled = false;

    async function loadHistoryData() {
      setHistoryLoading(true);
      try {
        const { start, step } = activeWindow;
        const [cpuRes, memRes, swapRes, loadRes, netRes, diskRes] = await Promise.all([
          getMetricHistory('cpu', start, 'now', step, selectedHost).catch(() => ({ values: [] })),
          getMetricHistory('memory', start, 'now', step, selectedHost).catch(() => ({ values: [] })),
          getMetricHistory('swap', start, 'now', step, selectedHost).catch(() => ({ values: [] })),
          getMultiMetricHistory(['load_1m', 'load_5m', 'load_15m'], start, 'now', step, selectedHost),
          getMultiMetricHistory(['network_rx', 'network_tx'], start, 'now', step, selectedHost),
          getMultiMetricHistory(['disk_read', 'disk_write'], start, 'now', step, selectedHost),
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
        if (import.meta.env.DEV || process.env.NODE_ENV !== 'production') {
          console.warn('Error loading telemetry history:', err);
        }
      } finally {
        if (!isCancelled) {
          setHistoryLoading(false);
        }
      }
    }

    loadHistoryData();

    return () => {
      isCancelled = true;
    };
  }, [lastUpdated, selectedWindowId, activeWindow, selectedHost]);

  const cpuCurrent = metrics?.cpu != null ? formatNumber(metrics.cpu, 1) : null;
  const memCurrent = metrics?.memory != null ? formatNumber(metrics.memory, 1) : null;
  const diskCurrent = metrics?.disk != null ? formatNumber(metrics.disk, 1) : null;

  return (
    <div className="overview-page">
      <PageHeader
        index="01"
        title="SYSTEM PULSE"
        subtitle={`Live telemetry and operational state for ${activeServer.name} (${activeServer.ip}) from VictoriaMetrics.`}
        tag="LIVE SYSTEM OBSERVABILITY"
      />

      {isOffline && <OfflineBanner onRetry={refetch} />}

      {/* 1. SERVER SELECTION & OPERATIONAL STATUS HERO */}
      <section className="health-hero font-mono">
        <div className="hero-status-row">
          <div className="hero-status-left">
            <span className="editorial-tag">01 / TARGET SERVER SELECTION</span>
            <div className="server-selector-pills margin-top-xs">
              {servers.map((srv) => (
                <button
                  key={srv.host}
                  type="button"
                  onClick={() => selectServer(srv.host)}
                  className={`server-pill-btn ${selectedHost === srv.host ? 'active' : ''}`}
                >
                  <span className="srv-name">{srv.name.toUpperCase()}</span>
                  <span className="srv-ip">{srv.ip}</span>
                </button>
              ))}
            </div>
          </div>

          <div className="hero-status-right">
            <div className="hero-status-title">
              {isOffline ? (
                <span className="text-critical">SYSTEM OFFLINE — TELEMETRY UNREACHABLE</span>
              ) : (
                <span className="text-healthy">NODE ONLINE — {activeServer.host.toUpperCase()} ACTIVE</span>
              )}
            </div>
          </div>
        </div>
      </section>

      {/* 2. CURRENT TELEMETRY GRID */}
      <div className="section-label-strip font-mono">
        <span className="editorial-tag">02 / TELEMETRY SNAPSHOT — {activeServer.name.toUpperCase()}</span>
      </div>

      <section className="primary-telemetry-grid">
        <MetricDisplay
          label="CPU UTILIZATION"
          value={cpuCurrent}
          unit="%"
          sublabel={`${activeServer.host.toUpperCase()} METRIC`}
          secondaryText={metrics?.iowait != null ? `IO WAIT: ${formatPercent(metrics.iowait)}` : null}
          status={metrics?.cpu > 85 ? 'critical' : metrics?.cpu > 70 ? 'warning' : 'normal'}
        />
        <MetricDisplay
          label="MEMORY USAGE"
          value={memCurrent}
          unit="%"
          sublabel={metrics?.swap != null ? `SWAP: ${formatPercent(metrics.swap)}` : 'RAM USAGE'}
          secondaryText={`${activeServer.host.toUpperCase()} RAM`}
          status={metrics?.memory > 90 ? 'critical' : metrics?.memory > 80 ? 'warning' : 'normal'}
        />
        <MetricDisplay
          label="DISK STORAGE"
          value={diskCurrent}
          unit="%"
          sublabel="ROOT MOUNT (/)"
          secondaryText={`${activeServer.host.toUpperCase()} STORAGE`}
          status={metrics?.disk > 90 ? 'critical' : metrics?.disk > 80 ? 'warning' : 'normal'}
        />
      </section>

      {/* Operational Data Strip */}
      <DataStrip metrics={metrics} isOffline={isOffline} lastUpdated={lastUpdated} />

      {/* INTELLIGENCE ENGINE (ML & PERSISTENCE) */}
      <IntelligenceSection lastUpdated={lastUpdated} />

      {/* 4. HISTORICAL TELEMETRY FIGURES */}
      <div className="editorial-header margin-top-lg">
        <div>
          <span className="editorial-tag">04 / HISTORICAL TELEMETRY FIGURES — {activeServer.host.toUpperCase()}</span>
          <h2 className="editorial-title font-sans">ANALYTICAL TIME SERIES</h2>
        </div>

        {/* Infrastructure Console Segmented Range Selector */}
        <div className="time-range-segmented-group font-mono">
          <span className="range-group-label">TIME RANGE:</span>
          <div className="range-buttons-wrap">
            {TIME_WINDOWS.map((win) => (
              <button
                key={win.id}
                type="button"
                aria-label={`Set time range to ${win.label}`}
                className={`range-segment-btn ${selectedWindowId === win.id ? 'active' : ''}`}
                onClick={() => setSelectedWindowId(win.id)}
              >
                {win.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="charts-grid">
        {/* CPU Chart */}
        <ChartFrame
          figNum="FIG. 01"
          title={`CPU UTILIZATION (${activeServer.host.toUpperCase()})`}
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
            loading={historyLoading}
          />
        </ChartFrame>

        {/* Memory + Swap Chart */}
        <ChartFrame
          figNum="FIG. 02"
          title={`MEMORY & SWAP (${activeServer.host.toUpperCase()})`}
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
            loading={historyLoading}
          />
        </ChartFrame>

        {/* Load Average Chart */}
        <ChartFrame
          figNum="FIG. 03"
          title={`LOAD AVERAGE (${activeServer.host.toUpperCase()})`}
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
            loading={historyLoading}
          />
        </ChartFrame>

        {/* Network Throughput */}
        <ChartFrame
          figNum="FIG. 04"
          title={`NETWORK THROUGHPUT (${activeServer.host.toUpperCase()})`}
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
            loading={historyLoading}
          />
        </ChartFrame>

        {/* Disk I/O Throughput */}
        <ChartFrame
          figNum="FIG. 05"
          title={`DISK I/O THROUGHPUT (${activeServer.host.toUpperCase()})`}
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
            loading={historyLoading}
          />
        </ChartFrame>
      </div>

      <style>{`
        .health-hero {
          background-color: var(--bg-surface);
          border: 1px solid var(--border-strong);
          padding: 20px 24px;
          margin-bottom: 20px;
        }

        .hero-status-row {
          display: flex;
          justify-content: space-between;
          align-items: center;
          gap: 20px;
          flex-wrap: wrap;
        }

        .margin-top-xs {
          margin-top: 8px;
        }

        .server-selector-pills {
          display: flex;
          gap: 8px;
          flex-wrap: wrap;
        }

        .server-pill-btn {
          display: inline-flex;
          align-items: center;
          gap: 8px;
          padding: 6px 14px;
          background: var(--bg-main);
          border: 1px solid var(--border-subtle);
          color: var(--text-tertiary);
          font-family: var(--font-mono);
          font-size: 11px;
          cursor: pointer;
          transition: all 0.15s ease;
        }

        .server-pill-btn:hover {
          border-color: var(--accent);
          color: var(--text-primary);
        }

        .server-pill-btn.active {
          background: var(--bg-surface);
          border-color: var(--accent);
          color: var(--accent);
          font-weight: 700;
        }

        .srv-name {
          letter-spacing: 0.05em;
        }

        .srv-ip {
          font-size: 10px;
          color: var(--text-secondary);
        }

        .hero-status-title {
          font-size: 14px;
          font-weight: 700;
          letter-spacing: 0.05em;
        }

        .section-label-strip {
          margin-bottom: 12px;
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

        .time-range-segmented-group {
          display: flex;
          align-items: center;
          gap: 12px;
          background: var(--bg-surface);
          border: 1px solid var(--border-strong);
          padding: 4px 12px;
          flex-wrap: wrap;
        }

        .range-group-label {
          font-size: 10px;
          color: var(--text-tertiary);
          letter-spacing: 0.08em;
        }

        .range-buttons-wrap {
          display: flex;
          gap: 2px;
          background: var(--bg-main);
          border: 1px solid var(--border-subtle);
          padding: 2px;
          flex-wrap: wrap;
        }

        .range-segment-btn {
          background: transparent;
          border: none;
          color: var(--text-tertiary);
          padding: 4px 10px;
          font-family: var(--font-mono);
          font-size: 10px;
          font-weight: 600;
          letter-spacing: 0.05em;
          cursor: pointer;
          transition: all 0.15s ease;
        }

        .range-segment-btn:hover {
          color: var(--text-primary);
          background: var(--bg-surface-hover);
        }

        .range-segment-btn.active {
          background: var(--bg-surface);
          color: var(--accent);
          border: 1px solid var(--accent-border);
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
          .editorial-header {
            flex-direction: column;
            align-items: flex-start;
            gap: 12px;
          }
        }

        .text-healthy { color: var(--status-healthy); }
        .text-critical { color: var(--status-critical); }
      `}</style>
    </div>
  );
}

export default OverviewPage;
