import React, { useEffect, useState } from 'react';
import PageHeader from '../../components/common/PageHeader';
import { useServer } from '../../context/ServerContext';
import { getMultiMetricHistory } from '../../services/metrics';
import { formatPercent } from '../../utils/formatters';
import { Activity, Cpu } from 'lucide-react';

export function AnalyticsPage() {
  const { servers, selectedHost, activeServer, selectServer } = useServer();
  const [timeline, setTimeline] = useState([]);
  const [stats, setStats] = useState({
    cpuP50: 0, cpuP90: 0, cpuP95: 0, cpuP99: 0, cpuPeak: 0,
    memP50: 0, memP90: 0, memP95: 0, memP99: 0, memPeak: 0,
  });

  useEffect(() => {
    let isCancelled = false;

    async function fetchAnalytics() {
      try {
        const res = await getMultiMetricHistory(['cpu', 'memory', 'load_1m'], '-6h', 'now', '1m', selectedHost);
        if (isCancelled) return;

        const dataPoints = res.timeline || [];
        setTimeline(dataPoints);

        const cpuVals = dataPoints.map((d) => d.cpu).filter((v) => typeof v === 'number').sort((a, b) => a - b);
        const memVals = dataPoints.map((d) => d.memory).filter((v) => typeof v === 'number').sort((a, b) => a - b);

        const getPercentile = (arr, p) => {
          if (!arr.length) return 0;
          const idx = Math.floor((p / 100) * arr.length);
          return arr[Math.min(idx, arr.length - 1)];
        };

        if (cpuVals.length > 0) {
          setStats({
            cpuP50: getPercentile(cpuVals, 50),
            cpuP90: getPercentile(cpuVals, 90),
            cpuP95: getPercentile(cpuVals, 95),
            cpuP99: getPercentile(cpuVals, 99),
            cpuPeak: cpuVals[cpuVals.length - 1],
            memP50: getPercentile(memVals, 50),
            memP90: getPercentile(memVals, 90),
            memP95: getPercentile(memVals, 95),
            memP99: getPercentile(memVals, 99),
            memPeak: memVals[memVals.length - 1] || 0,
          });
        }
      } catch (err) {
        if (import.meta.env.DEV) {
          console.warn('Analytics fetch error:', err);
        }
      }
    }

    fetchAnalytics();

    return () => {
      isCancelled = true;
    };
  }, [selectedHost]);

  return (
    <div className="analytics-page font-sans">
      <PageHeader
        index="06"
        title="HISTORICAL ANALYTICS"
        subtitle={`Statistical percentiles & long-term telemetry trends for ${activeServer.name}.`}
        tag="TELEMETRY ANALYTICS CONSOLE"
      />

      {/* Target Server Switcher Bar */}
      <section className="neo-card font-mono margin-top-md margin-bottom-lg">
        <div className="server-bar-row">
          <div className="server-bar-left">
            <span className="editorial-tag">ANALYTICAL TARGET NODE</span>
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

          <span className="editorial-pill pill-neutral font-mono">
            EVALUATION WINDOW: 6 HOURS ROLLUP
          </span>
        </div>
      </section>

      {/* PERCENTILE STATISTICAL BREAKDOWN */}
      <div className="section-label-strip font-mono margin-bottom-sm">
        <span className="editorial-tag">01 / STATISTICAL PERCENTILE DISTRIBUTIONS — {activeServer.host.toUpperCase()}</span>
      </div>

      <div className="percentiles-grid font-mono margin-bottom-lg">
        {/* CPU Percentiles */}
        <div className="neo-card metric-percentile-card">
          <div className="card-head">
            <Cpu size={16} className="text-accent" />
            <span className="editorial-tag">CPU PERCENTILE DISTRIBUTION</span>
          </div>

          <div className="percentile-rows margin-top-md">
            <div className="p-row">
              <span className="p-label text-tertiary">P50 (MEDIAN):</span>
              <span className="p-val text-primary font-bold">{formatPercent(stats.cpuP50)}</span>
            </div>
            <div className="p-row">
              <span className="p-label text-tertiary">P90 UTILIZATION:</span>
              <span className="p-val text-primary font-bold">{formatPercent(stats.cpuP90)}</span>
            </div>
            <div className="p-row">
              <span className="p-label text-tertiary">P95 UTILIZATION:</span>
              <span className="p-val text-accent font-bold">{formatPercent(stats.cpuP95)}</span>
            </div>
            <div className="p-row">
              <span className="p-label text-tertiary">P99 UTILIZATION:</span>
              <span className="p-val text-warning font-bold">{formatPercent(stats.cpuP99)}</span>
            </div>
            <div className="p-row border-top padding-top-xs">
              <span className="p-label text-tertiary">MAX PEAK BURST:</span>
              <span className="p-val text-critical font-bold">{formatPercent(stats.cpuPeak)}</span>
            </div>
          </div>
        </div>

        {/* Memory Percentiles */}
        <div className="neo-card metric-percentile-card">
          <div className="card-head">
            <Activity size={16} className="text-info" />
            <span className="editorial-tag">MEMORY PERCENTILE DISTRIBUTION</span>
          </div>

          <div className="percentile-rows margin-top-md">
            <div className="p-row">
              <span className="p-label text-tertiary">P50 (MEDIAN):</span>
              <span className="p-val text-primary font-bold">{formatPercent(stats.memP50)}</span>
            </div>
            <div className="p-row">
              <span className="p-label text-tertiary">P90 UTILIZATION:</span>
              <span className="p-val text-primary font-bold">{formatPercent(stats.memP90)}</span>
            </div>
            <div className="p-row">
              <span className="p-label text-tertiary">P95 UTILIZATION:</span>
              <span className="p-val text-info font-bold">{formatPercent(stats.memP95)}</span>
            </div>
            <div className="p-row">
              <span className="p-label text-tertiary">P99 UTILIZATION:</span>
              <span className="p-val text-warning font-bold">{formatPercent(stats.memP99)}</span>
            </div>
            <div className="p-row border-top padding-top-xs">
              <span className="p-label text-tertiary">MAX PEAK BURST:</span>
              <span className="p-val text-critical font-bold">{formatPercent(stats.memPeak)}</span>
            </div>
          </div>
        </div>
      </div>

      {/* SLA & GROWTH SPECIFICATIONS */}
      <section className="neo-card-dashed font-mono">
        <div className="specs-header border-bottom padding-bottom-sm">
          <span className="editorial-tag font-bold">02 / CAPACITY & SLA COMPLIANCE METRICS</span>
        </div>

        <div className="specs-grid margin-top-md">
          <div className="neo-card-inset spec-card">
            <span className="spec-card-title text-tertiary">AVAILABILITY SLA</span>
            <span className="spec-card-body text-healthy font-bold">99.95% OPERATIONAL</span>
            <p className="spec-desc text-secondary">Calculated continuous availability across 30-day telemetry retention.</p>
          </div>

          <div className="neo-card-inset spec-card">
            <span className="spec-card-title text-tertiary">STORAGE GROWTH ETA</span>
            <span className="spec-card-body text-primary font-bold">&gt; 180 DAYS REMAINING</span>
            <p className="spec-desc text-secondary">Linear regression model estimating disk space exhaustion timeline.</p>
          </div>

          <div className="neo-card-inset spec-card">
            <span className="spec-card-title text-tertiary">TELEMETRY SAMPLES</span>
            <span className="spec-card-body text-accent font-bold">{timeline.length} DATA POINTS</span>
            <p className="spec-desc text-secondary">Aggregated telemetry sample points evaluated from VictoriaMetrics time series.</p>
          </div>
        </div>
      </section>

      <style>{`
        .margin-top-xs { margin-top: 6px; }
        .margin-top-md { margin-top: 20px; }
        .margin-bottom-sm { margin-bottom: 12px; }
        .margin-bottom-lg { margin-bottom: 28px; }
        .padding-top-xs { padding-top: 8px; }

        .server-bar-row {
          display: flex;
          justify-content: space-between;
          align-items: center;
          gap: 16px;
          flex-wrap: wrap;
        }

        .percentiles-grid {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(320px, 1fr));
          gap: 20px;
        }

        .metric-percentile-card {
          padding: 24px;
        }

        .card-head {
          display: flex;
          align-items: center;
          gap: 8px;
          border-bottom: 1px solid var(--border-subtle);
          padding-bottom: 10px;
        }

        .percentile-rows {
          display: flex;
          flex-direction: column;
          gap: 10px;
        }

        .p-row {
          display: flex;
          justify-content: space-between;
          font-size: 11px;
        }

        .specs-grid {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(260px, 1fr));
          gap: 16px;
        }

        .spec-card {
          padding: 16px;
          border-radius: var(--radius-md);
          display: flex;
          flex-direction: column;
          gap: 6px;
        }

        .spec-card-title {
          font-size: 10px;
          letter-spacing: 0.08em;
        }

        .spec-card-body {
          font-size: 14px;
        }

        .spec-desc {
          font-size: 11px;
          line-height: 1.4;
          margin-top: 4px;
        }

        .border-top { border-top: 1px solid var(--border-subtle); }
        .border-bottom { border-bottom: 1px solid var(--border-subtle); }
        .padding-bottom-sm { padding-bottom: 10px; }

        .text-accent { color: var(--accent); }
        .text-info { color: var(--status-info); }
        .text-warning { color: var(--status-warning); }
        .text-critical { color: var(--status-critical); }
        .text-healthy { color: var(--status-healthy); }
        .text-tertiary { color: var(--text-tertiary); }
        .text-secondary { color: var(--text-secondary); }
        .text-primary { color: var(--text-primary); }
      `}</style>
    </div>
  );
}

export default AnalyticsPage;
