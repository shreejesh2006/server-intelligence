import React, { useEffect, useState } from 'react';
import PageHeader from '../../components/common/PageHeader';
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
  formatNumber,
  formatUptime
} from '../../utils/formatters';
import { Server, Activity, Cpu, HardDrive, ShieldCheck, Zap, Network, Layers } from 'lucide-react';

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

  const [selectedWindowId, setSelectedWindowId] = useState('1h');
  const activeWindow = TIME_WINDOWS.find((w) => w.id === selectedWindowId) || TIME_WINDOWS[3];

  const [historyLoading, setHistoryLoading] = useState(true);

  const [cpuHistory, setCpuHistory] = useState([]);
  const [memoryHistory, setMemoryHistory] = useState([]);
  const [loadHistory, setLoadHistory] = useState([]);
  const [networkHistory, setNetworkHistory] = useState([]);

  const [cpuPeak, setCpuPeak] = useState(null);
  const [memPeak, setMemPeak] = useState(null);

  useEffect(() => {
    let isCancelled = false;

    async function loadHistoryData() {
      setHistoryLoading(true);
      try {
        const { start, step } = activeWindow;
        const [cpuRes, memRes, swapRes, loadRes, netRes] = await Promise.all([
          getMetricHistory('cpu', start, 'now', step, selectedHost).catch(() => ({ values: [] })),
          getMetricHistory('memory', start, 'now', step, selectedHost).catch(() => ({ values: [] })),
          getMetricHistory('swap', start, 'now', step, selectedHost).catch(() => ({ values: [] })),
          getMultiMetricHistory(['load_1m', 'load_5m', 'load_15m'], start, 'now', step, selectedHost),
          getMultiMetricHistory(['network_rx', 'network_tx'], start, 'now', step, selectedHost),
        ]);

        if (isCancelled) return;

        const cpuVals = cpuRes.values || [];
        setCpuHistory(cpuVals);
        if (cpuVals.length > 0) {
          const maxCpu = Math.max(...cpuVals.map((v) => v.value));
          setCpuPeak(formatNumber(maxCpu, 1));
        } else {
          setCpuPeak(null);
        }

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

        setLoadHistory(loadRes.timeline || []);
        setNetworkHistory(netRes.timeline || []);
      } catch (err) {
        if (import.meta.env.DEV) {
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

  const cpuVal = metrics?.cpu != null ? metrics.cpu : 0;
  const memVal = metrics?.memory != null ? metrics.memory : 0;
  const diskVal = metrics?.disk != null ? metrics.disk : 0;

  return (
    <div className="overview-page font-sans">
      <PageHeader
        index="01"
        title="SYSTEM PULSE"
        subtitle={`Real-time observability console for ${activeServer.name} (${activeServer.ip}).`}
        tag="OBSERVABILITY CONSOLE"
      />

      {isOffline && <OfflineBanner onRetry={refetch} />}

      {/* 1. LARGE PRIMARY HERO CARD */}
      <section className="neo-card hero-primary-card margin-bottom-lg">
        <div className="hero-top-bar">
          <div className="hero-left-title">
            <div className="node-icon-box">
              <Server size={22} className="text-accent" />
            </div>
            <div>
              <div className="node-title font-sans">{activeServer.name}</div>
              <div className="node-subtitle font-mono text-tertiary">
                {activeServer.os} &bull; <strong className="text-primary">{activeServer.ip}</strong>
              </div>
            </div>
          </div>

          <div className="hero-right-controls">
            <div className="neo-segmented-track font-mono">
              {servers.map((srv) => (
                <button
                  key={srv.host}
                  type="button"
                  onClick={() => selectServer(srv.host)}
                  className={`neo-segmented-item ${selectedHost === srv.host ? 'active' : ''}`}
                >
                  {srv.host.toUpperCase()}
                </button>
              ))}
            </div>

            <span className={`editorial-pill ${!isOffline && metrics ? 'pill-healthy' : 'pill-critical'}`}>
              <ShieldCheck size={12} />
              {!isOffline && metrics ? 'NODE ONLINE' : 'NODE UNREACHABLE'}
            </span>
          </div>
        </div>

        <div className="hero-divider" />

        {/* Primary Health Gauges Row */}
        <div className="hero-gauges-grid font-mono">
          <div className="gauge-item">
            <div className="gauge-header">
              <Cpu size={15} className="text-accent" />
              <span className="gauge-label text-tertiary">CPU UTILIZATION</span>
            </div>
            <div className="neo-metric-num hero-gauge-num">
              {formatNumber(cpuVal, 1)}
              <span className="neo-metric-unit">%</span>
            </div>
            <div className="neo-progress-track">
              <div
                className="neo-progress-fill bg-accent"
                style={{ width: `${Math.min(100, Math.max(0, cpuVal))}%` }}
              />
            </div>
          </div>

          <div className="gauge-item">
            <div className="gauge-header">
              <Activity size={15} className="text-info" />
              <span className="gauge-label text-tertiary">MEMORY USAGE</span>
            </div>
            <div className="neo-metric-num hero-gauge-num">
              {formatNumber(memVal, 1)}
              <span className="neo-metric-unit">%</span>
            </div>
            <div className="neo-progress-track">
              <div
                className="neo-progress-fill bg-info"
                style={{ width: `${Math.min(100, Math.max(0, memVal))}%` }}
              />
            </div>
          </div>

          <div className="gauge-item">
            <div className="gauge-header">
              <HardDrive size={15} className="text-warning" />
              <span className="gauge-label text-tertiary">DISK STORAGE</span>
            </div>
            <div className="neo-metric-num hero-gauge-num">
              {formatNumber(diskVal, 1)}
              <span className="neo-metric-unit">%</span>
            </div>
            <div className="neo-progress-track">
              <div
                className="neo-progress-fill bg-warning"
                style={{ width: `${Math.min(100, Math.max(0, diskVal))}%` }}
              />
            </div>
          </div>
        </div>
      </section>

      {/* 2. MEDIUM TELEMETRY CARDS */}
      <div className="section-label-strip font-mono margin-bottom-sm">
        <span className="editorial-tag">02 / LIVE TELEMETRY SNAPSHOT</span>
      </div>

      <div className="telemetry-cards-grid margin-bottom-lg">
        {/* CPU Card */}
        <div className="neo-card metric-card font-mono">
          <div className="metric-card-header">
            <span className="editorial-tag">CPU UTILIZATION</span>
            <span className={`editorial-pill ${cpuVal > 85 ? 'pill-critical' : cpuVal > 70 ? 'pill-warning' : 'pill-healthy'}`}>
              {cpuVal > 85 ? 'CRITICAL' : cpuVal > 70 ? 'ELEVATED' : 'NOMINAL'}
            </span>
          </div>
          <div className="neo-metric-num hero-gauge-num margin-top-xs">
            {formatNumber(cpuVal, 1)}
            <span className="neo-metric-unit">%</span>
          </div>
          <div className="metric-card-footer text-tertiary text-xs margin-top-sm">
            <span>IO WAIT: {metrics?.iowait != null ? formatPercent(metrics.iowait) : '0.0%'}</span>
            <span>PEAK: {cpuPeak ? `${cpuPeak}%` : '—'}</span>
          </div>
        </div>

        {/* Memory Card */}
        <div className="neo-card metric-card font-mono">
          <div className="metric-card-header">
            <span className="editorial-tag">MEMORY USAGE</span>
            <span className={`editorial-pill ${memVal > 90 ? 'pill-critical' : memVal > 80 ? 'pill-warning' : 'pill-healthy'}`}>
              {memVal > 90 ? 'CRITICAL' : memVal > 80 ? 'ELEVATED' : 'NOMINAL'}
            </span>
          </div>
          <div className="neo-metric-num hero-gauge-num margin-top-xs">
            {formatNumber(memVal, 1)}
            <span className="neo-metric-unit">%</span>
          </div>
          <div className="metric-card-footer text-tertiary text-xs margin-top-sm">
            <span>SWAP: {metrics?.swap != null ? formatPercent(metrics.swap) : '0.0%'}</span>
            <span>PEAK: {memPeak ? `${memPeak}%` : '—'}</span>
          </div>
        </div>

        {/* System Load Card */}
        <div className="neo-card metric-card font-mono">
          <div className="metric-card-header">
            <span className="editorial-tag">LOAD 1M / 5M / 15M</span>
            <Zap size={14} className="text-accent" />
          </div>
          <div className="neo-metric-num hero-gauge-num margin-top-xs">
            {metrics?.load_1m != null ? formatNumber(metrics.load_1m, 2) : '—'}
          </div>
          <div className="metric-card-footer text-tertiary text-xs margin-top-sm">
            <span>5M: {metrics?.load_5m != null ? formatNumber(metrics.load_5m, 2) : '—'}</span>
            <span>15M: {metrics?.load_15m != null ? formatNumber(metrics.load_15m, 2) : '—'}</span>
          </div>
        </div>

        {/* Storage Card */}
        <div className="neo-card metric-card font-mono">
          <div className="metric-card-header">
            <span className="editorial-tag">DISK STORAGE</span>
            <span className={`editorial-pill ${diskVal > 90 ? 'pill-critical' : 'pill-neutral'}`}>
              ROOT (/)
            </span>
          </div>
          <div className="neo-metric-num hero-gauge-num margin-top-xs">
            {formatNumber(diskVal, 1)}
            <span className="neo-metric-unit">%</span>
          </div>
          <div className="metric-card-footer text-tertiary text-xs margin-top-sm">
            <span>MOUNT: /</span>
            <span>TYPE: ext4</span>
          </div>
        </div>
      </div>

      {/* 3. INTELLIGENCE SECTION */}
      <IntelligenceSection lastUpdated={lastUpdated} />

      {/* 4. TELEMETRY CHARTS SECTION */}
      <div className="editorial-header font-mono margin-top-lg">
        <div>
          <h2 className="editorial-title font-sans font-bold">TELEMETRY TIME SERIES ANALYSIS</h2>
          <span className="editorial-tag">{activeWindow.subtitle} — {activeServer.name.toUpperCase()}</span>
        </div>

        {/* Time Window Selector Controls */}
        <div className="neo-segmented-track font-mono">
          {TIME_WINDOWS.map((win) => (
            <button
              key={win.id}
              type="button"
              onClick={() => setSelectedWindowId(win.id)}
              className={`neo-segmented-item ${selectedWindowId === win.id ? 'active' : ''}`}
            >
              {win.label}
            </button>
          ))}
        </div>
      </div>

      {/* Charts Grid */}
      <div className="charts-grid margin-top-md">
        {/* CPU Chart */}
        <ChartFrame
          title="CPU UTILIZATION HISTORY (%)"
          subtitle={`Sustained vs peak CPU usage trends over ${activeWindow.label}`}
          badge={`${formatNumber(cpuVal, 1)}% CURRENT`}
          badgeType={cpuVal > 85 ? 'critical' : cpuVal > 70 ? 'warning' : 'healthy'}
        >
          <TelemetryChart
            data={cpuHistory}
            series={[
              { key: 'value', label: 'CPU Usage', color: 'var(--accent)', fillOpacity: 0.18 }
            ]}
            unitFormatter={(val) => `${Number(val).toFixed(1)}%`}
            yDomain={[0, 100]}
            chartType="area"
            loading={historyLoading}
          />
        </ChartFrame>

        {/* Memory Chart */}
        <ChartFrame
          title="MEMORY & SWAP SATURATION (%)"
          subtitle={`RAM footprint vs swap utilization over ${activeWindow.label}`}
          badge={`${formatNumber(memVal, 1)}% CURRENT`}
          badgeType={memVal > 90 ? 'critical' : memVal > 80 ? 'warning' : 'healthy'}
        >
          <TelemetryChart
            data={memoryHistory}
            series={[
              { key: 'memory', label: 'RAM Usage', color: 'var(--status-info)', fillOpacity: 0.18 },
              { key: 'swap', label: 'Swap Usage', color: 'var(--status-warning)', fillOpacity: 0.1 }
            ]}
            unitFormatter={(val) => `${Number(val).toFixed(1)}%`}
            yDomain={[0, 100]}
            chartType="area"
            loading={historyLoading}
          />
        </ChartFrame>

        {/* System Load Chart */}
        <ChartFrame
          title="SYSTEM LOAD AVERAGES (1M / 5M / 15M)"
          subtitle={`Exponential run-queue load thread averages over ${activeWindow.label}`}
          badge={metrics?.load_1m != null ? `${formatNumber(metrics.load_1m, 2)} LOAD` : 'N/A'}
          badgeType="neutral"
        >
          <TelemetryChart
            data={loadHistory}
            series={[
              { key: 'load_1m', label: '1m Load', color: 'var(--accent)' },
              { key: 'load_5m', label: '5m Load', color: 'var(--status-info)' },
              { key: 'load_15m', label: '15m Load', color: 'var(--text-tertiary)' }
            ]}
            unitFormatter={(val) => Number(val).toFixed(2)}
            yDomain={[0, 'auto']}
            chartType="line"
            loading={historyLoading}
          />
        </ChartFrame>

        {/* Network I/O Throughput Chart */}
        <ChartFrame
          title="NETWORK THROUGHPUT (RX / TX)"
          subtitle={`Network ingress (receive) and egress (transmit) rates over ${activeWindow.label}`}
          badge="LIVE I/O"
          badgeType="neutral"
        >
          <TelemetryChart
            data={networkHistory}
            series={[
              { key: 'network_rx', label: 'Receive (RX)', color: 'var(--accent)' },
              { key: 'network_tx', label: 'Transmit (TX)', color: 'var(--status-warning)' }
            ]}
            unitFormatter={(val) => formatBytesPerSec(val)}
            yDomain={[0, 'auto']}
            chartType="line"
            loading={historyLoading}
          />
        </ChartFrame>
      </div>

      {/* 5. CONTEXTUAL METRICS & HARDWARE DETAILS */}
      <div className="section-label-strip font-mono margin-top-lg margin-bottom-sm">
        <span className="editorial-tag">04 / CONTEXTUAL HARDWARE & SUBSYSTEM DETAILS</span>
      </div>

      <div className="contextual-cards-grid font-mono margin-bottom-lg">
        <div className="neo-card context-card">
          <div className="context-card-header text-tertiary">
            <Cpu size={14} className="text-accent" />
            <span className="editorial-tag">CPU SUBSYSTEM</span>
          </div>
          <div className="context-card-body margin-top-sm">
            <div className="context-row">
              <span className="text-tertiary">CORES DETECTED:</span>
              <span className="text-primary font-bold">{metrics?.cpu_count ?? 'N/A'}</span>
            </div>
            <div className="context-row">
              <span className="text-tertiary">IO WAIT TIME:</span>
              <span className="text-primary font-bold">{metrics?.iowait != null ? formatPercent(metrics.iowait) : 'N/A'}</span>
            </div>
            <div className="context-row">
              <span className="text-tertiary">WINDOW PEAK:</span>
              <span className="text-accent font-bold">{cpuPeak ? `${cpuPeak}%` : 'N/A'}</span>
            </div>
          </div>
        </div>

        <div className="neo-card context-card">
          <div className="context-card-header text-tertiary">
            <Layers size={14} className="text-info" />
            <span className="editorial-tag">MEMORY & SWAP</span>
          </div>
          <div className="context-card-body margin-top-sm">
            <div className="context-row">
              <span className="text-tertiary">SWAP USED:</span>
              <span className="text-primary font-bold">{metrics?.swap != null ? formatPercent(metrics.swap) : 'N/A'}</span>
            </div>
            <div className="context-row">
              <span className="text-tertiary">RAM PEAK:</span>
              <span className="text-info font-bold">{memPeak ? `${memPeak}%` : 'N/A'}</span>
            </div>
            <div className="context-row">
              <span className="text-tertiary">MEMORY STATUS:</span>
              <span className="text-healthy font-bold">OPTIMAL</span>
            </div>
          </div>
        </div>

        <div className="neo-card context-card">
          <div className="context-card-header text-tertiary">
            <Network size={14} className="text-warning" />
            <span className="editorial-tag">SYSTEM & UPTIME</span>
          </div>
          <div className="context-card-body margin-top-sm">
            <div className="context-row">
              <span className="text-tertiary">UPTIME DURATION:</span>
              <span className="text-primary font-bold">{metrics?.uptime ? formatUptime(metrics.uptime) : 'N/A'}</span>
            </div>
            <div className="context-row">
              <span className="text-tertiary">ACTIVE TARGET:</span>
              <span className="text-accent font-bold">{activeServer.name}</span>
            </div>
            <div className="context-row">
              <span className="text-tertiary">TAILSCALE IP:</span>
              <span className="text-primary font-bold">{activeServer.ip}</span>
            </div>
          </div>
        </div>
      </div>

      <style>{`
        .margin-top-xs { margin-top: 4px; }
        .margin-top-sm { margin-top: 8px; }
        .margin-top-md { margin-top: 16px; }
        .margin-top-lg { margin-top: 24px; }
        .margin-bottom-sm { margin-bottom: 8px; }
        .margin-bottom-lg { margin-bottom: 24px; }

        .hero-primary-card {
          padding: 24px 28px;
        }

        .hero-top-bar {
          display: flex;
          justify-content: space-between;
          align-items: center;
          gap: 16px;
          flex-wrap: wrap;
        }

        .hero-left-title {
          display: flex;
          align-items: center;
          gap: 14px;
        }

        .node-icon-box {
          width: 44px;
          height: 44px;
          background: var(--bg-inset);
          border-radius: var(--radius-md);
          border: 1px solid var(--border-subtle);
          display: flex;
          align-items: center;
          justify-content: center;
        }

        .node-title {
          font-size: 22px;
          font-weight: 700;
          color: var(--text-primary);
          letter-spacing: -0.01em;
        }

        .node-subtitle {
          font-size: 12px;
          margin-top: 2px;
        }

        .hero-right-controls {
          display: flex;
          align-items: center;
          gap: 12px;
          flex-wrap: wrap;
        }

        .hero-divider {
          height: 1px;
          background: var(--border-subtle);
          margin: 20px 0;
        }

        .hero-gauges-grid {
          display: grid;
          grid-template-columns: repeat(3, 1fr);
          gap: 20px;
        }

        .gauge-item {
          background: var(--bg-inset);
          border-radius: var(--radius-md);
          border: 1px solid var(--border-subtle);
          padding: 16px 20px;
          display: flex;
          flex-direction: column;
          gap: 8px;
        }

        .gauge-header {
          display: flex;
          align-items: center;
          gap: 8px;
        }

        .gauge-label {
          font-size: 11px;
          letter-spacing: 0.06em;
          font-weight: 600;
        }

        .hero-gauge-num {
          font-size: 28px !important;
          font-weight: 800;
          color: var(--text-primary);
          letter-spacing: -0.02em;
          line-height: 1.2;
        }

        .neo-progress-track {
          height: 6px;
          background: rgba(148, 163, 184, 0.2);
          border-radius: var(--radius-pill);
          overflow: hidden;
        }

        .neo-progress-fill {
          height: 100%;
          border-radius: var(--radius-pill);
          transition: width 0.3s ease;
        }

        .bg-accent { background: var(--accent); }
        .bg-info { background: var(--status-info); }
        .bg-warning { background: var(--status-warning); }

        .telemetry-cards-grid {
          display: grid;
          grid-template-columns: repeat(4, 1fr);
          gap: 16px;
        }

        .metric-card {
          display: flex;
          flex-direction: column;
          justify-content: space-between;
          min-height: 125px;
          padding: 18px 20px;
        }

        .metric-card-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
        }

        .metric-card-footer {
          display: flex;
          justify-content: space-between;
          border-top: 1px solid var(--border-subtle);
          padding-top: 8px;
        }

        .editorial-header {
          display: flex;
          justify-content: space-between;
          align-items: flex-end;
          padding-bottom: 12px;
          border-bottom: 1px solid var(--border-subtle);
          margin-bottom: 18px;
        }

        .editorial-title {
          font-size: 16px;
          font-weight: 700;
          letter-spacing: -0.01em;
          color: var(--text-primary);
        }

        .charts-grid {
          display: grid;
          grid-template-columns: repeat(2, 1fr);
          gap: 20px;
        }

        .contextual-cards-grid {
          display: grid;
          grid-template-columns: repeat(3, 1fr);
          gap: 16px;
        }

        .context-card-header {
          display: flex;
          align-items: center;
          gap: 8px;
          border-bottom: 1px solid var(--border-subtle);
          padding-bottom: 8px;
        }

        .context-card-body {
          display: flex;
          flex-direction: column;
          gap: 6px;
        }

        .context-row {
          display: flex;
          justify-content: space-between;
          font-size: 11px;
        }

        .text-accent { color: var(--accent); }
        .text-info { color: var(--status-info); }
        .text-warning { color: var(--status-warning); }
        .text-healthy { color: var(--status-healthy); }
        .text-tertiary { color: var(--text-tertiary); }
        .text-secondary { color: var(--text-secondary); }
        .text-primary { color: var(--text-primary); }

        @media (max-width: 1100px) {
          .telemetry-cards-grid {
            grid-template-columns: repeat(2, 1fr);
          }
          .charts-grid {
            grid-template-columns: 1fr;
          }
          .contextual-cards-grid {
            grid-template-columns: 1fr;
          }
        }

        @media (max-width: 768px) {
          .hero-gauges-grid {
            grid-template-columns: 1fr;
          }
          .telemetry-cards-grid {
            grid-template-columns: 1fr;
          }
        }
      `}</style>
    </div>
  );
}

export default OverviewPage;
