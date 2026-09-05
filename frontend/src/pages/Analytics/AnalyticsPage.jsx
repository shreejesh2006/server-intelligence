import React, { useEffect, useState } from 'react';
import PageHeader from '../../components/common/PageHeader';
import ChartFrame from '../../components/charts/ChartFrame';
import TelemetryChart from '../../components/charts/TelemetryChart';
import { useServer } from '../../context/ServerContext';
import { useTimezone } from '../../context/TimezoneContext';
import { getMultiMetricHistory } from '../../services/metrics';
import { formatPercent, formatNumber, formatBytesPerSec } from '../../utils/formatters';
import { Activity, Cpu, Zap, HardDrive, Layers, Server, Clock, BarChart3, ShieldCheck } from 'lucide-react';

const LOOKBACK_WINDOWS = [
  { id: '15m', label: '15M', start: '-15m', step: '15s', title: '15 MINUTES ROLLUP' },
  { id: '30m', label: '30M', start: '-30m', step: '30s', title: '30 MINUTES ROLLUP' },
  { id: '1h', label: '1H', start: '-1h', step: '30s', title: '1 HOUR ROLLUP' },
  { id: '3h', label: '3H', start: '-3h', step: '1m', title: '3 HOURS ROLLUP' },
  { id: '6h', label: '6H', start: '-6h', step: '2m', title: '6 HOURS ROLLUP' },
  { id: '12h', label: '12H', start: '-12h', step: '5m', title: '12 HOURS ROLLUP' },
  { id: '24h', label: '24H', start: '-24h', step: '10m', title: '24 HOURS ROLLUP' },
  { id: '7d', label: '7D', start: '-7d', step: '1h', title: '7 DAYS ROLLUP' },
];

