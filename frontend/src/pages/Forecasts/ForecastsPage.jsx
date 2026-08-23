import React, { useEffect, useState } from 'react';
import PageHeader from '../../components/common/PageHeader';
import OfflineBanner from '../../components/common/OfflineBanner';
import { getForecast } from '../../services/intelligence';
import { formatNumber } from '../../utils/formatters';
import { useTimezone } from '../../context/TimezoneContext';
import { TrendingUp, Cpu, Activity, Zap, ShieldCheck } from 'lucide-react';

export function ForecastsPage({ isOffline, lastUpdated, refetch }) {
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
        const res = await getForecast();
        if (!isCancelled) {
          setForecastData(res);
        }
      } catch (err) {
        if (!isCancelled) {
          setErrorMsg('Intelligence models unavailable.');
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
  }, [lastUpdated]);

  const renderMetricForecastCard = (title, keyName, icon, unitStr = '%', isDecimal = false) => {
    const IconComponent = icon;
    const obj = forecastData?.[keyName];
    const predictions = obj?.predictions || {};
    const horizons = ['5m', '15m', '30m', '1h', '3h'];
    const currentVal = obj?.current != null
      ? (isDecimal ? formatNumber(obj.current, 2) : `${formatNumber(obj.current, 1)}${unitStr}`)
      : '—';
    const strategyName = (obj?.strategy || 'persistence').toUpperCase();

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

        <div className="horizons-grid font-mono margin-top-md">
          {horizons.map((h) => {
            const rawVal = predictions[h];
            const displayVal = rawVal != null
              ? (isDecimal ? formatNumber(rawVal, 2) : `${formatNumber(rawVal, 1)}${unitStr}`)
              : '—';

            return (
              <div key={h} className="horizon-neo-box">
                <span className="horizon-label text-tertiary">+{h} HORIZON</span>
                <span className="horizon-value text-primary font-bold">{displayVal}</span>
              </div>
            );
          })}
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
        <span className="editorial-tag">01 / PREDICTIVE METRIC TRAJECTORIES</span>
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
            <span><strong>Multi-Horizon Embargo:</strong> Predictions are generated across +5m, +15m, +30m, +1h, and +3h operational windows without target leakage.</span>
          </div>
        </div>
      </section>

      <style>{`
        .margin-top-md { margin-top: 20px; }
        .margin-top-sm { margin-top: 12px; }
        .margin-bottom-sm { margin-bottom: 12px; }
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

        .horizons-grid {
          display: grid;
          grid-template-columns: repeat(5, 1fr);
          gap: 14px;
        }

        .horizon-neo-box {
          background: var(--bg-inset);
          box-shadow: var(--shadow-inset-sm);
          border: 1px solid var(--border-subtle);
          border-radius: var(--radius-md);
          padding: 14px 10px;
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 6px;
        }

        .horizon-label {
          font-size: 9px;
          letter-spacing: 0.08em;
        }

        .horizon-value {
          font-size: 16px;
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

        @media (max-width: 768px) {
          .horizons-grid {
            grid-template-columns: repeat(2, 1fr);
          }
        }
      `}</style>
    </div>
  );
}

export default ForecastsPage;
