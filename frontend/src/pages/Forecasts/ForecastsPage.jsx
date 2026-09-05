import React, { useEffect, useState, useCallback } from 'react';
import PageHeader from '../../components/common/PageHeader';
import OfflineBanner from '../../components/common/OfflineBanner';
import ChartFrame from '../../components/charts/ChartFrame';
import TelemetryChart from '../../components/charts/TelemetryChart';
import { getForecast } from '../../services/intelligence';
import { useServer } from '../../context/ServerContext';
import { useTimezone } from '../../context/TimezoneContext';
import { formatNumber, formatPercent } from '../../utils/formatters';
import { Cpu, Activity, Zap, TrendingUp, RefreshCw, Server, ArrowUpRight, ArrowDownRight, Minus, ShieldCheck } from 'lucide-react';

export function ForecastsPage({ metrics, isOffline, lastUpdated, refetch }) {
  const { servers, selectedHost, activeServer, selectServer } = useServer();
  const { timezone, formatTimestamp } = useTimezone();
  const [loading, setLoading] = useState(true);
  const [forecastData, setForecastData] = useState(null);
  const [errorMsg, setErrorMsg] = useState(null);
  const [activeHorizon, setActiveHorizon] = useState('30m');

  const loadData = useCallback(async () => {
    setLoading(true);
    setErrorMsg(null);

    try {
      const res = await getForecast(selectedHost);
      setForecastData(res);
    } catch (err) {
      setErrorMsg(err?.response?.data?.detail || 'Intelligence forecasting models unavailable.');
    } finally {
      setLoading(false);
    }
  }, [selectedHost]);

  useEffect(() => {
    loadData();
  }, [loadData, lastUpdated, refetch]);

  const calculateExtendedProjection = (val3h, valCurr, factor, isDecimal, isPercentage) => {
    if (val3h == null || isNaN(val3h)) return null;

    const current = (valCurr != null && !isNaN(valCurr)) ? Number(valCurr) : Number(val3h);
    const delta = Number(val3h) - current;
    let projected = Number(val3h) + (delta * factor);

    if (isPercentage) {
      projected = Math.min(100.0, Math.max(0.0, projected));
    }
    if (isDecimal) {
      projected = Math.max(0.0, projected);
    }

    return projected;
  };

  const renderTrendBadge = (current, predicted, unitStr = '%') => {
    if (current == null || predicted == null) return <span className="text-tertiary text-xs">—</span>;
    const diff = predicted - current;
    const absDiff = Math.abs(diff);
    if (absDiff < 0.1) {
      return (
        <span className="trend-badge trend-stable font-mono text-xs">
          <Minus size={10} /> STABLE
        </span>
      );
    }
    if (diff > 0) {
      return (
        <span className="trend-badge trend-up font-mono text-xs text-warning">
          <ArrowUpRight size={11} /> +{formatNumber(absDiff, 1)}{unitStr}
        </span>
      );
    }
    return (
      <span className="trend-badge trend-down font-mono text-xs text-healthy">
        <ArrowDownRight size={11} /> -{formatNumber(absDiff, 1)}{unitStr}
      </span>
    );
  };

  const formattedGeneratedAt = forecastData?.generated_at
    ? formatTimestamp(new Date(forecastData.generated_at).getTime() / 1000, true, false)
    : 'N/A';

  const formattedTrainedAt = forecastData?.model_trained_at
    ? formatTimestamp(new Date(forecastData.model_trained_at).getTime() / 1000, true, false)
    : 'N/A';

  const modelStatus = forecastData?.model_status || 'fresh';

  // Construct chart trajectory timeline data for visual chart representation
  const buildForecastChartTimeline = () => {
    if (!forecastData) return [];

    const nowTs = Math.floor(Date.now() / 1000);
    const stepSecs = { '5m': 300, '15m': 900, '30m': 1800, '1h': 3600, '3h': 10800 };

    const cpuCurr = metrics?.cpu ?? forecastData?.cpu?.current ?? 0;
    const memCurr = metrics?.memory ?? forecastData?.memory?.current ?? 0;
    const loadCurr = metrics?.load_1m ?? forecastData?.load_1m?.current ?? 0;

    const timeline = [
      {
        timestamp: nowTs,
        horizonLabel: 'NOW',
        cpu: cpuCurr,
        memory: memCurr,
        load_1m: loadCurr,
      },
    ];

    ['5m', '15m', '30m', '1h', '3h'].forEach((h) => {
      timeline.push({
        timestamp: nowTs + stepSecs[h],
        horizonLabel: `+${h.toUpperCase()}`,
        cpu: forecastData?.cpu?.predictions?.[h] ?? cpuCurr,
        memory: forecastData?.memory?.predictions?.[h] ?? memCurr,
        load_1m: forecastData?.load_1m?.predictions?.[h] ?? loadCurr,
      });
    });

    return timeline;
  };

  const chartTimeline = buildForecastChartTimeline();

  const renderMetricForecastCard = (title, keyName, icon, unitStr = '%', isDecimal = false) => {
    const IconComponent = icon;
    const obj = forecastData?.[keyName];
    const predictions = obj?.predictions || {};

    let liveValue = null;
    if (keyName === 'cpu') {
      liveValue = metrics?.cpu;
    } else if (keyName === 'memory') {
      liveValue = metrics?.memory;
    } else if (keyName === 'load_1m') {
      liveValue = metrics?.load_1m;
    }

    const currentNumeric = liveValue != null ? liveValue : obj?.current;

    const realHorizons = [
      { id: '5m', label: '+5 MIN' },
      { id: '15m', label: '+15 MIN' },
      { id: '30m', label: '+30 MIN' },
      { id: '1h', label: '+1 HOUR' },
      { id: '3h', label: '+3 HOURS' },
    ];

    const extendedHorizons = [
      { id: '6h', factor: 0.15, label: '+6 HOURS' },
      { id: '12h', factor: 0.25, label: '+12 HOURS' },
      { id: '1d', factor: 0.35, label: '+24 HOURS' },
      { id: '7d', factor: 0.40, label: '+7 DAYS' },
      { id: '1mo', factor: 0.42, label: '+1 MONTH' },
    ];

    const val3h = predictions['3h'];

    const currentVal = currentNumeric != null
      ? (isDecimal ? formatNumber(currentNumeric, 2) : `${formatNumber(currentNumeric, 1)}${unitStr}`)
      : '—';

    const strategyName = (obj?.strategy || 'HISTGRADIENTBOOSTING').toUpperCase();
    const isPercentage = unitStr === '%';

    return (
      <div className="neo-card forecast-card font-mono">
        <div className="card-top-bar">
          <div className="title-row">
            <div className="card-icon font-mono">
              <IconComponent size={18} className="text-accent" />
            </div>
            <div>
              <div className="editorial-tag font-bold font-sans">{title}</div>
              <div className="metric-current font-bold text-primary margin-top-xs">
                CURRENT: <span className="text-accent">{currentVal}</span> &bull; 3H PREDICTION:{' '}
                <span className="text-warning">
                  {val3h != null
                    ? (isDecimal ? formatNumber(val3h, 2) : `${formatNumber(val3h, 1)}${unitStr}`)
                    : '—'}
                </span>
              </div>
            </div>
          </div>

          <div className="card-controls-right">
            {renderTrendBadge(currentNumeric, val3h, unitStr)}
            <span className="editorial-pill pill-healthy font-mono">
              MODEL: <span className="text-accent font-bold">{strategyName}</span>
            </span>
          </div>
        </div>

        <div className="horizons-container margin-top-md">
          {/* REAL ML HORIZONS GRID */}
          <div className="horizon-section-header flex-between">
            <span className="editorial-tag text-tertiary">REAL ML TRAJECTORY HORIZONS (5M – 3H)</span>
            <span className="text-xs text-accent font-bold">HOST-AWARE ML INFERENCE</span>
          </div>

          <div className="horizons-grid font-mono margin-top-xs margin-bottom-md">
            {realHorizons.map((hObj) => {
              const rawVal = predictions[hObj.id];
              const displayVal = rawVal != null
                ? (isDecimal ? formatNumber(rawVal, 2) : `${formatNumber(rawVal, 1)}${unitStr}`)
                : '—';
              const fillPct = rawVal != null
                ? (isPercentage ? Math.min(100, Math.max(0, rawVal)) : Math.min(100, Math.max(5, rawVal * 20)))
                : 0;

              return (
                <div key={hObj.id} className="horizon-neo-box neo-card-inset">
                  <div className="horizon-header">
                    <span className="horizon-label text-tertiary">{hObj.label}</span>
                    <span className="badge-tag tag-ml">ML</span>
                  </div>
                  <div className="horizon-val-row margin-top-xs">
                    <span className="horizon-value text-primary font-bold">{displayVal}</span>
                    {renderTrendBadge(currentNumeric, rawVal, unitStr)}
                  </div>
                  <div className="neo-progress-track margin-top-xs">
                    <div
                      className={`neo-progress-fill ${rawVal > 85 ? 'bg-critical' : rawVal > 70 ? 'bg-warning' : 'bg-accent'}`}
                      style={{ width: `${fillPct}%` }}
                    />
                  </div>
                </div>
              );
            })}
          </div>

          {/* EXTENDED DEMO PROJECTIONS GRID */}
          <div className="horizon-section-header flex-between">
            <span className="editorial-tag text-tertiary">DEMO EXTENDED TRAJECTORY PROJECTIONS (6H – 1MO)</span>
            <span className="text-xs text-tertiary">TREND EXTRAPOLATION</span>
          </div>

          <div className="horizons-grid font-mono margin-top-xs">
            {extendedHorizons.map((hObj) => {
              const projVal = calculateExtendedProjection(
                val3h,
                currentNumeric,
                hObj.factor,
                isDecimal,
                isPercentage
              );
              const displayVal = projVal != null
                ? (isDecimal ? formatNumber(projVal, 2) : `${formatNumber(projVal, 1)}${unitStr}`)
                : '—';
              const fillPct = projVal != null
                ? (isPercentage ? Math.min(100, Math.max(0, projVal)) : Math.min(100, Math.max(5, projVal * 20)))
                : 0;

              return (
                <div key={hObj.id} className="horizon-neo-box horizon-extended neo-card-inset">
                  <div className="horizon-header">
                    <span className="horizon-label text-tertiary">{hObj.label}</span>
                    <span className="badge-tag tag-ext">EXTENDED</span>
                  </div>
                  <div className="horizon-val-row margin-top-xs">
                    <span className="horizon-value text-primary font-bold">{displayVal}</span>
                    {renderTrendBadge(currentNumeric, projVal, unitStr)}
                  </div>
                  <div className="neo-progress-track margin-top-xs">
                    <div
                      className="neo-progress-fill bg-info"
                      style={{ width: `${fillPct}%` }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    );
  };

  return (
    <div className="forecasts-page font-sans">
      <PageHeader
        index="03"
        title="CAPACITY FORECASTS"
        subtitle={`Multi-horizon predictive modeling for CPU, Memory, and Load saturation risks on ${activeServer.name}.`}
        tag="PREDICTIVE INTELLIGENCE"
      />

      {isOffline && <OfflineBanner onRetry={refetch} />}

      {/* TARGET SERVER & METADATA CONTROL BAR */}
      <section className="neo-card font-mono margin-top-md margin-bottom-lg">
        <div className="server-bar-row">
          <div className="server-bar-left">
            <div className="flex-center gap-xs">
              <Server size={14} className="text-accent" />
              <span className="editorial-tag">PREDICTIVE TARGET SCOPE:</span>
            </div>
            <div className="neo-segmented-track margin-top-xs">
              {servers.map((srv) => {
                const h = srv.host.toLowerCase();
                const isSelected = selectedHost?.toLowerCase() === h;
                const label = h === 'ubuntu' ? 'UBUNTU (PRIMARY)' : 'KALI (TARGET VM)';
                return (
                  <button
                    key={srv.id}
                    type="button"
                    className={`neo-segmented-item ${isSelected ? 'active' : ''}`}
                    onClick={() => selectServer(h)}
                  >
                    {label}
                  </button>
                );
              })}
            </div>
          </div>

          <div className="server-bar-right">
            <span className={`editorial-pill ${modelStatus === 'stale' ? 'pill-warning' : 'pill-healthy'}`}>
              MODEL: {modelStatus.toUpperCase()}
            </span>
            <span className="text-tertiary text-xs">GEN: {formattedGeneratedAt}</span>
            <button
              type="button"
              className="neo-icon-btn"
              onClick={loadData}
              title="Refresh Forecast"
              disabled={loading}
            >
              <RefreshCw size={14} className={loading ? 'spin' : ''} />
            </button>
          </div>
        </div>
      </section>

      {/* 01 / FORECAST MATRIX CARDS (PREDICTIONS UP) */}
      <div className="section-label-strip font-mono margin-bottom-sm">
        <span className="editorial-tag">01 / DETAILED MULTI-HORIZON PREDICTION MATRIX (10 HORIZONS)</span>
      </div>

      {loading ? (
        <div className="forecast-skeleton-grid font-mono margin-bottom-lg">
          <div className="skeleton-card neo-card-inset" />
          <div className="skeleton-card neo-card-inset" />
          <div className="skeleton-card neo-card-inset" />
        </div>
      ) : errorMsg ? (
        <div className="neo-card-inset forecast-error-box font-mono margin-bottom-lg">
          <span>{errorMsg}</span>
        </div>
      ) : (
        <div className="forecast-cards-container margin-bottom-lg">
          {renderMetricForecastCard('CPU UTILIZATION FORECAST TRAJECTORY', 'cpu', Cpu, '%', false)}
          {renderMetricForecastCard('MEMORY USAGE FORECAST TRAJECTORY', 'memory', Activity, '%', false)}
          {renderMetricForecastCard('SYSTEM LOAD 1M FORECAST TRAJECTORY', 'load_1m', Zap, '', true)}
        </div>
      )}

      {/* 02 / HERO PREDICTIVE TRAJECTORY VISUAL CHARTS (GRAPHS BELOW) */}
      <div className="section-label-strip font-mono margin-bottom-sm">
        <span className="editorial-tag">02 / PREDICTIVE TRAJECTORY ENVELOPES — {activeServer.name.toUpperCase()}</span>
      </div>

      <div className="charts-grid margin-bottom-lg">
        {/* CPU Forecast Chart */}
        <ChartFrame
          title="CPU CAPACITY FORECAST TRAJECTORY (%)"
          subtitle={`Multi-horizon CPU prediction trajectory (${timezone})`}
          badge={forecastData?.cpu?.predictions?.['3h'] != null ? `+3H ${formatNumber(forecastData.cpu.predictions['3h'], 1)}%` : 'N/A'}
          badgeType="healthy"
        >
          <TelemetryChart
            data={chartTimeline}
            series={[
              { key: 'cpu', label: 'CPU Forecast Trajectory', color: 'var(--accent)', fillOpacity: 0.22 }
            ]}
            unitFormatter={(val) => `${Number(val).toFixed(1)}%`}
            yDomain={[0, 100]}
            chartType="area"
            loading={loading}
          />
        </ChartFrame>

        {/* Memory Forecast Chart */}
        <ChartFrame
          title="MEMORY USAGE FORECAST TRAJECTORY (%)"
          subtitle={`Multi-horizon RAM footprint trajectory (${timezone})`}
          badge={forecastData?.memory?.predictions?.['3h'] != null ? `+3H ${formatNumber(forecastData.memory.predictions['3h'], 1)}%` : 'N/A'}
          badgeType="neutral"
        >
          <TelemetryChart
            data={chartTimeline}
            series={[
              { key: 'memory', label: 'RAM Forecast Trajectory', color: 'var(--status-info)', fillOpacity: 0.22 }
            ]}
            unitFormatter={(val) => `${Number(val).toFixed(1)}%`}
            yDomain={[0, 100]}
            chartType="area"
            loading={loading}
          />
        </ChartFrame>
      </div>

      {/* MODEL POLICY & EVALUATION SPECIFICATIONS */}
      <section className="neo-card-dashed font-mono">
        <div className="specs-header border-bottom padding-bottom-sm flex-between">
          <span className="editorial-tag font-bold">03 / MACHINE LEARNING MODEL POLICY & SPECIFICATIONS</span>
          <span className="editorial-pill pill-healthy">
            <ShieldCheck size={12} /> HOST-AWARE ARTIFACTS
          </span>
        </div>

        <div className="specs-grid margin-top-md">
          <div className="neo-card-inset spec-card">
            <span className="spec-card-title text-tertiary text-xs">MODEL ARCHITECTURE</span>
            <span className="spec-card-body text-accent font-bold font-mono">HistGradientBoosting</span>
            <p className="spec-desc text-secondary text-xs margin-top-xs">
              Regression pipelines trained independently per target & horizon with lag feature extraction.
            </p>
          </div>

          <div className="neo-card-inset spec-card">
            <span className="spec-card-title text-tertiary text-xs">EVALUATION METRICS</span>
            <span className="spec-card-body text-primary font-bold font-mono">Chronological MAE & RMSE</span>
            <p className="spec-desc text-secondary text-xs margin-top-xs">
              Deploys only when validation MAE strictly outperforms naive persistence baseline.
            </p>
          </div>

          <div className="neo-card-inset spec-card">
            <span className="spec-card-title text-tertiary text-xs">MODEL TRAINED AT</span>
            <span className="spec-card-body text-healthy font-bold font-mono">{formattedTrainedAt}</span>
            <p className="spec-desc text-secondary text-xs margin-top-xs">
              Trained on 30-minute historical sequence vectors from VictoriaMetrics.
            </p>
          </div>

          <div className="neo-card-inset spec-card">
            <span className="spec-card-title text-tertiary text-xs">RESEARCH PHASE</span>
            <span className="spec-card-body text-warning font-bold font-mono">PatchTST Benchmark</span>
            <p className="spec-desc text-secondary text-xs margin-top-xs">
              Planned Transformer patching evaluation for sequence attention benchmarking.
            </p>
          </div>
        </div>
      </section>

      <style>{`
        .margin-top-xs { margin-top: 6px; }
        .margin-top-md { margin-top: 20px; }
        .margin-top-sm { margin-top: 12px; }
        .margin-bottom-sm { margin-bottom: 12px; }
        .margin-bottom-md { margin-bottom: 16px; }
        .margin-bottom-lg { margin-bottom: 28px; }
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

        .server-bar-left {
          display: flex;
          align-items: center;
          gap: 12px;
          flex-wrap: wrap;
        }

        .server-bar-right {
          display: flex;
          align-items: center;
          gap: 12px;
        }

        .charts-grid {
          display: grid;
          grid-template-columns: repeat(2, 1fr);
          gap: 20px;
        }

        .forecast-cards-container {
          display: flex;
          flex-direction: column;
          gap: 20px;
        }

        .forecast-card {
          padding: 22px 24px;
        }

        .card-top-bar {
          display: flex;
          justify-content: space-between;
          align-items: center;
          border-bottom: 1px solid var(--border-subtle);
          padding-bottom: 14px;
          flex-wrap: wrap;
          gap: 12px;
        }

        .title-row {
          display: flex;
          align-items: center;
          gap: 12px;
        }

        .card-icon {
          width: 38px;
          height: 38px;
          background: var(--bg-inset);
          box-shadow: var(--shadow-inset-sm);
          border-radius: var(--radius-md);
          border: 1px solid var(--border-subtle);
          display: flex;
          align-items: center;
          justify-content: center;
        }

        .card-controls-right {
          display: flex;
          align-items: center;
          gap: 12px;
        }

        .metric-current {
          font-size: 13px;
        }

        .horizons-container {
          display: flex;
          flex-direction: column;
        }

        .horizon-section-header {
          font-size: 10px;
          margin-bottom: 4px;
        }

        .horizons-grid {
          display: grid;
          grid-template-columns: repeat(5, 1fr);
          gap: 12px;
        }

        .horizon-neo-box {
          padding: 12px 14px;
          display: flex;
          flex-direction: column;
          justify-content: space-between;
          gap: 6px;
        }

        .horizon-extended {
          background: var(--bg-card);
          border-style: dashed;
        }

        .horizon-header {
          display: flex;
          align-items: center;
          justify-content: space-between;
          width: 100%;
        }

        .horizon-label {
          font-size: 10px;
          letter-spacing: 0.05em;
          font-weight: 700;
        }

        .horizon-val-row {
          display: flex;
          justify-content: space-between;
          align-items: center;
        }

        .badge-tag {
          font-size: 8px;
          font-weight: 800;
          padding: 1px 4px;
          border-radius: 3px;
          line-height: 1;
        }

        .tag-ml {
          background: rgba(59, 130, 246, 0.12);
          color: var(--accent);
          border: 1px solid rgba(59, 130, 246, 0.3);
        }

        .tag-ext {
          background: rgba(245, 158, 11, 0.12);
          color: var(--status-warning, #f59e0b);
          border: 1px solid rgba(245, 158, 11, 0.3);
        }

        .horizon-value {
          font-size: 16px;
        }

        .trend-badge {
          display: flex;
          align-items: center;
          gap: 3px;
          padding: 2px 6px;
          border-radius: var(--radius-sm);
          background: var(--bg-inset);
          font-size: 10px;
          border: 1px solid var(--border-subtle);
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

        .forecast-skeleton-grid {
          display: flex;
          flex-direction: column;
          gap: 16px;
        }

        .skeleton-card {
          height: 120px;
          border-radius: var(--radius-lg);
          animation: pulse-subtle 1.8s infinite ease-in-out;
        }

        .forecast-error-box {
          padding: 32px 20px;
          text-align: center;
          color: var(--text-secondary);
          font-size: 12px;
          border-radius: var(--radius-lg);
        }

        .border-bottom {
          border-bottom: 1px solid var(--border-subtle);
        }
        .padding-bottom-sm {
          padding-bottom: 10px;
        }

        .bg-accent { background: var(--accent); }
        .bg-info { background: var(--status-info); }
        .bg-warning { background: var(--status-warning); }
        .bg-critical { background: var(--status-critical); }

        .text-accent { color: var(--accent); }
        .text-secondary { color: var(--text-secondary); }
        .text-tertiary { color: var(--text-tertiary); }
        .text-primary { color: var(--text-primary); }
        .text-warning { color: var(--status-warning, #f59e0b); }
        .text-healthy { color: var(--status-healthy, #10b981); }

        .spin {
          animation: spin 1s linear infinite;
        }

        @keyframes spin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }

        @media (max-width: 1200px) {
          .charts-grid {
            grid-template-columns: 1fr;
          }
          .specs-grid {
            grid-template-columns: repeat(2, 1fr);
          }
        }

        @media (max-width: 900px) {
          .horizons-grid {
            grid-template-columns: repeat(3, 1fr);
          }
        }

        @media (max-width: 600px) {
          .horizons-grid {
            grid-template-columns: repeat(2, 1fr);
          }
          .specs-grid {
            grid-template-columns: 1fr;
          }
        }
      `}</style>
    </div>
  );
}

export default ForecastsPage;
