import React, { useEffect, useState } from 'react';
import { getForecast, getAnomaly } from '../../services/intelligence';
import { formatNumber } from '../../utils/formatters';
import { TrendingUp, ShieldAlert, CheckCircle2, AlertTriangle, Cpu, Activity, Zap } from 'lucide-react';

export function IntelligenceSection({ lastUpdated }) {
  const [loading, setLoading] = useState(true);
  const [forecastData, setForecastData] = useState(null);
  const [anomalyData, setAnomalyData] = useState(null);
  const [forecastError, setForecastError] = useState(null);
  const [anomalyError, setAnomalyError] = useState(null);

  useEffect(() => {
    let isCancelled = false;

    async function fetchIntelligence() {
      setLoading(true);
      setForecastError(null);
      setAnomalyError(null);

      try {
        const [fcRes, anomRes] = await Promise.allSettled([
          getForecast(),
          getAnomaly(),
        ]);

        if (isCancelled) return;

        if (fcRes.status === 'fulfilled') {
          setForecastData(fcRes.value);
        } else {
          const status = fcRes.reason?.response?.status;
          setForecastError(status === 503 ? 'Intelligence models unavailable.' : 'Forecast unavailable.');
        }

        if (anomRes.status === 'fulfilled') {
          setAnomalyData(anomRes.value);
        } else {
          const status = anomRes.reason?.response?.status;
          setAnomalyError(status === 503 ? 'Intelligence models unavailable.' : 'Anomaly detector unavailable.');
        }
      } catch (_err) {
        if (!isCancelled) {
          setForecastError('Intelligence models unavailable.');
          setAnomalyError('Intelligence models unavailable.');
        }
      } finally {
        if (!isCancelled) {
          setLoading(false);
        }
      }
    }

    fetchIntelligence();

    return () => {
      isCancelled = true;
    };
  }, [lastUpdated]);

  const renderForecastMetricRow = (label, dataKey, icon, unitStr = '%', isDecimal = false) => {
    const MetricIcon = icon;
    const metricObj = forecastData?.[dataKey];
    if (!metricObj) {
      return (
        <tr className="forecast-table-row">
          <td className="metric-name-cell">
            <span className="metric-cell-inner">
              <MetricIcon size={13} className="text-tertiary" />
              <span>{label}</span>
            </span>
          </td>
          <td colSpan="6" className="text-tertiary text-center">Data unavailable</td>
        </tr>
      );
    }

    const currentVal = metricObj.current != null 
      ? (isDecimal ? formatNumber(metricObj.current, 2) : `${formatNumber(metricObj.current, 1)}${unitStr}`)
      : '—';

    const p = metricObj.predictions || {};
    const horizons = ['5m', '15m', '30m', '1h', '3h'];

    return (
      <tr className="forecast-table-row">
        <td className="metric-name-cell font-mono">
          <span className="metric-cell-inner">
            <MetricIcon size={13} className="text-accent" />
            <span className="font-bold">{label}</span>
          </span>
        </td>
        <td className="val-cell font-mono font-bold text-accent">{currentVal}</td>
        {horizons.map((h) => {
          const val = p[h];
          const formatted = val != null 
            ? (isDecimal ? formatNumber(val, 2) : `${formatNumber(val, 1)}${unitStr}`)
            : '—';
          return (
            <td key={h} className="val-cell font-mono text-secondary">{formatted}</td>
          );
        })}
      </tr>
    );
  };

  const isAnomaly = anomalyData?.is_anomaly ?? false;
  const severity = String(anomalyData?.severity || 'NORMAL').toUpperCase();
  const anomalyScore = anomalyData?.anomaly_score != null ? anomalyData.anomaly_score : 0;
  const featuresEvaluated = anomalyData?.features_evaluated ?? 11;

  let severityPillClass = 'pill-healthy';
  if (severity === 'CRITICAL' || severity === 'HIGH') {
    severityPillClass = 'pill-critical';
  } else if (severity === 'MEDIUM' || severity === 'WARNING') {
    severityPillClass = 'pill-warning';
  }

  return (
    <div className="intelligence-section">
      <div className="section-label-strip font-mono margin-top-lg margin-bottom-sm">
        <span className="editorial-tag">03 / INTELLIGENCE ENGINE</span>
      </div>

      <div className="intelligence-grid font-mono">
        {/* CARD 1: FORECAST */}
        <div className="neo-card intel-card">
          <div className="intel-card-header border-bottom padding-bottom-xs">
            <div className="title-box">
              <TrendingUp size={15} className="text-accent" />
              <div>
                <div className="intel-card-title font-sans">CAPACITY FORECAST</div>
                <div className="intel-card-subtitle text-tertiary text-xs margin-top-xs">PREDICTIVE METRIC TRAJECTORY (PATCHTST MODEL)</div>
              </div>
            </div>
            <span className="editorial-pill pill-healthy">3H HORIZON</span>
          </div>

          {loading ? (
            <div className="intel-skeleton font-mono">
              <div className="skeleton-line" />
              <div className="skeleton-line" />
              <div className="skeleton-line" />
            </div>
          ) : forecastError ? (
            <div className="intel-error-box font-mono">
              <span className="error-text">{forecastError}</span>
            </div>
          ) : (
            <div className="intel-table-wrapper margin-top-md">
              <table className="forecast-table">
                <thead>
                  <tr className="th-row text-tertiary">
                    <th className="text-left">METRIC</th>
                    <th>CURRENT</th>
                    <th>5M</th>
                    <th>15M</th>
                    <th>30M</th>
                    <th>1H</th>
                    <th>3H</th>
                  </tr>
                </thead>
                <tbody>
                  {renderForecastMetricRow('CPU', 'cpu', Cpu, '%', false)}
                  {renderForecastMetricRow('Memory', 'memory', Activity, '%', false)}
                  {renderForecastMetricRow('Load', 'load_1m', Zap, '', true)}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* CARD 2: ANOMALY STATUS */}
        <div className="neo-card intel-card">
          <div className="intel-card-header border-bottom padding-bottom-xs">
            <div className="title-box">
              <ShieldAlert size={15} className="text-accent" />
              <div>
                <div className="intel-card-title font-sans">ANOMALY EVALUATION</div>
                <div className="intel-card-subtitle text-tertiary text-xs margin-top-xs">ISOLATION FOREST ANOMALY DETECTOR</div>
              </div>
            </div>
            <span className="editorial-pill pill-neutral">QUANTILE Q98</span>
          </div>

          {loading ? (
            <div className="intel-skeleton font-mono">
              <div className="skeleton-line" />
              <div className="skeleton-line" />
              <div className="skeleton-line" />
            </div>
          ) : anomalyError ? (
            <div className="intel-error-box font-mono">
              <span className="error-text">{anomalyError}</span>
            </div>
          ) : (
            <div className="anomaly-details-grid margin-top-md">
              <div className="neo-card-inset anomaly-tile">
                <span className="tile-label text-tertiary">EVALUATION STATUS</span>
                <div className="tile-value-box margin-top-xs">
                  {isAnomaly ? (
                    <span className="editorial-pill pill-warning">
                      <AlertTriangle size={11} /> ANOMALY DETECTED
                    </span>
                  ) : (
                    <span className="editorial-pill pill-healthy">
                      <CheckCircle2 size={11} /> NORMAL STATE
                    </span>
                  )}
                </div>
              </div>

              <div className="neo-card-inset anomaly-tile">
                <span className="tile-label text-tertiary">SEVERITY LEVEL</span>
                <div className="tile-value-box margin-top-xs">
                  <span className={`editorial-pill ${severityPillClass}`}>
                    {severity}
                  </span>
                </div>
              </div>

              <div className="neo-card-inset anomaly-tile">
                <span className="tile-label text-tertiary">ANOMALY SCORE</span>
                <div className="tile-value-box margin-top-xs">
                  <span className="score-num font-mono font-bold text-primary">
                    {formatNumber(anomalyScore, 4)}
                  </span>
                </div>
                <div className="neo-progress-track margin-top-xs">
                  <div
                    className={`neo-progress-fill ${anomalyScore > 0.05 ? 'bg-warning' : 'bg-accent'}`}
                    style={{ width: `${Math.min(100, Math.max(5, anomalyScore * 200))}%` }}
                  />
                </div>
              </div>

              <div className="neo-card-inset anomaly-tile">
                <span className="tile-label text-tertiary">FEATURES EVALUATED</span>
                <div className="tile-value-box margin-top-xs">
                  <span className="features-num font-mono font-bold text-primary">
                    {featuresEvaluated} <span className="text-xs text-tertiary font-normal">SERIES</span>
                  </span>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      <style>{`
        .margin-top-xs { margin-top: 4px; }
        .margin-top-sm { margin-top: 8px; }
        .margin-top-md { margin-top: 14px; }
        .margin-top-lg { margin-top: 20px; }
        .padding-bottom-xs { padding-bottom: 8px; }
        .border-bottom { border-bottom: 1px solid var(--border-subtle); }

        .intelligence-section {
          margin-bottom: 24px;
        }

        .intelligence-grid {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(400px, 1fr));
          gap: 20px;
        }

        .intel-card {
          padding: 20px 22px;
        }

        .intel-card-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          gap: 12px;
        }

        .title-box {
          display: flex;
          align-items: center;
          gap: 10px;
        }

        .intel-card-title {
          font-size: 13px;
          font-weight: 700;
          letter-spacing: 0.02em;
          color: var(--text-primary);
        }

        .intel-card-subtitle {
          font-size: 9px;
          letter-spacing: 0.06em;
        }

        .intel-skeleton {
          display: flex;
          flex-direction: column;
          gap: 10px;
          padding: 20px 0;
        }

        .skeleton-line {
          height: 16px;
          background: var(--bg-inset);
          border-radius: var(--radius-sm);
          animation: pulse-subtle 1.8s infinite ease-in-out;
        }

        @keyframes pulse-subtle {
          0%, 100% { opacity: 0.5; }
          50% { opacity: 0.9; }
        }

        .intel-error-box {
          padding: 24px 16px;
          text-align: center;
          background: var(--bg-inset);
          border: 1px solid var(--border-subtle);
          border-radius: var(--radius-md);
          color: var(--text-secondary);
          font-size: 11px;
        }

        .intel-table-wrapper {
          overflow-x: auto;
        }

        .forecast-table {
          width: 100%;
          border-collapse: collapse;
          font-size: 11px;
        }

        .th-row th {
          padding: 6px 8px;
          font-size: 10px;
          letter-spacing: 0.08em;
          font-weight: 600;
          text-align: right;
          border-bottom: 1px solid var(--border-strong);
        }

        .th-row th.text-left {
          text-align: left;
        }

        .forecast-table-row td {
          padding: 10px 8px;
          border-bottom: 1px solid var(--border-subtle);
          vertical-align: middle;
        }

        .forecast-table-row:last-child td {
          border-bottom: none;
        }

        .metric-cell-inner {
          display: flex;
          align-items: center;
          gap: 6px;
        }

        .metric-name-cell {
          text-align: left;
          color: var(--text-primary);
          font-size: 11px;
        }

        .val-cell {
          text-align: right;
        }

        .anomaly-details-grid {
          display: grid;
          grid-template-columns: repeat(2, 1fr);
          gap: 12px;
        }

        .anomaly-tile {
          padding: 12px 14px;
          display: flex;
          flex-direction: column;
          gap: 4px;
        }

        .tile-label {
          font-size: 10px;
          letter-spacing: 0.06em;
        }

        .tile-value-box {
          display: flex;
          align-items: center;
          gap: 6px;
        }

        .score-num, .features-num {
          font-size: 15px;
        }

        .neo-progress-track {
          height: 4px;
          background: rgba(148, 163, 184, 0.2);
          border-radius: var(--radius-pill);
          overflow: hidden;
        }

        .neo-progress-fill {
          height: 100%;
          border-radius: var(--radius-pill);
        }

        .bg-accent { background: var(--accent); }
        .bg-warning { background: var(--status-warning); }

        .text-accent { color: var(--accent); }
        .text-tertiary { color: var(--text-tertiary); }
        .text-secondary { color: var(--text-secondary); }
        .text-primary { color: var(--text-primary); }
        .text-center { text-align: center; }

        @media (max-width: 700px) {
          .intelligence-grid {
            grid-template-columns: 1fr;
          }
          .anomaly-details-grid {
            grid-template-columns: 1fr;
          }
        }
      `}</style>
    </div>
  );
}

export default IntelligenceSection;
