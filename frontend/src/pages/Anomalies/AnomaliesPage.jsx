import React, { useEffect, useState } from 'react';
import PageHeader from '../../components/common/PageHeader';
import OfflineBanner from '../../components/common/OfflineBanner';
import { getAnomaly } from '../../services/intelligence';
import { formatNumber } from '../../utils/formatters';
import { useTimezone } from '../../context/TimezoneContext';

export function AnomaliesPage({ isOffline, lastUpdated, refetch }) {
  const { formatTimestamp } = useTimezone();
  const [loading, setLoading] = useState(true);
  const [anomalyData, setAnomalyData] = useState(null);
  const [errorMsg, setErrorMsg] = useState(null);

  useEffect(() => {
    let isCancelled = false;

    async function loadData() {
      setLoading(true);
      setErrorMsg(null);

      try {
        const res = await getAnomaly();
        if (!isCancelled) {
          setAnomalyData(res);
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

  const formattedGeneratedAt = anomalyData?.generated_at
    ? formatTimestamp(new Date(anomalyData.generated_at).getTime() / 1000, true, false)
    : 'N/A';

  const isAnomaly = anomalyData?.is_anomaly ?? false;
  const severity = anomalyData?.severity || 'NORMAL';
  const score = anomalyData?.anomaly_score != null ? formatNumber(anomalyData.anomaly_score, 4) : '—';
  const featuresCount = anomalyData?.features_evaluated ?? 11;

  return (
    <div className="anomalies-page">
      <PageHeader
        index="04"
        title="ANOMALY DETECTION"
        subtitle="Unsupervised outlier identification in multi-dimensional server telemetry."
        tag="SECURITY & HEALTH OBSERVABILITY"
      />

      {isOffline && <OfflineBanner onRetry={refetch} />}

      {/* ANOMALY HERO STATUS */}
      <section className="anomaly-hero-card font-mono">
        <div className="hero-top-row">
          <span className="editorial-tag">01 / LIVE ANOMALY EVALUATION</span>
          <span className="eval-time text-tertiary">LAST EVALUATED: {formattedGeneratedAt}</span>
        </div>

        {loading ? (
          <div className="anomaly-skeleton font-mono">
            <div className="skeleton-line" />
            <div className="skeleton-line" />
          </div>
        ) : errorMsg ? (
          <div className="anomaly-error-box font-mono">
            <span>{errorMsg}</span>
          </div>
        ) : (
          <div className="anomaly-metrics-grid font-mono">
            <div className="metric-box">
              <span className="box-label text-tertiary">STATUS</span>
              <span className="box-value font-bold text-primary">
                {isAnomaly ? 'DETECTED' : 'NORMAL'}
              </span>
            </div>

            <div className="metric-box">
              <span className="box-label text-tertiary">SEVERITY</span>
              <span className="box-value font-semibold text-primary">
                {severity}
              </span>
            </div>

            <div className="metric-box">
              <span className="box-label text-tertiary">ANOMALY SCORE</span>
              <span className="box-value text-primary">
                {score}
              </span>
            </div>

            <div className="metric-box">
              <span className="box-label text-tertiary">FEATURES EVALUATED</span>
              <span className="box-value text-primary">
                {featuresCount}
              </span>
            </div>
          </div>
        )}
      </section>

      {/* EVALUATION SPECIFICATIONS */}
      <section className="anomaly-specs-section font-mono margin-top-lg">
        <div className="section-top-border">
          <span className="editorial-tag font-bold">02 / PIPELINE SPECIFICATIONS & SCORE DIRECTION</span>
        </div>

        <div className="specs-grid">
          <div className="spec-card">
            <span className="spec-card-title text-tertiary">MODEL ALGORITHM</span>
            <span className="spec-card-body text-primary font-semibold">Isolation Forest (iForest)</span>
            <p className="spec-desc text-secondary">Unsupervised partition trees isolating multivariate statistical outliers.</p>
          </div>

          <div className="spec-card">
            <span className="spec-card-title text-tertiary">SCORE CONVENTION</span>
            <span className="spec-card-body text-primary font-semibold">Normalized Outlier Score</span>
            <p className="spec-desc text-secondary">Higher score indicates higher anomaly confidence. Positive score exceeds contamination boundary.</p>
          </div>

          <div className="spec-card">
            <span className="spec-card-title text-tertiary">SEVERITY THRESHOLDS</span>
            <span className="spec-card-body text-primary font-semibold">Training Score Quantiles</span>
            <p className="spec-desc text-secondary">Derived from training score distribution (q85, q95, q98, q99.5 percentiles).</p>
          </div>
        </div>
      </section>

      <style>{`
        .margin-top-lg {
          margin-top: 28px;
        }

        .anomaly-hero-card {
          background-color: var(--bg-surface);
          border: 1px solid var(--border-strong);
          padding: 24px;
          display: flex;
          flex-direction: column;
          gap: 20px;
        }

        .hero-top-row {
          display: flex;
          justify-content: space-between;
          align-items: center;
          border-bottom: 1px solid var(--border-subtle);
          padding-bottom: 12px;
          flex-wrap: wrap;
          gap: 12px;
        }

        .eval-time {
          font-size: 10px;
          letter-spacing: 0.05em;
        }

        .anomaly-skeleton {
          display: flex;
          flex-direction: column;
          gap: 12px;
          padding: 16px 0;
        }

        .skeleton-line {
          height: 24px;
          background: var(--bg-surface-hover);
          animation: pulse-subtle 1.8s infinite ease-in-out;
        }

        @keyframes pulse-subtle {
          0%, 100% { opacity: 0.5; }
          50% { opacity: 0.9; }
        }

        .anomaly-error-box {
          padding: 32px 20px;
          text-align: center;
          background: var(--bg-main);
          border: 1px solid var(--border-subtle);
          color: var(--text-secondary);
          font-size: 12px;
          letter-spacing: 0.05em;
        }

        .anomaly-metrics-grid {
          display: grid;
          grid-template-columns: repeat(4, 1fr);
          gap: 16px;
        }

        .metric-box {
          background: var(--bg-main);
          border: 1px solid var(--border-subtle);
          padding: 16px 14px;
          display: flex;
          flex-direction: column;
          gap: 8px;
        }

        .box-label {
          font-size: 10px;
          letter-spacing: 0.08em;
        }

        .box-value {
          font-size: 16px;
          letter-spacing: 0.05em;
        }

        .anomaly-specs-section {
          background: var(--bg-surface);
          border: 1px solid var(--border-strong);
          padding: 24px;
        }

        .section-top-border {
          padding-bottom: 12px;
          border-bottom: 1px solid var(--border-subtle);
          margin-bottom: 16px;
        }

        .specs-grid {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(260px, 1fr));
          gap: 16px;
        }

        .spec-card {
          background: var(--bg-main);
          border: 1px solid var(--border-subtle);
          padding: 16px;
          display: flex;
          flex-direction: column;
          gap: 6px;
        }

        .spec-card-title {
          font-size: 10px;
          letter-spacing: 0.08em;
        }

        .spec-card-body {
          font-size: 13px;
          letter-spacing: 0.05em;
        }

        .spec-desc {
          font-size: 11px;
          line-height: 1.4;
          margin-top: 4px;
        }

        @media (max-width: 768px) {
          .anomaly-metrics-grid {
            grid-template-columns: repeat(2, 1fr);
          }
        }
      `}</style>
    </div>
  );
}

export default AnomaliesPage;
