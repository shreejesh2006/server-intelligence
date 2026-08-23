import React, { useEffect, useState } from 'react';
import PageHeader from '../../components/common/PageHeader';
import OfflineBanner from '../../components/common/OfflineBanner';
import { getForecast } from '../../services/intelligence';
import { formatNumber } from '../../utils/formatters';
import { useTimezone } from '../../context/TimezoneContext';

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
          const status = err?.response?.status;
          if (status === 503) {
            setErrorMsg('Intelligence models unavailable.');
          } else {
            setErrorMsg('Intelligence models unavailable.');
          }
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

  const renderMetricForecastCard = (title, keyName, unitStr = '%', isDecimal = false) => {
    const obj = forecastData?.[keyName];
    const predictions = obj?.predictions || {};
    const horizons = ['5m', '15m', '30m', '1h', '3h'];
    const currentVal = obj?.current != null
      ? (isDecimal ? formatNumber(obj.current, 2) : `${formatNumber(obj.current, 1)}${unitStr}`)
      : '—';
    const strategyName = (obj?.strategy || 'persistence').toUpperCase();

    return (
      <div className="forecast-metric-card font-mono">
        <div className="card-top-bar">
          <div>
            <span className="editorial-tag">{title}</span>
            <div className="metric-current-display">
              <span className="current-label text-tertiary">CURRENT: </span>
              <span className="current-val text-primary font-bold">{currentVal}</span>
            </div>
          </div>
          <div className="strategy-pill font-mono">
            <span className="pill-label text-tertiary">STRATEGY: </span>
            <span className="pill-val text-primary font-semibold">{strategyName}</span>
          </div>
        </div>

        <div className="horizons-grid font-mono">
          {horizons.map((h) => {
            const rawVal = predictions[h];
            const displayVal = rawVal != null
              ? (isDecimal ? formatNumber(rawVal, 2) : `${formatNumber(rawVal, 1)}${unitStr}`)
              : '—';

            return (
              <div key={h} className="horizon-box">
                <span className="horizon-label text-tertiary">+{h}</span>
                <span className="horizon-value text-primary font-semibold">{displayVal}</span>
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
    <div className="forecasts-page">
      <PageHeader
        index="03"
        title="CAPACITY FORECASTS"
        subtitle="Multi-step predictive modeling for CPU, Memory, and Load saturation risks."
        tag="PREDICTIVE INTELLIGENCE"
      />

      {isOffline && <OfflineBanner onRetry={refetch} />}

      {/* METADATA STRIP */}
      <section className="forecast-meta-hero font-mono">
        <div className="hero-meta-row">
          <div className="hero-meta-item">
            <span className="meta-label">LAST GENERATED:</span>
            <span className="meta-val">{formattedGeneratedAt}</span>
          </div>
          <div className="hero-meta-item">
            <span className="meta-label">MODEL EVALUATION SCOPE:</span>
            <span className="meta-val text-accent">PRIMARY HOST (UBUNTU 100.108.160.2)</span>
          </div>
          <div className="hero-meta-item">
            <span className="meta-label">EVALUATION ENGINE:</span>
            <span className="meta-val">CHRONOLOGICAL EMBARGOED PIPELINE</span>
          </div>
          <div className="hero-meta-item">
            <span className="meta-label">REFRESH CYCLE:</span>
            <span className="meta-val">30s TTL IN-MEMORY CACHE</span>
          </div>
        </div>
      </section>

      {/* FORECAST CARDS */}
      <div className="section-label-strip font-mono margin-top-lg">
        <span className="editorial-tag">01 / PREDICTIVE METRIC TRAJECTORIES</span>
      </div>

      {loading ? (
        <div className="forecast-skeleton-grid font-mono">
          <div className="skeleton-card" />
          <div className="skeleton-card" />
          <div className="skeleton-card" />
        </div>
      ) : errorMsg ? (
        <div className="forecast-error-box font-mono">
          <span>{errorMsg}</span>
        </div>
      ) : (
        <div className="forecast-cards-container">
          {renderMetricForecastCard('CPU UTILIZATION FORECAST', 'cpu', '%', false)}
          {renderMetricForecastCard('MEMORY USAGE FORECAST', 'memory', '%', false)}
          {renderMetricForecastCard('SYSTEM LOAD 1M FORECAST', 'load_1m', '', true)}
        </div>
      )}

      {/* PREDICTIVE PIPELINE SPECIFICATIONS */}
      <section className="pipeline-specs-section font-mono margin-top-lg">
        <div className="section-top-border">
          <span className="editorial-tag font-bold">02 / MODEL EVALUATION POLICY & SCOPE</span>
        </div>
        <div className="specs-list">
          <div className="spec-item">
            <span className="spec-bullet">—</span>
            <span><strong>Host Evaluation Scope:</strong> Capacity forecasting models are trained on telemetry from the primary <code>ubuntu</code> server instance.</span>
          </div>
          <div className="spec-item">
            <span className="spec-bullet">—</span>
            <span><strong>Model vs Persistence Selection:</strong> Machine Learning model is deployed ONLY when validation MAE strictly improves upon persistence baseline.</span>
          </div>
          <div className="spec-item">
            <span className="spec-bullet">—</span>
            <span><strong>Chronological Validation:</strong> Time-series data is split sequentially with a strict horizon embargo preventing target leakage.</span>
          </div>
          <div className="spec-item">
            <span className="spec-bullet">—</span>
            <span><strong>Multi-Horizon Range:</strong> Continuous predictions evaluated across +5m, +15m, +30m, +1h, and +3h operational windows.</span>
          </div>
        </div>
      </section>

      <style>{`
        .margin-top-lg {
          margin-top: 28px;
        }

        .forecast-meta-hero {
          background-color: var(--bg-surface);
          border: 1px solid var(--border-strong);
          padding: 16px 20px;
          margin-bottom: 24px;
        }

        .hero-meta-row {
          display: flex;
          gap: 28px;
          flex-wrap: wrap;
        }

        .hero-meta-item {
          display: flex;
          gap: 8px;
          font-size: 11px;
          letter-spacing: 0.05em;
        }

        .meta-label {
          color: var(--text-tertiary);
        }

        .meta-val {
          color: var(--text-primary);
          font-weight: 600;
        }

        .text-accent {
          color: var(--accent);
        }

        .forecast-skeleton-grid {
          display: flex;
          flex-direction: column;
          gap: 16px;
        }

        .skeleton-card {
          height: 120px;
          background: var(--bg-surface);
          border: 1px solid var(--border-strong);
          animation: pulse-subtle 1.8s infinite ease-in-out;
        }

        @keyframes pulse-subtle {
          0%, 100% { opacity: 0.5; }
          50% { opacity: 0.9; }
        }

        .forecast-error-box {
          padding: 32px 20px;
          text-align: center;
          background: var(--bg-surface);
          border: 1px solid var(--border-strong);
          color: var(--text-secondary);
          font-size: 12px;
          letter-spacing: 0.05em;
        }

        .forecast-cards-container {
          display: flex;
          flex-direction: column;
          gap: 20px;
        }

        .forecast-metric-card {
          background-color: var(--bg-surface);
          border: 1px solid var(--border-strong);
          padding: 20px;
          display: flex;
          flex-direction: column;
          gap: 16px;
        }

        .card-top-bar {
          display: flex;
          justify-content: space-between;
          align-items: center;
          border-bottom: 1px solid var(--border-subtle);
          padding-bottom: 12px;
          flex-wrap: wrap;
          gap: 12px;
        }

        .metric-current-display {
          font-size: 12px;
          margin-top: 4px;
        }

        .strategy-pill {
          background: var(--bg-main);
          border: 1px solid var(--border-subtle);
          padding: 4px 10px;
          font-size: 10px;
          letter-spacing: 0.05em;
        }

        .horizons-grid {
          display: grid;
          grid-template-columns: repeat(5, 1fr);
          gap: 12px;
        }

        .horizon-box {
          background: var(--bg-main);
          border: 1px solid var(--border-subtle);
          padding: 12px 10px;
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 6px;
        }

        .horizon-label {
          font-size: 10px;
          letter-spacing: 0.08em;
        }

        .horizon-value {
          font-size: 15px;
          letter-spacing: 0.05em;
        }

        .pipeline-specs-section {
          background: var(--bg-surface);
          border: 1px solid var(--border-strong);
          padding: 20px;
        }

        .section-top-border {
          padding-bottom: 12px;
          border-bottom: 1px solid var(--border-subtle);
          margin-bottom: 14px;
        }

        .specs-list {
          display: flex;
          flex-direction: column;
          gap: 10px;
          font-size: 11px;
          line-height: 1.5;
          color: var(--text-secondary);
        }

        .spec-item {
          display: flex;
          gap: 8px;
        }

        .spec-bullet {
          color: var(--text-tertiary);
        }

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
