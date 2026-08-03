import React, { useEffect, useState } from 'react';
import { getForecast, getAnomaly } from '../../services/intelligence';
import { formatNumber } from '../../utils/formatters';

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

  const renderForecastMetricRow = (label, dataKey, unitStr = '%', isDecimal = false) => {
    const metricObj = forecastData?.[dataKey];
    if (!metricObj) {
      return (
        <tr className="forecast-table-row">
          <td className="metric-name-cell">{label}</td>
          <td colSpan="6" className="text-tertiary">Data unavailable</td>
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
        <td className="metric-name-cell font-mono">{label}</td>
        <td className="val-cell font-mono font-semibold">{currentVal}</td>
        {horizons.map((h) => {
          const val = p[h];
          const formatted = val != null 
            ? (isDecimal ? formatNumber(val, 2) : `${formatNumber(val, 1)}${unitStr}`)
            : '—';
          return (
            <td key={h} className="val-cell font-mono">{formatted}</td>
          );
        })}
      </tr>
    );
  };

  return (
    <div className="intelligence-section">
      <div className="section-label-strip font-mono margin-top-lg">
        <span className="editorial-tag">03 / INTELLIGENCE ENGINE</span>
      </div>

      <div className="intelligence-grid">
        {/* CARD 1: FORECAST */}
        <div className="intel-card">
          <div className="intel-card-header font-mono">
            <span className="intel-card-title">FORECAST</span>
            <span className="intel-card-subtitle">PREDICTIVE METRIC TRAJECTORY</span>
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
            <div className="intel-table-wrapper">
              <table className="forecast-table">
                <thead>
                  <tr className="font-mono text-tertiary th-row">
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
                  {renderForecastMetricRow('CPU', 'cpu', '%', false)}
                  {renderForecastMetricRow('Memory', 'memory', '%', false)}
                  {renderForecastMetricRow('Load', 'load_1m', '', true)}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* CARD 2: ANOMALY STATUS */}
        <div className="intel-card">
          <div className="intel-card-header font-mono">
            <span className="intel-card-title">ANOMALY STATUS</span>
            <span className="intel-card-subtitle">ISOLATION FOREST EVALUATION</span>
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
            <div className="anomaly-details-grid font-mono">
              <div className="anomaly-item">
                <span className="anomaly-label">Status</span>
                <span className="anomaly-value font-semibold">
                  {anomalyData?.is_anomaly ? 'Detected' : 'Normal'}
                </span>
              </div>

              <div className="anomaly-item">
                <span className="anomaly-label">Severity</span>
                <span className="anomaly-value severity-tag">
                  {anomalyData?.severity || 'NORMAL'}
                </span>
              </div>

              <div className="anomaly-item">
                <span className="anomaly-label">Score</span>
                <span className="anomaly-value">
                  {anomalyData?.anomaly_score != null 
                    ? formatNumber(anomalyData.anomaly_score, 4)
                    : '—'}
                </span>
              </div>

              <div className="anomaly-item">
                <span className="anomaly-label">Features</span>
                <span className="anomaly-value">
                  {anomalyData?.features_evaluated ?? 11}
                </span>
              </div>
            </div>
          )}
        </div>
      </div>

      <style>{`
        .intelligence-section {
          margin-bottom: 28px;
        }

        .intelligence-grid {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(380px, 1fr));
          gap: 20px;
        }

        .intel-card {
          background-color: var(--bg-surface);
          border: 1px solid var(--border-strong);
          padding: 20px;
          display: flex;
          flex-direction: column;
          gap: 16px;
        }

        .intel-card-header {
          display: flex;
          flex-direction: column;
          gap: 4px;
          border-bottom: 1px solid var(--border-subtle);
          padding-bottom: 12px;
        }

        .intel-card-title {
          font-size: 13px;
          font-weight: 700;
          letter-spacing: 0.08em;
          color: var(--text-primary);
        }

        .intel-card-subtitle {
          font-size: 10px;
          color: var(--text-tertiary);
          letter-spacing: 0.05em;
        }

        .intel-skeleton {
          display: flex;
          flex-direction: column;
          gap: 10px;
          padding: 12px 0;
        }

        .skeleton-line {
          height: 16px;
          background: var(--bg-surface-hover);
          border-radius: 2px;
          animation: pulse-subtle 1.8s infinite ease-in-out;
        }

        @keyframes pulse-subtle {
          0%, 100% { opacity: 0.5; }
          50% { opacity: 0.9; }
        }

        .intel-error-box {
          padding: 24px 16px;
          text-align: center;
          background: var(--bg-main);
          border: 1px solid var(--border-subtle);
          color: var(--text-secondary);
          font-size: 12px;
          letter-spacing: 0.05em;
        }

        .intel-table-wrapper {
          overflow-x: auto;
        }

        .forecast-table {
          width: 100%;
          border-collapse: collapse;
          font-size: 12px;
        }

        .th-row th {
          padding: 6px 8px;
          font-size: 10px;
          letter-spacing: 0.08em;
          font-weight: 600;
          text-align: right;
          border-bottom: 1px solid var(--border-subtle);
        }

        .th-row th.text-left {
          text-align: left;
        }

        .forecast-table-row td {
          padding: 10px 8px;
          border-bottom: 1px dashed var(--border-subtle);
        }

        .forecast-table-row:last-child td {
          border-bottom: none;
        }

        .metric-name-cell {
          text-align: left;
          color: var(--text-primary);
          font-weight: 600;
          font-size: 12px;
        }

        .val-cell {
          text-align: right;
          color: var(--text-secondary);
        }

        .anomaly-details-grid {
          display: grid;
          grid-template-columns: repeat(2, 1fr);
          gap: 16px;
          padding: 4px 0;
        }

        .anomaly-item {
          display: flex;
          flex-direction: column;
          gap: 4px;
          background: var(--bg-main);
          border: 1px solid var(--border-subtle);
          padding: 12px 14px;
        }

        .anomaly-label {
          font-size: 10px;
          color: var(--text-tertiary);
          letter-spacing: 0.08em;
          text-transform: uppercase;
        }

        .anomaly-value {
          font-size: 14px;
          color: var(--text-primary);
          letter-spacing: 0.05em;
        }

        .severity-tag {
          font-weight: 600;
          color: var(--text-primary);
        }

        @media (max-width: 600px) {
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