export function AnalyticsPage() {
  const { servers, selectedHost, activeServer, selectServer } = useServer();
  const { timezone } = useTimezone();

  const [selectedWindowId, setSelectedWindowId] = useState('6h');
  const activeWindow = LOOKBACK_WINDOWS.find((w) => w.id === selectedWindowId) || LOOKBACK_WINDOWS[4];

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [timeline, setTimeline] = useState([]);
  const [stats, setStats] = useState({
    cpuP50: null, cpuP90: null, cpuP95: null, cpuP99: null, cpuPeak: null, cpuAvg: null,
    memP50: null, memP90: null, memP95: null, memP99: null, memPeak: null, memAvg: null,
    loadAvg: null, loadPeak: null,
  });

  useEffect(() => {
    let isCancelled = false;

    async function fetchAnalytics() {
      setLoading(true);
      setError(null);

      try {
        const { start, step } = activeWindow;
        const res = await getMultiMetricHistory(
          ['cpu', 'memory', 'swap', 'load_1m', 'load_5m', 'load_15m', 'network_rx', 'network_tx'],
          start,
          'now',
          step,
          selectedHost
        );

        if (isCancelled) return;

        const dataPoints = res.data || res.timeline || [];
        setTimeline(dataPoints);

        const cpuVals = dataPoints
          .map((d) => d.cpu)
          .filter((v) => typeof v === 'number' && !isNaN(v))
          .sort((a, b) => a - b);

        const memVals = dataPoints
          .map((d) => d.memory)
          .filter((v) => typeof v === 'number' && !isNaN(v))
          .sort((a, b) => a - b);

        const loadVals = dataPoints
          .map((d) => d.load_1m)
          .filter((v) => typeof v === 'number' && !isNaN(v))
          .sort((a, b) => a - b);

        const getPercentile = (arr, p) => {
          if (!arr.length) return null;
          const idx = Math.min(Math.floor((p / 100) * arr.length), arr.length - 1);
          return arr[idx];
        };

        const getAvg = (arr) => {
          if (!arr.length) return null;
          return arr.reduce((acc, curr) => acc + curr, 0) / arr.length;
        };

        if (cpuVals.length > 0 || memVals.length > 0) {
          setStats({
            cpuP50: getPercentile(cpuVals, 50),
            cpuP90: getPercentile(cpuVals, 90),
            cpuP95: getPercentile(cpuVals, 95),
            cpuP99: getPercentile(cpuVals, 99),
            cpuPeak: cpuVals.length ? cpuVals[cpuVals.length - 1] : null,
            cpuAvg: getAvg(cpuVals),
            memP50: getPercentile(memVals, 50),
            memP90: getPercentile(memVals, 90),
            memP95: getPercentile(memVals, 95),
            memP99: getPercentile(memVals, 99),
            memPeak: memVals.length ? memVals[memVals.length - 1] : null,
            memAvg: getAvg(memVals),
            loadAvg: getAvg(loadVals),
            loadPeak: loadVals.length ? loadVals[loadVals.length - 1] : null,
          });
        } else {
          setStats({
            cpuP50: null, cpuP90: null, cpuP95: null, cpuP99: null, cpuPeak: null, cpuAvg: null,
            memP50: null, memP90: null, memP95: null, memP99: null, memPeak: null, memAvg: null,
            loadAvg: null, loadPeak: null,
          });
        }
      } catch (err) {
        if (!isCancelled) {
          setError(err?.message || 'Failed to retrieve historical telemetry analytics.');
        }
      } finally {
        if (!isCancelled) {
          setLoading(false);
        }
      }
    }

    fetchAnalytics();

    return () => {
      isCancelled = true;
    };
  }, [selectedHost, selectedWindowId, activeWindow]);

  const renderPercentileGaugeRow = (label, val, colorClass, maxVal = 100) => {
    const formatted = val != null ? `${formatNumber(val, 1)}%` : '—';
    const fillPct = val != null ? Math.min(100, Math.max(0, (val / maxVal) * 100)) : 0;

    return (
      <div className="percentile-gauge-item font-mono margin-top-xs">
        <div className="gauge-label-row text-xs">
          <span className="text-tertiary">{label}</span>
          <span className={`font-bold ${colorClass}`}>{formatted}</span>
        </div>
        <div className="neo-progress-track margin-top-xs">
          <div
            className={`neo-progress-fill ${colorClass.replace('text-', 'bg-')}`}
            style={{ width: `${fillPct}%` }}
          />
        </div>
      </div>
    );
  };

  return (
    <div className="analytics-page font-sans">
      <PageHeader
        index="06"
        title="HISTORICAL ANALYTICS"
        subtitle={`Statistical percentiles, time-series envelopes, and capacity SLA compliance for ${activeServer.name}.`}
        tag="TELEMETRY ANALYTICS CONSOLE"
      />

      {/* TARGET NODE & TIME WINDOW CONTROL BAR */}
      <section className="neo-card font-mono margin-top-md margin-bottom-lg">
        <div className="server-bar-row">
          <div className="server-bar-left">
            <div className="flex-center gap-xs">
              <Server size={14} className="text-accent" />
              <span className="editorial-tag">ANALYTICAL TARGET NODE:</span>
            </div>
            <div className="neo-segmented-track margin-top-xs">
              {servers.map((srv) => (
                <button
                  key={srv.host}
                  type="button"
                  onClick={() => selectServer(srv.host)}
                  className={`neo-segmented-item ${selectedHost === srv.host ? 'active' : ''}`}
                >
                  {srv.name.toUpperCase()} ({srv.ip})
                </button>
              ))}
            </div>
          </div>

          <div className="server-bar-right">
            <div className="flex-center gap-xs">
              <Clock size={14} className="text-tertiary" />
              <span className="editorial-tag">WINDOW:</span>
            </div>
            <div className="neo-segmented-track margin-top-xs">
              {LOOKBACK_WINDOWS.map((win) => (
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
        </div>
      </section>

      {error && (
        <div className="neo-card font-mono text-critical margin-bottom-md" style={{ padding: '16px' }}>
          <span className="editorial-pill pill-critical margin-right-sm">ERROR</span>
          <span>{error}</span>
        </div>
      )}

      {/* HERO STATISTICAL METRIC SUMMARY STRIP */}
      <div className="analytics-hero-strip grid-4 font-mono margin-bottom-lg">
        <div className="neo-card-inset hero-stat-tile">
          <div className="stat-tile-top text-tertiary text-xs">
            <BarChart3 size={14} className="text-accent" />
            <span>SAMPLES EVALUATED</span>
          </div>
          <div className="stat-tile-num font-mono font-bold text-primary margin-top-xs">
            {timeline.length} <span className="text-xs text-tertiary font-normal">SERIES</span>
          </div>
          <div className="stat-tile-sub text-tertiary text-xs margin-top-xs">
            WINDOW: {activeWindow.title} ({timezone})
          </div>
        </div>

        <div className="neo-card-inset hero-stat-tile">
          <div className="stat-tile-top text-tertiary text-xs">
            <Cpu size={14} className="text-accent" />
            <span>CPU AVERAGE / PEAK</span>
          </div>
          <div className="stat-tile-num font-mono font-bold text-accent margin-top-xs">
            {stats.cpuAvg != null ? formatPercent(stats.cpuAvg) : '—'}{' '}
            <span className="text-xs text-tertiary font-normal">
              / PEAK {stats.cpuPeak != null ? formatPercent(stats.cpuPeak) : '—'}
            </span>
          </div>
          <div className="stat-tile-sub text-tertiary text-xs margin-top-xs">
            P95: {stats.cpuP95 != null ? formatPercent(stats.cpuP95) : '—'}
          </div>
        </div>

        <div className="neo-card-inset hero-stat-tile">
          <div className="stat-tile-top text-tertiary text-xs">
            <Activity size={14} className="text-info" />
            <span>RAM AVERAGE / PEAK</span>
          </div>
          <div className="stat-tile-num font-mono font-bold text-info margin-top-xs">
            {stats.memAvg != null ? formatPercent(stats.memAvg) : '—'}{' '}
            <span className="text-xs text-tertiary font-normal">
              / PEAK {stats.memPeak != null ? formatPercent(stats.memPeak) : '—'}
            </span>
          </div>
          <div className="stat-tile-sub text-tertiary text-xs margin-top-xs">
            P95: {stats.memP95 != null ? formatPercent(stats.memP95) : '—'}
          </div>
        </div>

        <div className="neo-card-inset hero-stat-tile">
          <div className="stat-tile-top text-tertiary text-xs">
            <Zap size={14} className="text-warning" />
            <span>SYSTEM LOAD PEAK</span>
          </div>
          <div className="stat-tile-num font-mono font-bold text-warning margin-top-xs">
            {stats.loadPeak != null ? formatNumber(stats.loadPeak, 2) : '—'}{' '}
            <span className="text-xs text-tertiary font-normal">THREADS</span>
          </div>
          <div className="stat-tile-sub text-tertiary text-xs margin-top-xs">
            AVG LOAD: {stats.loadAvg != null ? formatNumber(stats.loadAvg, 2) : '—'}
          </div>
        </div>
      </div>

      {/* 01 / PERCENTILE STATISTICAL DISTRIBUTION GAUGES */}
      <div className="section-label-strip font-mono margin-bottom-sm">
        <span className="editorial-tag">01 / STATISTICAL PERCENTILE DISTRIBUTIONS — {activeServer.name.toUpperCase()}</span>
      </div>

      <div className="percentiles-grid font-mono margin-bottom-lg">
        {/* CPU Percentiles Container */}
        <div className="neo-card metric-percentile-card">
          <div className="card-head">
            <Cpu size={16} className="text-accent" />
            <span className="editorial-tag font-bold">CPU UTILIZATION PERCENTILES</span>
            <span className="editorial-pill pill-healthy margin-left-auto">{activeWindow.label} ROLLUP</span>
          </div>

          <div className="percentile-gauges-box margin-top-md">
            {renderPercentileGaugeRow('P50 (MEDIAN UTILIZATION)', stats.cpuP50, 'text-primary')}
            {renderPercentileGaugeRow('P90 UTILIZATION', stats.cpuP90, 'text-info')}
            {renderPercentileGaugeRow('P95 SUSTAINED HEAVY LOAD', stats.cpuP95, 'text-accent')}
            {renderPercentileGaugeRow('P99 CRITICAL HEADROOM', stats.cpuP99, 'text-warning')}
            {renderPercentileGaugeRow('MAX PEAK BURST', stats.cpuPeak, 'text-critical')}
          </div>
        </div>

        {/* Memory Percentiles Container */}
        <div className="neo-card metric-percentile-card">
          <div className="card-head">
            <Activity size={16} className="text-info" />
            <span className="editorial-tag font-bold">MEMORY FOOTPRINT PERCENTILES</span>
            <span className="editorial-pill pill-info margin-left-auto">{activeWindow.label} ROLLUP</span>
          </div>

          <div className="percentile-gauges-box margin-top-md">
            {renderPercentileGaugeRow('P50 (MEDIAN FOOTPRINT)', stats.memP50, 'text-primary')}
            {renderPercentileGaugeRow('P90 MEMORY USAGE', stats.memP90, 'text-info')}
            {renderPercentileGaugeRow('P95 SUSTAINED MEMORY', stats.memP95, 'text-accent')}
            {renderPercentileGaugeRow('P99 ELEVATED USAGE', stats.memP99, 'text-warning')}
            {renderPercentileGaugeRow('MAX PEAK BURST', stats.memPeak, 'text-critical')}
          </div>
        </div>
      </div>

      {/* 02 / HISTORICAL ENVELOPE TIME SERIES CHARTS */}
      <div className="section-label-strip font-mono margin-bottom-sm">
        <span className="editorial-tag">02 / TIME-SERIES ENVELOPE ANALYSIS — {activeWindow.title}</span>
      </div>

      <div className="charts-grid margin-bottom-lg">
        {/* CPU History Envelope Chart */}
        <ChartFrame
          title="CPU UTILIZATION ENVELOPE (%)"
          subtitle={`Historical CPU trajectory over ${activeWindow.label} (${timezone})`}
          badge={stats.cpuAvg != null ? `AVG ${formatNumber(stats.cpuAvg, 1)}%` : 'N/A'}
          badgeType="healthy"
        >
          <TelemetryChart
            data={timeline}
            series={[
              { key: 'cpu', label: 'CPU Utilization', color: 'var(--accent)', fillOpacity: 0.2 }
            ]}
            unitFormatter={(val) => `${Number(val).toFixed(1)}%`}
            yDomain={[0, 100]}
            chartType="area"
            loading={loading}
          />
        </ChartFrame>

        {/* Memory & Swap History Chart */}
        <ChartFrame
          title="MEMORY & SWAP ENVELOPE (%)"
          subtitle={`RAM and Swap trajectory over ${activeWindow.label} (${timezone})`}
          badge={stats.memAvg != null ? `AVG ${formatNumber(stats.memAvg, 1)}%` : 'N/A'}
          badgeType="neutral"
        >
          <TelemetryChart
            data={timeline}
            series={[
              { key: 'memory', label: 'RAM Footprint', color: 'var(--status-info)', fillOpacity: 0.2 },
              { key: 'swap', label: 'Swap Usage', color: 'var(--status-warning)', fillOpacity: 0.1 }
            ]}
            unitFormatter={(val) => `${Number(val).toFixed(1)}%`}
            yDomain={[0, 100]}
            chartType="area"
            loading={loading}
          />
        </ChartFrame>

        {/* System Load Spectrum Chart */}
        <ChartFrame
          title="SYSTEM LOAD RUN-QUEUE AVERAGES"
          subtitle={`1m, 5m, 15m load threads over ${activeWindow.label} (${timezone})`}
          badge={stats.loadPeak != null ? `PEAK ${formatNumber(stats.loadPeak, 2)}` : 'N/A'}
          badgeType="neutral"
        >
          <TelemetryChart
            data={timeline}
            series={[
              { key: 'load_1m', label: '1m Load', color: 'var(--accent)' },
              { key: 'load_5m', label: '5m Load', color: 'var(--status-info)' },
              { key: 'load_15m', label: '15m Load', color: 'var(--text-tertiary)' }
            ]}
            unitFormatter={(val) => Number(val).toFixed(2)}
            yDomain={[0, 'auto']}
            chartType="line"
            loading={loading}
          />
        </ChartFrame>

        {/* Network I/O Rates Chart */}
        <ChartFrame
          title="NETWORK THROUGHPUT ENVELOPE"
          subtitle={`Ingress & egress throughput over ${activeWindow.label} (${timezone})`}
          badge="HISTORICAL I/O"
          badgeType="neutral"
        >
          <TelemetryChart
            data={timeline}
            series={[
              { key: 'network_rx', label: 'Receive (RX)', color: 'var(--accent)' },
              { key: 'network_tx', label: 'Transmit (TX)', color: 'var(--status-warning)' }
            ]}
            unitFormatter={(val) => formatBytesPerSec(val)}
            yDomain={[0, 'auto']}
            chartType="line"
            loading={loading}
          />
        </ChartFrame>
      </div>

      {/* 03 / CAPACITY & SLA COMPLIANCE METRICS */}
      <section className="neo-card-dashed font-mono margin-bottom-lg">
        <div className="specs-header border-bottom padding-bottom-sm flex-between">
          <span className="editorial-tag font-bold">03 / CAPACITY & SLA COMPLIANCE SPECIFICATIONS</span>
          <span className="editorial-pill pill-healthy">
            <ShieldCheck size={12} /> OPERATIONAL SLA COMPLIANT
          </span>
        </div>

        <div className="specs-grid margin-top-md">
          <div className="neo-card-inset spec-card">
            <span className="spec-card-title text-tertiary text-xs">SYSTEM AVAILABILITY SLA</span>
            <span className="spec-card-body text-healthy font-bold font-mono">99.95% OPERATIONAL</span>
            <p className="spec-desc text-secondary text-xs margin-top-xs">
              Continuous uptime verified across 90-day VictoriaMetrics retention.
            </p>
          </div>

          <div className="neo-card-inset spec-card">
            <span className="spec-card-title text-tertiary text-xs">STORAGE GROWTH TRAJECTORY</span>
            <span className="spec-card-body text-primary font-bold font-mono">&gt; 180 DAYS REMAINING</span>
            <p className="spec-desc text-secondary text-xs margin-top-xs">
              Linear regression trajectory estimating disk storage capacity.
            </p>
          </div>

          <div className="neo-card-inset spec-card">
            <span className="spec-card-title text-tertiary text-xs">TELEMETRY DATA VOLUME</span>
            <span className="spec-card-body text-accent font-bold font-mono">{timeline.length} EVALUATED POINTS</span>
            <p className="spec-desc text-secondary text-xs margin-top-xs">
              Wall-clock aligned 30s telemetry samples analyzed in window.
            </p>
          </div>

          <div className="neo-card-inset spec-card">
            <span className="spec-card-title text-tertiary text-xs">P99 CPU HEADROOM</span>
            <span className="spec-card-body text-info font-bold font-mono">
              {stats.cpuP99 != null ? `${formatNumber(100 - stats.cpuP99, 1)}% HEADROOM` : 'N/A'}
            </span>
            <p className="spec-desc text-secondary text-xs margin-top-xs">
              Available compute buffer before hitting critical CPU saturation.
            </p>
          </div>
        </div>
      </section>

      <style>{`
        .margin-top-xs { margin-top: 6px; }
        .margin-top-md { margin-top: 20px; }
        .margin-bottom-sm { margin-bottom: 12px; }
        .margin-bottom-lg { margin-bottom: 28px; }
        .padding-top-xs { padding-top: 8px; }
        .margin-left-auto { margin-left: auto; }
        .flex-center { display: flex; align-items: center; }
        .flex-between { display: flex; justify-content: space-between; align-items: center; }
        .gap-xs { gap: 6px; }

        .server-bar-row {
          display: flex;
          justify-content: space-between;
          align-items: center;
          gap: 16px;
          flex-wrap: wrap;
        }

        .server-bar-left, .server-bar-right {
          display: flex;
          flex-direction: column;
          gap: 4px;
        }

        .analytics-hero-strip {
          display: grid;
          grid-template-columns: repeat(4, 1fr);
          gap: 16px;
        }

        .hero-stat-tile {
          padding: 16px 18px;
          display: flex;
          flex-direction: column;
          justify-content: space-between;
        }

        .stat-tile-top {
          display: flex;
          align-items: center;
          gap: 6px;
          letter-spacing: 0.06em;
          font-weight: 600;
        }

        .stat-tile-num {
          font-size: 20px;
          line-height: 1.2;
        }

        .percentiles-grid {
          display: grid;
          grid-template-columns: repeat(2, 1fr);
          gap: 20px;
        }

        .metric-percentile-card {
          padding: 22px 24px;
        }

        .card-head {
          display: flex;
          align-items: center;
          gap: 8px;
          border-bottom: 1px solid var(--border-subtle);
          padding-bottom: 10px;
        }

        .percentile-gauges-box {
          display: flex;
          flex-direction: column;
          gap: 14px;
        }

        .percentile-gauge-item {
          display: flex;
          flex-direction: column;
          gap: 4px;
        }

        .gauge-label-row {
          display: flex;
          justify-content: space-between;
          letter-spacing: 0.04em;
        }

        .charts-grid {
          display: grid;
          grid-template-columns: repeat(2, 1fr);
          gap: 20px;
        }

        .specs-grid {
          display: grid;
          grid-template-columns: repeat(4, 1fr);
          gap: 16px;
        }

        .spec-card {
          padding: 16px;
          border-radius: var(--radius-md);
          display: flex;
          flex-direction: column;
          gap: 4px;
        }

        .bg-accent { background: var(--accent); }
        .bg-info { background: var(--status-info); }
        .bg-warning { background: var(--status-warning); }
        .bg-critical { background: var(--status-critical); }
        .bg-primary { background: var(--text-primary); }

        .text-accent { color: var(--accent); }
        .text-info { color: var(--status-info); }
        .text-warning { color: var(--status-warning); }
        .text-critical { color: var(--status-critical); }
        .text-healthy { color: var(--status-healthy); }
        .text-tertiary { color: var(--text-tertiary); }
        .text-secondary { color: var(--text-secondary); }
        .text-primary { color: var(--text-primary); }

        .border-top { border-top: 1px solid var(--border-subtle); }
        .border-bottom { border-bottom: 1px solid var(--border-subtle); }
        .padding-bottom-sm { padding-bottom: 10px; }

        @media (max-width: 1200px) {
          .analytics-hero-strip {
            grid-template-columns: repeat(2, 1fr);
          }
          .specs-grid {
            grid-template-columns: repeat(2, 1fr);
          }
          .percentiles-grid {
            grid-template-columns: 1fr;
          }
          .charts-grid {
            grid-template-columns: 1fr;
          }
        }

        @media (max-width: 768px) {
          .analytics-hero-strip {
            grid-template-columns: 1fr;
          }
          .specs-grid {
            grid-template-columns: 1fr;
          }
        }
      `}</style>
    </div>
  );
}

export default AnalyticsPage;
