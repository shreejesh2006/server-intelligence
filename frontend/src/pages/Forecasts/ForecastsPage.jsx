import React, { useEffect, useState } from 'react';
import PageHeader from '../../components/common/PageHeader';
import OfflineBanner from '../../components/common/OfflineBanner';
import { getForecast } from '../../services/intelligence';
import { useServer } from '../../context/ServerContext';
import { formatNumber } from '../../utils/formatters';
import { useTimezone } from '../../context/TimezoneContext';
import { Cpu, Activity, Zap } from 'lucide-react';

export function ForecastsPage({ metrics, isOffline, lastUpdated, refetch }) {
  const { selectedHost } = useServer();
  const { formatTimestamp } = useTimezone();
  const [loading, setLoading] = useState(true);
  const [forecastData, setForecastData] = useState(null);
  const [errorMsg, setErrorMsg] = useState(null);

  useEffect(() => {
    let isCancelled = false;

    async function loadData() {
      setLoading(true);
      setErrorMsg(null);

      try {
        const res = await getForecast(selectedHost);
        if (!isCancelled) {
          setForecastData(res);
        }
      } catch (err) {
        if (!isCancelled) {
          setErrorMsg(err?.response?.data?.detail || 'Intelligence models unavailable.');
        }
      } finally {
        if (!isCancelled) {
          setLoading(false);
        }
      }
    }

    loadData();

    return () => {
      isCancelled = true;
    };
  }, [selectedHost, lastUpdated, refetch]);

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
      { id: '5m', isExtended: false },

      { id: '15m', isExtended: false },
      { id: '30m', isExtended: false },
      { id: '1h', isExtended: false },
      { id: '3h', isExtended: false },
    ];

    const extendedHorizons = [
      { id: '6h', factor: 0.15, isExtended: true },
      { id: '12h', factor: 0.25, isExtended: true },
      { id: '1d', factor: 0.35, isExtended: true },
      { id: '7d', factor: 0.40, isExtended: true },
      { id: '1mo', factor: 0.42, isExtended: true },
    ];

    const val3h = predictions['3h'];

    const currentVal = currentNumeric != null
      ? (isDecimal ? formatNumber(currentNumeric, 2) : `${formatNumber(currentNumeric, 1)}${unitStr}`)
      : '—';
    const strategyName = (obj?.strategy || 'persistence').toUpperCase();

    const isPercentage = unitStr === '%';

    return (
      <div className="neo-card forecast-card font-mono">
        <div className="card-top-bar">
          <div className="title-row">
            <div className="card-icon font-mono">
              <IconComponent size={16} className="text-accent" />
            </div>
            <div>
              <span className="editorial-tag">{title}</span>
              <div className="metric-current font-bold text-primary">
                CURRENT: <span className="text-accent">{currentVal}</span>
              </div>
            </div>
          </div>
          <div className="editorial-pill pill-neutral font-mono">
            STRATEGY: <span className="text-accent font-bold">{strategyName}</span>
          </div>
        </div>

        <div className="horizons-container margin-top-md">
          {/* REAL ML HORIZONS GRID */}
          <div className="horizon-section-header">
            <span className="editorial-tag text-tertiary">REAL ML TRAJECTORIES (5M – 3H)</span>
          </div>
          <div className="horizons-grid font-mono margin-top-xs margin-bottom-md">
            {realHorizons.map((hObj) => {
              const rawVal = predictions[hObj.id];
              const displayVal = rawVal != null
                ? (isDecimal ? formatNumber(rawVal, 2) : `${formatNumber(rawVal, 1)}${unitStr}`)
                : '—';

              return (
                <div key={hObj.id} className="horizon-neo-box">
                  <div className="horizon-header">
                    <span className="horizon-label text-tertiary">+{hObj.id}</span>
                    <span className="badge-tag tag-ml">ML</span>
                  </div>
                  <span className="horizon-value text-primary font-bold">{displayVal}</span>
                </div>
              );
            })}
          </div>

          {/* EXTENDED DEMO PROJECTIONS GRID */}
          <div className="horizon-section-header">
            <span className="editorial-tag text-tertiary">DEMO EXTENDED PROJECTIONS (6H – 1MO)</span>
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

              return (
                <div key={hObj.id} className="horizon-neo-box horizon-extended">
                  <div className="horizon-header">
                    <span className="horizon-label text-tertiary">+{hObj.id}</span>
                    <span className="badge-tag tag-ext">EXTENDED</span>
                  </div>
                  <span className="horizon-value text-primary font-bold">{displayVal}</span>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    );
  };

  const formattedGeneratedAt = forecastData?.generated_at
    ? formatTimestamp(new Date(forecastData.generated_at).getTime() / 1000, true, false)
    : 'N/A';

  return (
    <div className="forecasts-page font-sans">
      <PageHeader
        index="03"
        title="CAPACITY FORECASTS"
        subtitle="Multi-horizon predictive modeling for CPU, Memory, and Load saturation risks."
        tag="PREDICTIVE INTELLIGENCE"
      />

      {isOffline && <OfflineBanner onRetry={refetch} />}

      {/* METADATA HERO STRIP */}
      <section className="neo-card hero-meta-card font-mono margin-top-md margin-bottom-lg">
        <div className="hero-meta-grid">
          <div className="meta-item">
            <span className="meta-label text-tertiary">LAST GENERATED:</span>
            <span className="meta-val text-primary font-bold">{formattedGeneratedAt}</span>
          </div>
          <div className="meta-item">
            <span className="meta-label text-tertiary">MODEL EVALUATION SCOPE:</span>
            <span className="meta-val text-accent font-bold">PRIMARY HOST (UBUNTU 100.108.160.2)</span>
          </div>
          <div className="meta-item">
            <span className="meta-label text-tertiary">EVALUATION PIPELINE:</span>
            <span className="meta-val text-secondary">CHRONOLOGICAL EMBARGOED MAE</span>
          </div>
        </div>
      </section>

      {/* FORECAST CARDS */}
      <div className="section-label-strip font-mono margin-bottom-sm">
        <span className="editorial-tag">01 / PREDICTIVE METRIC TRAJECTORIES (10 HORIZONS)</span>
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
          {renderMetricForecastCard('CPU UTILIZATION FORECAST', 'cpu', Cpu, '%', false)}
          {renderMetricForecastCard('MEMORY USAGE FORECAST', 'memory', Activity, '%', false)}
          {renderMetricForecastCard('SYSTEM LOAD 1M FORECAST', 'load_1m', Zap, '', true)}
        </div>
      )}

      {/* MODEL POLICY SPECIFICATIONS */}
      <section className="neo-card-dashed font-mono">
        <div className="specs-header border-bottom padding-bottom-sm">
          <span className="editorial-tag font-bold">02 / MODEL EVALUATION POLICY & SCOPE</span>
        </div>
        <div className="specs-list margin-top-sm">
          <div className="spec-row">
            <span className="spec-bullet text-accent">&bull;</span>
            <span><strong>Model Scope Notice:</strong> Machine Learning capacity models are trained on telemetry from the primary <code>ubuntu</code> server instance.</span>
          </div>
          <div className="spec-row">
            <span className="spec-bullet text-accent">&bull;</span>
            <span><strong>Model vs Persistence Baseline:</strong> ML forecasting pipeline is deployed ONLY when validation MAE strictly outperforms the persistence baseline.</span>
          </div>
          <div className="spec-row">
            <span className="spec-bullet text-accent">&bull;</span>
            <span><strong>Real ML Horizons (5m–3h):</strong> Predictions across +5m, +15m, +30m, +1h, and +3h operational windows are generated directly by host-aware ML inference without target leakage.</span>
          </div>
          <div className="spec-row">
            <span className="spec-bullet text-accent">&bull;</span>
            <span><strong>Demo Extended Projections (6h–1mo):</strong> Horizons beyond +3h (+6h, +12h, +1d, +7d, +1mo) are demo extended projections derived from recent trend trajectory and +3h model outputs. This is a temporary visual extension that can later be replaced with independently trained long-horizon models.</span>
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

        .hero-meta-card {
          padding: 18px 24px;
        }

        .hero-meta-grid {
          display: flex;
          gap: 32px;
          flex-wrap: wrap;
        }

        .meta-item {
          display: flex;
          gap: 8px;
          font-size: 11px;
        }

        .forecast-cards-container {
          display: flex;
          flex-direction: column;
          gap: 20px;
        }

        .forecast-card {
          padding: 24px;
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
          width: 36px;
          height: 36px;
          background: var(--bg-inset);
          box-shadow: var(--shadow-inset-sm);
          border-radius: var(--radius-md);
          border: 1px solid var(--border-subtle);
          display: flex;
          align-items: center;
          justify-content: center;
        }

        .metric-current {
          font-size: 13px;
          margin-top: 2px;
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
          background: var(--bg-inset);
          box-shadow: var(--shadow-inset-sm);
          border: 1px solid var(--border-subtle);
          border-radius: var(--radius-md);
          padding: 12px 10px;
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 4px;
          position: relative;
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
          font-size: 15px;
          margin-top: 2px;
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

        .specs-list {
          display: flex;
          flex-direction: column;
          gap: 10px;
          font-size: 11px;
          color: var(--text-secondary);
          line-height: 1.5;
        }

        .spec-row {
          display: flex;
          gap: 8px;
        }

        .border-bottom {
          border-bottom: 1px solid var(--border-subtle);
        }
        .padding-bottom-sm {
          padding-bottom: 10px;
        }

        .text-accent { color: var(--accent); }
        .text-secondary { color: var(--text-secondary); }
        .text-tertiary { color: var(--text-tertiary); }
        .text-primary { color: var(--text-primary); }

        @media (max-width: 900px) {
          .horizons-grid {
            grid-template-columns: repeat(3, 1fr);
          }
        }

        @media (max-width: 600px) {
          .horizons-grid {
            grid-template-columns: repeat(2, 1fr);
          }
        }
      `}</style>
    </div>
  );
}

export default ForecastsPage;
