import React, { useEffect, useState } from 'react';
import PageHeader from '../../components/common/PageHeader';
import OfflineBanner from '../../components/common/OfflineBanner';
import { getAnomaly } from '../../services/intelligence';
import { formatNumber } from '../../utils/formatters';
import { useTimezone } from '../../context/TimezoneContext';
import { ShieldAlert, AlertCircle, CheckCircle2, Sliders, Activity } from 'lucide-react';

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

  const formattedGeneratedAt = anomalyData?.generated_at
    ? formatTimestamp(new Date(anomalyData.generated_at).getTime() / 1000, true, false)
    : 'N/A';

  const isAnomaly = anomalyData?.is_anomaly ?? false;
  const severity = anomalyData?.severity || 'NORMAL';
  const score = anomalyData?.anomaly_score != null ? formatNumber(anomalyData.anomaly_score, 4) : '—';
  const featuresCount = anomalyData?.features_evaluated ?? 11;

  let severityPillClass = 'pill-healthy';
  if (severity === 'CRITICAL' || severity === 'HIGH') {
    severityPillClass = 'pill-critical';
  } else if (severity === 'WARNING' || severity === 'ELEVATED') {
    severityPillClass = 'pill-warning';
  }

  return (
    <div className="anomalies-page font-sans">
      <PageHeader
        index="04"
        title="ANOMALY DETECTION"
        subtitle="Unsupervised outlier identification in multi-dimensional server telemetry."
        tag="SECURITY & HEALTH OBSERVABILITY"
      />

      {isOffline && <OfflineBanner onRetry={refetch} />}

      {/* ANOMALY HERO CARD */}
      <section className="neo-card neo-card-raised anomaly-hero-card font-mono margin-top-md margin-bottom-lg">
        <div className="hero-top-row border-bottom padding-bottom-sm">
          <div className="hero-title-group">
            <div className="anomaly-icon-box">
              <ShieldAlert size={20} className={isAnomaly ? 'text-critical' : 'text-accent'} />
            </div>
            <div>
              <span className="editorial-tag">01 / LIVE ANOMALY EVALUATION ENGINE</span>
              <div className="hero-sub font-mono text-xs text-tertiary">
                EVALUATION SCOPE: <strong className="text-accent">UBUNTU PRIMARY NODE (100.108.160.2)</strong>
              </div>
            </div>
          </div>

          <div className="hero-time text-xs text-tertiary">
            EVALUATED AT: <strong className="text-primary">{formattedGeneratedAt}</strong>
          </div>
        </div>

        {loading ? (
          <div className="anomaly-skeleton font-mono margin-top-md">
            <div className="skeleton-line neo-card-inset" />
            <div className="skeleton-line neo-card-inset" />
          </div>
        ) : errorMsg ? (
          <div className="neo-card-inset anomaly-error-box font-mono margin-top-md">
            <span>{errorMsg}</span>
          </div>
        ) : (
          <div className="anomaly-metrics-grid font-mono margin-top-md">
            <div className="neo-card-inset anomaly-metric-box">
              <span className="box-label text-tertiary">SYSTEM STATUS</span>
              <div className="box-val-row margin-top-xs">
                {isAnomaly ? <AlertCircle size={18} className="text-critical" /> : <CheckCircle2 size={18} className="text-healthy" />}
                <span className={`box-value font-bold ${isAnomaly ? 'text-critical' : 'text-healthy'}`}>
                  {isAnomaly ? 'ANOMALY DETECTED' : 'NORMAL / NOMINAL'}
                </span>
              </div>
            </div>

            <div className="neo-card-inset anomaly-metric-box">
              <span className="box-label text-tertiary">SEVERITY LEVEL</span>
              <div className="margin-top-xs">
                <span className={`editorial-pill ${severityPillClass}`}>
                  {severity}
                </span>
              </div>
            </div>

            <div className="neo-card-inset anomaly-metric-box">
              <span className="box-label text-tertiary">OUTLIER SCORE</span>
              <div className="neo-metric-num margin-top-xs">
                {score}
              </div>
            </div>

            <div className="neo-card-inset anomaly-metric-box">
              <span className="box-label text-tertiary">FEATURES EVALUATED</span>
              <div className="neo-metric-num margin-top-xs">
                {featuresCount}
              </div>
            </div>
          </div>
        )}
      </section>

      {/* EVALUATION SPECIFICATIONS */}
      <section className="neo-card-dashed font-mono">
        <div className="specs-header border-bottom padding-bottom-sm">
          <span className="editorial-tag font-bold">02 / PIPELINE SPECIFICATIONS & SCORE DIRECTION</span>
        </div>

        <div className="specs-grid margin-top-md">
          <div className="neo-card-inset spec-card">
            <span className="spec-card-title text-tertiary">MODEL ALGORITHM</span>
            <span className="spec-card-body text-primary font-bold">Isolation Forest (iForest)</span>
            <p className="spec-desc text-secondary">Unsupervised partition trees isolating multivariate statistical outliers in server metrics.</p>
          </div>

          <div className="neo-card-inset spec-card">
            <span className="spec-card-title text-tertiary">EVALUATION SCOPE</span>
            <span className="spec-card-body text-accent font-bold">Ubuntu Primary Host</span>
            <p className="spec-desc text-secondary">Anomaly scoring model evaluates 11 telemetry features from the primary <code>ubuntu</code> instance.</p>
          </div>

          <div className="neo-card-inset spec-card">
            <span className="spec-card-title text-tertiary">SEVERITY THRESHOLDS</span>
            <span className="spec-card-body text-primary font-bold">Training Score Quantiles</span>
            <p className="spec-desc text-secondary">Derived from training score distribution (q85, q95, q98, q99.5 percentiles).</p>
          </div>
        </div>
      </section>

      <style>{`
        .margin-top-xs { margin-top: 6px; }
        .margin-top-md { margin-top: 20px; }
        .margin-bottom-lg { margin-bottom: 28px; }

        .anomaly-hero-card {
          padding: 24px;
        }

        .hero-top-row {
          display: flex;
          justify-content: space-between;
          align-items: center;
          gap: 16px;
          flex-wrap: wrap;
        }

        .hero-title-group {
          display: flex;
          align-items: center;
          gap: 12px;
        }

        .anomaly-icon-box {
          width: 40px;
          height: 40px;
          background: var(--bg-inset);
          box-shadow: var(--shadow-inset-sm);
          border-radius: var(--radius-md);
          border: 1px solid var(--border-subtle);
          display: flex;
          align-items: center;
          justify-content: center;
        }

        .anomaly-metrics-grid {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
          gap: 16px;
        }

        .anomaly-metric-box {
          padding: 16px 18px;
          border-radius: var(--radius-md);
        }

        .box-val-row {
          display: flex;
          align-items: center;
          gap: 8px;
        }

        .box-label {
          font-size: 10px;
          letter-spacing: 0.08em;
        }

        .anomaly-skeleton {
          display: flex;
          flex-direction: column;
          gap: 12px;
        }

        .skeleton-line {
          height: 32px;
          border-radius: var(--radius-md);
          animation: pulse-subtle 1.8s infinite ease-in-out;
        }

        .anomaly-error-box {
          padding: 32px 20px;
          text-align: center;
          color: var(--text-secondary);
          font-size: 12px;
          border-radius: var(--radius-md);
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
          font-size: 13px;
        }

        .spec-desc {
          font-size: 11px;
          line-height: 1.4;
          margin-top: 4px;
        }

        .border-bottom { border-bottom: 1px solid var(--border-subtle); }
        .padding-bottom-sm { padding-bottom: 10px; }

        .text-accent { color: var(--accent); }
        .text-critical { color: var(--status-critical); }
        .text-healthy { color: var(--status-healthy); }
        .text-tertiary { color: var(--text-tertiary); }
        .text-secondary { color: var(--text-secondary); }
        .text-primary { color: var(--text-primary); }
      `}</style>
    </div>
  );
}

export default AnomaliesPage;
