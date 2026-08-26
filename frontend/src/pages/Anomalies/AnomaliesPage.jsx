import React, { useEffect, useState, useCallback } from 'react';
import PageHeader from '../../components/common/PageHeader';
import OfflineBanner from '../../components/common/OfflineBanner';
import { useServer } from '../../context/ServerContext';
import { useTimezone } from '../../context/TimezoneContext';
import { getAnomaly, getAnomalyHistory } from '../../services/intelligence';
import { formatNumber } from '../../utils/formatters';
import {
  ShieldAlert,
  CheckCircle2,
  RefreshCw,
  Server,
  Clock,
  HelpCircle,
  ListChecks,
  AlertCircle,
} from 'lucide-react';


export function AnomaliesPage({ isOffline, lastUpdated, refetch }) {
  const { selectedHost, selectServer } = useServer();
  const { formatTimestamp } = useTimezone();

  const [loading, setLoading] = useState(true);
  const [anomalyData, setAnomalyData] = useState(null);
  const [errorMsg, setErrorMsg] = useState(null);

  // Historical Timeline state
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyData, setHistoryData] = useState(null);
  const [selectedLookback, setSelectedLookback] = useState('1h');

  const LOOKBACKS = ['5m', '15m', '30m', '1h', '3h', '6h', '12h', '1d', '7d'];

  const loadCurrentAnomaly = useCallback(async () => {
    setLoading(true);
    setErrorMsg(null);
    try {
      const res = await getAnomaly(selectedHost);
      setAnomalyData(res);
    } catch (err) {
      setErrorMsg(err?.response?.data?.detail || err?.message || 'Failed to connect to anomaly detection service.');
    } finally {
      setLoading(false);
    }
  }, [selectedHost]);

  const loadHistory = useCallback(async () => {
    setHistoryLoading(true);
    try {
      const res = await getAnomalyHistory(selectedHost, selectedLookback);
      setHistoryData(res);
    } catch (err) {
      console.warn('Failed loading anomaly history:', err);
    } finally {
      setHistoryLoading(false);
    }
  }, [selectedHost, selectedLookback]);

  useEffect(() => {
    loadCurrentAnomaly();
    loadHistory();
  }, [loadCurrentAnomaly, loadHistory, lastUpdated]);

  const getSeverityBadgeClass = (sev) => {
    switch (sev) {
      case 'CRITICAL':
        return 'pill-critical';
      case 'HIGH':
        return 'pill-critical';
      case 'MEDIUM':
        return 'pill-warning';
      case 'LOW':
        return 'pill-warning';
      default:
        return 'pill-healthy';
    }
  };

  const isAnomaly = anomalyData?.is_anomaly || false;
  const severity = anomalyData?.severity || 'NORMAL';
  const modelStatus = anomalyData?.model_status || 'unavailable';
  const isModelUnavailable = modelStatus === 'unavailable' || anomalyData?.telemetry_status === 'model_unavailable';
  const isStale = anomalyData?.is_stale || false;

  const formattedTimestamp = anomalyData?.telemetry_timestamp
    ? formatTimestamp(new Date(anomalyData.telemetry_timestamp).getTime() / 1000, true, false)
    : 'N/A';

  const formattedTrainedAt = anomalyData?.model_trained_at
    ? formatTimestamp(new Date(anomalyData.model_trained_at).getTime() / 1000, true, false)
    : 'N/A';

  const modelMeta = anomalyData?.model_metadata || {};
  const contributingSignals = anomalyData?.contributing_signals || [];
  const allMetrics = anomalyData?.all_metrics_evaluated || [];
  const recommendations = anomalyData?.recommendations || [];

  return (
    <div className="anomalies-page font-sans">
      <PageHeader
        index="04"
        title="ANOMALY INTELLIGENCE"
        subtitle="Host-aware multivariate Isolation Forest anomaly detection with explainable signal attribution."
        tag="ANOMALY DETECTION ENGINE"
      />

      {isOffline && <OfflineBanner onRetry={refetch} />}

      {/* HOST SELECTOR BAR */}
      <section className="neo-card font-mono margin-top-md margin-bottom-lg">
        <div className="host-selector-bar">
          <div className="bar-left">
            <Server size={14} className="text-accent" />
            <span className="editorial-tag">TARGET NODE SCOPE:</span>
            <div className="neo-segmented-track">
              <button
                type="button"
                className={`neo-segmented-item ${selectedHost === 'ubuntu' ? 'active' : ''}`}
                onClick={() => selectServer('ubuntu')}
              >
                UBUNTU (PRIMARY)
              </button>
              <button
                type="button"
                className={`neo-segmented-item ${selectedHost === 'kali' ? 'active' : ''}`}
                onClick={() => selectServer('kali')}
              >
                KALI (TARGET VM)
              </button>
            </div>
          </div>

          <div className="bar-right">
            <span className={`editorial-pill ${isModelUnavailable ? 'pill-critical' : isStale ? 'pill-warning' : 'pill-healthy'}`}>
              MODEL: {modelStatus.toUpperCase()}
            </span>
            <button
              type="button"
              className="neo-btn-icon"
              onClick={() => {
                loadCurrentAnomaly();
                loadHistory();
              }}
              title="Refresh Evaluation"
              disabled={loading}
            >
              <RefreshCw size={14} className={loading ? 'spin' : ''} />
            </button>
          </div>
        </div>
      </section>

      {/* ERROR / UNAVAILABLE STATE BANNER */}
      {errorMsg && (
        <div className="neo-card-inset error-banner font-mono margin-bottom-lg text-critical">
          <AlertCircle size={16} />
          <span>{errorMsg}</span>
        </div>
      )}

      {/* 01 / LIVE ANOMALY STATUS */}
      <section className="neo-card neo-card-raised font-mono margin-bottom-lg">
        <div className="status-hero-grid">
          <div className="status-left">
            <div className={`status-icon-box ${isAnomaly ? 'box-critical' : 'box-healthy'}`}>
              {isAnomaly ? (
                <ShieldAlert size={28} className="text-critical" />
              ) : (
                <CheckCircle2 size={28} className="text-healthy" />
              )}
            </div>
            <div>
              <div className="status-title-row">
                <span className="status-main-title font-sans">
                  {isModelUnavailable
                    ? 'MODEL UNAVAILABLE'
                    : isAnomaly
                    ? 'ANOMALY DETECTED'
                    : 'SYSTEM NOMINAL'}
                </span>
                <span className={`editorial-pill ${getSeverityBadgeClass(severity)}`}>
                  {severity}
                </span>
              </div>
              <p className="status-sub-desc text-secondary font-sans text-xs margin-top-xs">
                {isModelUnavailable
                  ? `No trained Isolation Forest model available for host '${selectedHost.toUpperCase()}'.`
                  : isAnomaly
                  ? `Multivariate telemetry observation deviates significantly from host '${selectedHost.toUpperCase()}' baseline.`
                  : `Host '${selectedHost.toUpperCase()}' telemetry is operating within learned multivariate bounds.`}
              </p>
            </div>
          </div>

          <div className="status-right font-mono text-xs text-tertiary">
            <div className="stat-line">
              <span>ANOMALY SCORE:</span>
              <span className={`stat-value font-bold ${isAnomaly ? 'text-critical' : 'text-primary'}`}>
                {anomalyData?.anomaly_score != null ? formatNumber(anomalyData.anomaly_score, 4) : '—'}
              </span>
            </div>
            <div className="stat-line">
              <span>LAST TELEMETRY:</span>
              <span className="text-secondary">{formattedTimestamp}</span>
            </div>
            <div className="stat-line">
              <span>MODEL TRAINED:</span>
              <span className="text-secondary">{formattedTrainedAt}</span>
            </div>
          </div>
        </div>
      </section>

      {/* 02 / WHY WAS THIS FLAGGED? */}
      <section className="neo-card font-mono margin-bottom-lg">
        <div className="section-header border-bottom padding-bottom-sm">
          <span className="editorial-tag font-bold">02 / WHY WAS THIS FLAGGED? (SIGNAL ATTRIBUTION)</span>
        </div>

        <div className="margin-top-md">
          {/* PRIMARY REASON BANNER */}
          <div className="neo-card-inset primary-reason-box margin-bottom-md font-sans">
            <div className="reason-label font-mono text-tertiary text-xs margin-bottom-xs">PRIMARY REASON SUMMARY:</div>
            <p className="reason-text font-bold text-primary">
              {anomalyData?.primary_reason || 'Evaluating observation against learned host baselines...'}
            </p>
          </div>

          {/* CONTRIBUTING SIGNAL CARDS */}
          <div className="signal-cards-grid">
            {contributingSignals.map((sig) => (
              <div key={sig.metric} className={`neo-card-inset signal-card status-${sig.status.toLowerCase()}`}>
                <div className="signal-card-header font-mono">
                  <span className="sig-name font-sans font-bold text-primary">{sig.display_name}</span>
                  <span className={`editorial-pill ${getSeverityBadgeClass(sig.status)}`}>
                    {sig.status}
                  </span>
                </div>

                <div className="signal-metrics-row font-mono margin-top-xs">
                  <div className="sig-metric-item">
                    <span className="text-tertiary text-xs">CURRENT</span>
                    <span className="sig-val text-primary font-bold">{formatNumber(sig.current_value, 2)}{sig.unit}</span>
                  </div>
                  <div className="sig-metric-item">
                    <span className="text-tertiary text-xs">BASELINE</span>
                    <span className="sig-val text-secondary">{formatNumber(sig.baseline_value, 2)}{sig.unit}</span>
                  </div>
                  <div className="sig-metric-item">
                    <span className="text-tertiary text-xs">DEVIATION</span>
                    <span className="sig-val text-accent font-bold">
                      {sig.deviation_percent != null ? `+${sig.deviation_percent}%` : `+${sig.absolute_deviation}`}
                    </span>
                  </div>
                </div>

                <p className="signal-reason font-sans text-xs text-secondary margin-top-xs">
                  {sig.reason}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* 03 / TELEMETRY DEVIATION BREAKDOWN */}
      <section className="neo-card font-mono margin-bottom-lg">
        <div className="section-header border-bottom padding-bottom-sm">
          <span className="editorial-tag font-bold">03 / TELEMETRY DEVIATION BREAKDOWN (11 FEATURES)</span>
        </div>

        <div className="table-responsive margin-top-md">
          <table className="neo-table font-mono">
            <thead>
              <tr>
                <th>METRIC SIGNAL</th>
                <th>CURRENT VALUE</th>
                <th>LEARNED BASELINE</th>
                <th>ABS DEVIATION</th>
                <th>SCALED DIFF</th>
                <th>PERCENT DEV</th>
                <th>STATUS</th>
              </tr>
            </thead>
            <tbody>
              {allMetrics.map((m) => (
                <tr key={m.metric}>
                  <td className="font-bold text-primary">{m.display_name}</td>
                  <td className="text-accent font-bold">{formatNumber(m.current_value, 2)} {m.unit}</td>
                  <td className="text-secondary">{formatNumber(m.baseline_value, 2)} {m.unit}</td>
                  <td className="text-primary">{formatNumber(m.absolute_deviation, 2)}</td>
                  <td className="text-secondary">+{formatNumber(m.scaled_deviation, 2)}σ</td>
                  <td className="text-tertiary">
                    {m.deviation_percent != null ? `+${formatNumber(m.deviation_percent, 1)}%` : 'N/A (near-zero)'}
                  </td>
                  <td>
                    <span className={`editorial-pill ${getSeverityBadgeClass(m.status)}`}>
                      {m.status}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {/* 04 / ANOMALY TIMELINE */}
      <section className="neo-card font-mono margin-bottom-lg">
        <div className="timeline-header-bar border-bottom padding-bottom-sm">
          <span className="editorial-tag font-bold">04 / HISTORICAL ANOMALY TIMELINE</span>
          <div className="lookback-selector">
            <Clock size={12} className="text-tertiary" />
            <span className="text-tertiary text-xs">RANGE:</span>
            {LOOKBACKS.map((lb) => (
              <button
                key={lb}
                type="button"
                className={`neo-btn-sm ${selectedLookback === lb ? 'active' : ''}`}
                onClick={() => setSelectedLookback(lb)}
              >
                {lb.toUpperCase()}
              </button>
            ))}
          </div>
        </div>

        <div className="margin-top-md">
          {historyLoading ? (
            <div className="neo-card-inset empty-timeline-box text-center font-mono">
              <RefreshCw size={24} className="spin text-accent margin-bottom-xs" />
              <p className="text-secondary text-xs">Scoring historical VictoriaMetrics telemetry range ({selectedLookback})...</p>
            </div>
          ) : historyData?.telemetry_status === 'insufficient_history' ? (
            <div className="neo-card-inset empty-timeline-box text-center font-mono">
              <HelpCircle size={24} className="text-tertiary margin-bottom-xs" />
              <p className="text-primary font-bold text-sm">INSUFFICIENT HISTORICAL TELEMETRY</p>
              <p className="text-secondary text-xs margin-top-xs">
                Host '{selectedHost}' does not have enough continuous telemetry points recorded for window '{selectedLookback}'.
              </p>
            </div>
          ) : historyData?.points && historyData.points.length > 0 ? (
            <div className="timeline-points-container font-mono">
              <div className="points-summary-row text-xs text-tertiary margin-bottom-xs">
                <span>EVALUATED POINTS: <strong className="text-primary">{historyData.points.length}</strong></span>
                <span>ANOMALOUS EVENTS DETECTED: <strong className="text-critical">{historyData.points.filter((p) => p.is_anomaly).length}</strong></span>
              </div>

              {/* TIMELINE BARS GRAPH */}
              <div className="timeline-bars-track neo-card-inset">
                {historyData.points.map((pt, idx) => {
                  const isPtAnomaly = pt.is_anomaly;
                  const scoreVal = pt.score || 0;
                  const barHeightPct = Math.min(100, Math.max(10, ((scoreVal + 0.2) / 0.5) * 100));

                  return (
                    <div
                      key={idx}
                      className={`timeline-bar ${isPtAnomaly ? 'bar-anomaly' : 'bar-normal'}`}
                      style={{ height: `${barHeightPct}%` }}
                      title={`Time: ${formatTimestamp(new Date(pt.timestamp).getTime() / 1000, true, false)} | Score: ${scoreVal.toFixed(4)} | Severity: ${pt.severity}`}
                    />
                  );
                })}
              </div>

              <div className="timeline-axis-labels text-tertiary text-xs margin-top-xs">
                <span>{formatTimestamp(new Date(historyData.points[0].timestamp).getTime() / 1000, true, false)}</span>
                <span>{formatTimestamp(new Date(historyData.points[historyData.points.length - 1].timestamp).getTime() / 1000, true, false)}</span>
              </div>
            </div>
          ) : (
            <div className="neo-card-inset empty-timeline-box text-center font-mono">
              <p className="text-secondary text-xs">No historical points evaluated.</p>
            </div>
          )}
        </div>
      </section>

      {/* 05 / DETECTION ENGINE SPECIFICATIONS */}
      <section className="neo-card-dashed font-mono margin-bottom-lg">
        <div className="specs-header border-bottom padding-bottom-sm">
          <span className="editorial-tag font-bold">05 / DETECTION ENGINE SPECIFICATIONS</span>
        </div>

        <div className="specs-grid margin-top-md">
          <div className="neo-card-inset spec-card">
            <span className="spec-title text-tertiary text-xs">ALGORITHM</span>
            <span className="spec-val text-accent font-bold">{modelMeta.algorithm || 'Isolation Forest'}</span>
            <span className="spec-desc text-secondary text-xs">100 Trees &bull; RobustScaler Log1p Transformation</span>
          </div>

          <div className="neo-card-inset spec-card">
            <span className="spec-title text-tertiary text-xs">FEATURE COUNT</span>
            <span className="spec-val text-primary font-bold">{modelMeta.features_count || 11} Telemetry Features</span>
            <span className="spec-desc text-secondary text-xs">CPU, Memory, Load (1m, 5m, 15m), Network, Disk, Processes</span>
          </div>

          <div className="neo-card-inset spec-card">
            <span className="spec-title text-tertiary text-xs">CONTAMINATION RATE</span>
            <span className="spec-val text-primary font-bold">{(modelMeta.contamination || 0.03) * 100}% Operational Assumption</span>
            <span className="spec-desc text-secondary text-xs">Statistical outlier boundary based on learned percentiles</span>
          </div>

          <div className="neo-card-inset spec-card">
            <span className="spec-title text-tertiary text-xs">TRAINING SAMPLES & SCOPE</span>
            <span className="spec-val text-healthy font-bold">{modelMeta.training_samples || 0} Samples ({selectedHost.toUpperCase()})</span>
            <span className="spec-desc text-secondary text-xs">Trained at {formattedTrainedAt}</span>
          </div>
        </div>
      </section>

      {/* 06 / RECOMMENDED ACTIONS */}
      <section className="neo-card font-mono">
        <div className="section-header border-bottom padding-bottom-sm">
          <span className="editorial-tag font-bold">06 / RECOMMENDED OPERATOR ACTIONS</span>
        </div>

        <div className="recommendations-list margin-top-md">
          {recommendations.map((rec, idx) => (
            <div key={idx} className="neo-card-inset rec-item">
              <ListChecks size={16} className="text-accent shrink-0" />
              <span className="rec-text font-sans text-secondary text-xs">{rec}</span>
            </div>
          ))}
        </div>
      </section>

      <style>{`
        .margin-top-xs { margin-top: 6px; }
        .margin-top-md { margin-top: 20px; }
        .margin-bottom-xs { margin-bottom: 8px; }
        .margin-bottom-md { margin-bottom: 16px; }
        .margin-bottom-lg { margin-bottom: 28px; }

        .host-selector-bar {
          display: flex;
          justify-content: space-between;
          align-items: center;
          gap: 16px;
          flex-wrap: wrap;
        }

        .bar-left {
          display: flex;
          align-items: center;
          gap: 12px;
          flex-wrap: wrap;
        }

        .bar-right {
          display: flex;
          align-items: center;
          gap: 12px;
        }

        .status-hero-grid {
          display: flex;
          justify-content: space-between;
          align-items: center;
          padding: 8px;
          gap: 20px;
          flex-wrap: wrap;
        }

        .status-left {
          display: flex;
          align-items: center;
          gap: 16px;
        }

        .status-icon-box {
          width: 56px;
          height: 56px;
          border-radius: var(--radius-md);
          display: flex;
          align-items: center;
          justify-content: center;
        }

        .box-healthy {
          background: var(--bg-inset);
          border: 1px solid var(--border-subtle);
          box-shadow: var(--shadow-inset-sm);
        }

        .box-critical {
          background: rgba(239, 68, 68, 0.1);
          border: 1px solid rgba(239, 68, 68, 0.3);
        }

        .status-title-row {
          display: flex;
          align-items: center;
          gap: 10px;
        }

        .status-main-title {
          font-size: 18px;
          font-weight: 800;
          color: var(--text-primary);
        }

        .status-right {
          display: flex;
          flex-direction: column;
          gap: 6px;
          min-width: 220px;
        }

        .stat-line {
          display: flex;
          justify-content: space-between;
          gap: 12px;
        }

        .primary-reason-box {
          padding: 16px 20px;
          border-radius: var(--radius-md);
          border-left: 4px solid var(--accent);
        }

        .reason-text {
          font-size: 14px;
          line-height: 1.5;
        }

        .signal-cards-grid {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
          gap: 16px;
        }

        .signal-card {
          padding: 16px;
          border-radius: var(--radius-md);
          display: flex;
          flex-direction: column;
          gap: 8px;
        }

        .signal-card-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
        }

        .signal-metrics-row {
          display: grid;
          grid-template-columns: repeat(3, 1fr);
          gap: 8px;
          background: var(--bg-card);
          padding: 8px;
          border-radius: var(--radius-sm);
        }

        .sig-metric-item {
          display: flex;
          flex-direction: column;
          gap: 2px;
        }

        .table-responsive {
          overflow-x: auto;
        }

        .neo-table {
          width: 100%;
          border-collapse: collapse;
          font-size: 12px;
        }

        .neo-table th {
          text-align: left;
          padding: 10px 12px;
          border-bottom: 1px solid var(--border-subtle);
          color: var(--text-tertiary);
          font-size: 10px;
        }

        .neo-table td {
          padding: 12px;
          border-bottom: 1px solid var(--border-subtle);
        }

        .timeline-header-bar {
          display: flex;
          justify-content: space-between;
          align-items: center;
          gap: 16px;
          flex-wrap: wrap;
        }

        .lookback-selector {
          display: flex;
          align-items: center;
          gap: 6px;
        }

        .empty-timeline-box {
          padding: 32px 20px;
        }

        .timeline-bars-track {
          height: 100px;
          padding: 12px;
          display: flex;
          align-items: flex-end;
          gap: 4px;
          border-radius: var(--radius-md);
          overflow-x: auto;
        }

        .timeline-bar {
          flex: 1;
          min-width: 4px;
          border-radius: 2px;
          transition: all 0.2s ease;
        }

        .bar-normal {
          background: var(--accent);
          opacity: 0.7;
        }

        .bar-anomaly {
          background: var(--status-critical, #ef4444);
        }

        .timeline-axis-labels {
          display: flex;
          justify-content: space-between;
        }

        .specs-grid {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
          gap: 16px;
        }

        .spec-card {
          padding: 16px;
          border-radius: var(--radius-md);
          display: flex;
          flex-direction: column;
          gap: 4px;
        }

        .recommendations-list {
          display: flex;
          flex-direction: column;
          gap: 10px;
        }

        .rec-item {
          padding: 14px 16px;
          border-radius: var(--radius-md);
          display: flex;
          align-items: center;
          gap: 12px;
        }

        .error-banner {
          padding: 12px 16px;
          display: flex;
          align-items: center;
          gap: 10px;
          font-size: 12px;
        }

        .neo-btn-sm {
          padding: 3px 8px;
          font-size: 10px;
          font-family: inherit;
          border-radius: var(--radius-sm);
          border: 1px solid var(--border-subtle);
          background: var(--bg-card);
          color: var(--text-secondary);
          cursor: pointer;
          transition: all 0.15s ease;
        }

        .neo-btn-sm.active {
          background: var(--accent);
          color: #ffffff;
          border-color: var(--accent);
        }

        .spin {
          animation: spin 1s linear infinite;
        }

        @keyframes spin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }

        .border-bottom { border-bottom: 1px solid var(--border-subtle); }
        .padding-bottom-sm { padding-bottom: 10px; }

        .text-accent { color: var(--accent); }
        .text-healthy { color: var(--status-healthy, #10b981); }
        .text-warning { color: var(--status-warning, #f59e0b); }
        .text-critical { color: var(--status-critical, #ef4444); }
        .text-tertiary { color: var(--text-tertiary); }
        .text-secondary { color: var(--text-secondary); }
        .text-primary { color: var(--text-primary); }
      `}</style>
    </div>
  );
}

export default AnomaliesPage;
