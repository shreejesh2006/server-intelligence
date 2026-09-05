import React, { useEffect, useState } from 'react';
import { getForecast, getAnomaly } from '../../services/intelligence';
import { useServer } from '../../context/ServerContext';
import { formatNumber, formatPercent, formatBytesPerSec } from '../../utils/formatters';
import { TrendingUp, ShieldAlert, CheckCircle2, AlertTriangle, Cpu, Activity, Zap, HardDrive, Network, Layers, ArrowUpRight, ArrowDownRight, Minus } from 'lucide-react';

export function IntelligenceSection({ lastUpdated, metrics }) {
  const { selectedHost, activeServer } = useServer();
  const [loading, setLoading] = useState(true);
  const [forecastData, setForecastData] = useState(null);
  const [anomalyData, setAnomalyData] = useState(null);
  const [forecastError, setForecastError] = useState(null);
  const [anomalyError, setAnomalyError] = useState(null);
  const [activeHorizon, setActiveHorizon] = useState('30m');

  useEffect(() => {
    let isCancelled = false;

    async function fetchIntelligence() {
      setLoading(true);
      setForecastError(null);
      setAnomalyError(null);

      try {
        const [fcRes, anomRes] = await Promise.allSettled([
          getForecast(selectedHost),
          getAnomaly(selectedHost),
        ]);

        if (isCancelled) return;

        if (fcRes.status === 'fulfilled') {
          setForecastData(fcRes.value);
        } else {
          const status = fcRes.reason?.response?.status;
          setForecastError(status === 503 ? 'Intelligence models syncing...' : 'Forecast model unavailable.');
        }

        if (anomRes.status === 'fulfilled') {
          setAnomalyData(anomRes.value);
        } else {
          const status = anomRes.reason?.response?.status;
          setAnomalyError(status === 503 ? 'Intelligence models syncing...' : 'Anomaly detector unavailable.');
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
  }, [selectedHost, lastUpdated]);

  const isAnomaly = anomalyData?.is_anomaly ?? false;
  const severity = String(anomalyData?.severity || 'NORMAL').toUpperCase();
  const anomalyScore = anomalyData?.anomaly_score != null ? anomalyData.anomaly_score : 0;
  const featuresEvaluated = anomalyData?.features_evaluated ?? 11;
  const primaryReason = anomalyData?.primary_reason || (isAnomaly ? 'Multivariate deviation detected across telemetry dimensions.' : 'All system telemetry parameters operating within nominal bounds.');

  let severityPillClass = 'pill-healthy';
  if (severity === 'CRITICAL' || severity === 'HIGH') {
    severityPillClass = 'pill-critical';
  } else if (severity === 'MEDIUM' || severity === 'WARNING') {
    severityPillClass = 'pill-warning';
  }

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

  const horizons = [
    { id: '5m', label: '+5 MIN' },
    { id: '15m', label: '+15 MIN' },
    { id: '30m', label: '+30 MIN' },
    { id: '1h', label: '+1 HOUR' },
    { id: '3h', label: '+3 HOURS' },
  ];

  // Helper for 11-feature breakdown display
  const featureMetrics = [
    { key: 'cpu', altKey: 'cpu', label: 'CPU Utilization', icon: Cpu, unit: '%', fmt: (v) => `${formatNumber(v, 1)}%` },
    { key: 'memory', altKey: 'memory', label: 'Memory Usage', icon: Activity, unit: '%', fmt: (v) => `${formatNumber(v, 1)}%` },
    { key: 'load_1m', altKey: 'load_1m', label: 'Load 1m', icon: Zap, unit: '', fmt: (v) => formatNumber(v, 2) },
    { key: 'load_5m', altKey: 'load_5m', label: 'Load 5m', icon: Zap, unit: '', fmt: (v) => formatNumber(v, 2) },
    { key: 'load_15m', altKey: 'load_15m', label: 'Load 15m', icon: Zap, unit: '', fmt: (v) => formatNumber(v, 2) },
    { key: 'network_rx', altKey: 'network_rx', label: 'Network RX', icon: Network, unit: 'B/s', fmt: (v) => formatBytesPerSec(v) },
    { key: 'network_tx', altKey: 'network_tx', label: 'Network TX', icon: Network, unit: 'B/s', fmt: (v) => formatBytesPerSec(v) },
    { key: 'disk_read', altKey: 'disk_read', label: 'Disk Read', icon: HardDrive, unit: 'B/s', fmt: (v) => formatBytesPerSec(v) },
    { key: 'disk_write', altKey: 'disk_write', label: 'Disk Write', icon: HardDrive, unit: 'B/s', fmt: (v) => formatBytesPerSec(v) },
    { key: 'process_count', altKey: 'processes', label: 'Process Count', icon: Layers, unit: '', fmt: (v) => Math.round(v) },
    { key: 'iowait', altKey: 'iowait', label: 'CPU IO Wait', icon: Cpu, unit: '%', fmt: (v) => `${formatNumber(v, 1)}%` },
  ];

  return (
    <div className="intelligence-section">
      <div className="section-label-strip font-mono margin-top-lg margin-bottom-sm">
        <span className="editorial-tag">02 / PREDICTIVE INTELLIGENCE & ANOMALY ENGINE</span>
      </div>

      <div className="intelligence-grid font-mono">
        {/* CARD 1: EXPANDED CAPACITY FORECAST */}
        <div className="neo-card intel-card forecast-expanded-card">
          <div className="intel-card-header border-bottom padding-bottom-xs">
            <div className="title-box">
              <div className="icon-badge bg-accent-light">
                <TrendingUp size={16} className="text-accent" />
              </div>
              <div>
                <div className="intel-card-title font-sans">CAPACITY FORECAST TRAJECTORY</div>
                <div className="intel-card-subtitle text-tertiary text-xs margin-top-xs">
                  MULTI-HORIZON PREDICTION &bull; {activeServer.name.toUpperCase()}
                </div>
              </div>
            </div>

            <div className="header-controls">
              <div className="neo-segmented-track horizon-picker font-mono text-xs">
                {horizons.map((h) => (
                  <button
                    key={h.id}
                    type="button"
                    onClick={() => setActiveHorizon(h.id)}
                    className={`neo-segmented-item ${activeHorizon === h.id ? 'active' : ''}`}
                  >
                    {h.label}
                  </button>
                ))}
              </div>
              <span className="editorial-pill pill-healthy">HOST-AWARE ML</span>
            </div>
          </div>

          {loading ? (
            <div className="intel-skeleton font-mono">
              <div className="skeleton-line" />
              <div className="skeleton-line" />
              <div className="skeleton-line" />
            </div>
          ) : forecastError ? (
            <div className="intel-error-box font-mono margin-top-md">
              <span className="error-text">{forecastError}</span>
            </div>
          ) : (
            <div className="intel-card-body margin-top-md">
              {/* Visual Forecast Metric Trajectories Cards */}
              <div className="forecast-trajectories-grid">
                {/* CPU Forecast Tile */}
                <div className="neo-card-inset forecast-tile">
                  <div className="tile-top text-tertiary">
                    <span className="tile-title flex-center gap-xs font-bold text-primary">
                      <Cpu size={14} className="text-accent" /> CPU UTILIZATION
                    </span>
                    {renderTrendBadge(
                      forecastData?.cpu?.current,
                      forecastData?.cpu?.predictions?.[activeHorizon],
                      '%'
                    )}
                  </div>
                  <div className="tile-body margin-top-xs">
                    <div className="val-comparison">
                      <span className="cur-val text-primary font-mono font-bold">
                        {forecastData?.cpu?.current != null ? `${formatNumber(forecastData.cpu.current, 1)}%` : '—'}
                      </span>
                      <span className="arr-icon text-tertiary">&rarr;</span>
                      <span className="pred-val text-accent font-mono font-bold">
                        {forecastData?.cpu?.predictions?.[activeHorizon] != null
                          ? `${formatNumber(forecastData.cpu.predictions[activeHorizon], 1)}%`
                          : '—'}
                      </span>
                    </div>
                    <div className="neo-progress-track margin-top-xs">
                      <div
                        className="neo-progress-fill bg-accent"
                        style={{
                          width: `${Math.min(100, Math.max(0, forecastData?.cpu?.predictions?.[activeHorizon] || 0))}%`,
                        }}
                      />
                    </div>
                    <div className="tile-subtext text-tertiary text-xs margin-top-xs">
                      TRAJECTORY AT {horizons.find((h) => h.id === activeHorizon)?.label}
                    </div>
                  </div>
                </div>

                {/* Memory Forecast Tile */}
                <div className="neo-card-inset forecast-tile">
                  <div className="tile-top text-tertiary">
                    <span className="tile-title flex-center gap-xs font-bold text-primary">
                      <Activity size={14} className="text-info" /> MEMORY USAGE
                    </span>
                    {renderTrendBadge(
                      forecastData?.memory?.current,
                      forecastData?.memory?.predictions?.[activeHorizon],
                      '%'
                    )}
                  </div>
                  <div className="tile-body margin-top-xs">
                    <div className="val-comparison">
                      <span className="cur-val text-primary font-mono font-bold">
                        {forecastData?.memory?.current != null ? `${formatNumber(forecastData.memory.current, 1)}%` : '—'}
                      </span>
                      <span className="arr-icon text-tertiary">&rarr;</span>
                      <span className="pred-val text-info font-mono font-bold">
                        {forecastData?.memory?.predictions?.[activeHorizon] != null
                          ? `${formatNumber(forecastData.memory.predictions[activeHorizon], 1)}%`
                          : '—'}
                      </span>
                    </div>
                    <div className="neo-progress-track margin-top-xs">
                      <div
                        className="neo-progress-fill bg-info"
                        style={{
                          width: `${Math.min(100, Math.max(0, forecastData?.memory?.predictions?.[activeHorizon] || 0))}%`,
                        }}
                      />
                    </div>
                    <div className="tile-subtext text-tertiary text-xs margin-top-xs">
                      TRAJECTORY AT {horizons.find((h) => h.id === activeHorizon)?.label}
                    </div>
                  </div>
                </div>

                {/* Load 1m Forecast Tile */}
                <div className="neo-card-inset forecast-tile">
                  <div className="tile-top text-tertiary">
                    <span className="tile-title flex-center gap-xs font-bold text-primary">
                      <Zap size={14} className="text-warning" /> 1M LOAD AVERAGE
                    </span>
                    {renderTrendBadge(
                      forecastData?.load_1m?.current,
                      forecastData?.load_1m?.predictions?.[activeHorizon],
                      ''
                    )}
                  </div>
                  <div className="tile-body margin-top-xs">
                    <div className="val-comparison">
                      <span className="cur-val text-primary font-mono font-bold">
                        {forecastData?.load_1m?.current != null ? formatNumber(forecastData.load_1m.current, 2) : '—'}
                      </span>
                      <span className="arr-icon text-tertiary">&rarr;</span>
                      <span className="pred-val text-warning font-mono font-bold">
                        {forecastData?.load_1m?.predictions?.[activeHorizon] != null
                          ? formatNumber(forecastData.load_1m.predictions[activeHorizon], 2)
                          : '—'}
                      </span>
                    </div>
                    <div className="neo-progress-track margin-top-xs">
                      <div
                        className="neo-progress-fill bg-warning"
                        style={{
                          width: `${Math.min(100, Math.max(5, (forecastData?.load_1m?.predictions?.[activeHorizon] || 0) * 20))}%`,
                        }}
                      />
                    </div>
                    <div className="tile-subtext text-tertiary text-xs margin-top-xs">
                      TRAJECTORY AT {horizons.find((h) => h.id === activeHorizon)?.label}
                    </div>
                  </div>
                </div>
              </div>

              {/* Forecast Trajectory Table */}
              <div className="intel-table-wrapper margin-top-md">
                <table className="forecast-table">
                  <thead>
                    <tr className="th-row text-tertiary">
                      <th className="text-left">METRIC</th>
                      <th>CURRENT</th>
                      <th>+5M</th>
                      <th>+15M</th>
                      <th>+30M</th>
                      <th>+1H</th>
                      <th>+3H</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr className="forecast-table-row">
                      <td className="metric-name-cell font-mono font-bold">
                        <span className="flex-center gap-xs">
                          <Cpu size={12} className="text-accent" /> CPU Utilization
                        </span>
                      </td>
                      <td className="val-cell font-mono font-bold text-primary">
                        {forecastData?.cpu?.current != null ? `${formatNumber(forecastData.cpu.current, 1)}%` : '—'}
                      </td>
                      {['5m', '15m', '30m', '1h', '3h'].map((h) => {
                        const val = forecastData?.cpu?.predictions?.[h];
                        return (
                          <td key={h} className={`val-cell font-mono ${h === activeHorizon ? 'text-accent font-bold' : 'text-secondary'}`}>
                            {val != null ? `${formatNumber(val, 1)}%` : '—'}
                          </td>
                        );
                      })}
                    </tr>

                    <tr className="forecast-table-row">
                      <td className="metric-name-cell font-mono font-bold">
                        <span className="flex-center gap-xs">
                          <Activity size={12} className="text-info" /> Memory Usage
                        </span>
                      </td>
                      <td className="val-cell font-mono font-bold text-primary">
                        {forecastData?.memory?.current != null ? `${formatNumber(forecastData.memory.current, 1)}%` : '—'}
                      </td>
                      {['5m', '15m', '30m', '1h', '3h'].map((h) => {
                        const val = forecastData?.memory?.predictions?.[h];
                        return (
                          <td key={h} className={`val-cell font-mono ${h === activeHorizon ? 'text-info font-bold' : 'text-secondary'}`}>
                            {val != null ? `${formatNumber(val, 1)}%` : '—'}
                          </td>
                        );
                      })}
                    </tr>

                    <tr className="forecast-table-row">
                      <td className="metric-name-cell font-mono font-bold">
                        <span className="flex-center gap-xs">
                          <Zap size={12} className="text-warning" /> 1m System Load
                        </span>
                      </td>
                      <td className="val-cell font-mono font-bold text-primary">
                        {forecastData?.load_1m?.current != null ? formatNumber(forecastData.load_1m.current, 2) : '—'}
                      </td>
                      {['5m', '15m', '30m', '1h', '3h'].map((h) => {
                        const val = forecastData?.load_1m?.predictions?.[h];
                        return (
                          <td key={h} className={`val-cell font-mono ${h === activeHorizon ? 'text-warning font-bold' : 'text-secondary'}`}>
                            {val != null ? formatNumber(val, 2) : '—'}
                          </td>
                        );
                      })}
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>

        {/* CARD 2: EXPANDED ANOMALY EVALUATION */}
        <div className="neo-card intel-card anomaly-expanded-card">
          <div className="intel-card-header border-bottom padding-bottom-xs">
            <div className="title-box">
              <div className="icon-badge bg-warning-light">
                <ShieldAlert size={16} className="text-warning" />
              </div>
              <div>
                <div className="intel-card-title font-sans">MULTIVARIATE ANOMALY DETECTOR</div>
                <div className="intel-card-subtitle text-tertiary text-xs margin-top-xs">
                  ISOLATION FOREST &bull; {featuresEvaluated} SYSTEM DIMENSIONS EVALUATED
                </div>
              </div>
            </div>
            <span className={`editorial-pill ${severityPillClass}`}>{severity} SEVERITY</span>
          </div>

          {loading ? (
            <div className="intel-skeleton font-mono">
              <div className="skeleton-line" />
              <div className="skeleton-line" />
              <div className="skeleton-line" />
            </div>
          ) : anomalyError ? (
            <div className="intel-error-box font-mono margin-top-md">
              <span className="error-text">{anomalyError}</span>
            </div>
          ) : (
            <div className="intel-card-body margin-top-md">
              {/* Anomaly Hero Banner */}
              <div className="anomaly-hero-banner neo-card-inset">
                <div className="anomaly-status-left">
                  <div className="status-indicator">
                    {isAnomaly ? (
                      <span className="editorial-pill pill-warning size-lg">
                        <AlertTriangle size={13} /> ANOMALY DETECTED
                      </span>
                    ) : (
                      <span className="editorial-pill pill-healthy size-lg">
                        <CheckCircle2 size={13} /> NOMINAL BEHAVIOR
                      </span>
                    )}
                  </div>
                  <div className="anomaly-reason-text text-secondary text-xs margin-top-xs">
                    {primaryReason}
                  </div>
                </div>

                <div className="anomaly-score-right">
                  <span className="score-label text-tertiary text-xs">OUTLIER SCORE</span>
                  <div className="score-number font-mono font-bold text-primary">
                    {formatNumber(anomalyScore, 4)}
                  </div>
                  <div className="neo-progress-track margin-top-xs">
                    <div
                      className={`neo-progress-fill ${isAnomaly ? 'bg-critical' : anomalyScore > 0.02 ? 'bg-warning' : 'bg-accent'}`}
                      style={{ width: `${Math.min(100, Math.max(8, anomalyScore * 200))}%` }}
                    />
                  </div>
                </div>
              </div>

              {/* 11-Feature Matrix Grid */}
              <div className="feature-matrix-header text-tertiary text-xs margin-top-md">
                EVALUATED TELEMETRY DIMENSIONS ({featuresEvaluated} SERIES)
              </div>

              <div className="feature-matrix-grid margin-top-xs">
                {(() => {
                  const evaluatedMap = {};
                  if (anomalyData?.all_metrics_evaluated && Array.isArray(anomalyData.all_metrics_evaluated)) {
                    anomalyData.all_metrics_evaluated.forEach((item) => {
                      if (item?.metric && item?.current_value != null) {
                        evaluatedMap[item.metric] = item.current_value;
                      }
                    });
                  }

                  return featureMetrics.map((fm) => {
                    const IconComponent = fm.icon;
                    let rawVal = 0;
                    if (anomalyData?.features?.[fm.key] != null) {
                      rawVal = anomalyData.features[fm.key];
                    } else if (fm.altKey && anomalyData?.features?.[fm.altKey] != null) {
                      rawVal = anomalyData.features[fm.altKey];
                    } else if (evaluatedMap[fm.key] != null) {
                      rawVal = evaluatedMap[fm.key];
                    } else if (fm.altKey && evaluatedMap[fm.altKey] != null) {
                      rawVal = evaluatedMap[fm.altKey];
                    } else if (metrics?.[fm.key] != null) {
                      rawVal = metrics[fm.key];
                    } else if (fm.altKey && metrics?.[fm.altKey] != null) {
                      rawVal = metrics[fm.altKey];
                    }

                    return (
                      <div key={fm.key} className="feature-chip neo-card-inset">
                        <div className="chip-left">
                          <IconComponent size={11} className="text-tertiary" />
                          <span className="chip-label text-secondary">{fm.label}</span>
                        </div>
                        <span className="chip-val font-mono font-bold text-primary">
                          {fm.fmt(rawVal)}
                        </span>
                      </div>
                    );
                  });
                })()}
              </div>
            </div>
          )}
        </div>
      </div>

      <style>{`
        .margin-top-xs { margin-top: 4px; }
        .margin-top-sm { margin-top: 8px; }
        .margin-top-md { margin-top: 14px; }
        .margin-top-lg { margin-top: 22px; }
        .padding-bottom-xs { padding-bottom: 8px; }
        .border-bottom { border-bottom: 1px solid var(--border-subtle); }
        .flex-center { display: flex; align-items: center; }
        .gap-xs { gap: 6px; }

        .intelligence-section {
          margin-bottom: 24px;
        }

        .intelligence-grid {
          display: grid;
          grid-template-columns: 1.2fr 1fr;
          gap: 20px;
        }

        .intel-card {
          padding: 22px 24px;
        }

        .intel-card-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          gap: 12px;
          flex-wrap: wrap;
        }

        .header-controls {
          display: flex;
          align-items: center;
          gap: 10px;
        }

        .title-box {
          display: flex;
          align-items: center;
          gap: 12px;
        }

        .icon-badge {
          width: 34px;
          height: 34px;
          border-radius: var(--radius-md);
          display: flex;
          align-items: center;
          justify-content: center;
          border: 1px solid var(--border-subtle);
        }

        .bg-accent-light { background: rgba(22, 163, 74, 0.1); }
        .bg-warning-light { background: rgba(245, 158, 11, 0.1); }

        .intel-card-title {
          font-size: 14px;
          font-weight: 700;
          letter-spacing: 0.02em;
          color: var(--text-primary);
        }

        .intel-card-subtitle {
          font-size: 9px;
          letter-spacing: 0.06em;
        }

        .forecast-trajectories-grid {
          display: grid;
          grid-template-columns: repeat(3, 1fr);
          gap: 12px;
        }

        .forecast-tile {
          padding: 12px 14px;
          display: flex;
          flex-direction: column;
          justify-content: space-between;
        }

        .tile-top {
          display: flex;
          justify-content: space-between;
          align-items: center;
          font-size: 11px;
        }

        .val-comparison {
          display: flex;
          align-items: center;
          gap: 8px;
          font-size: 16px;
        }

        .arr-icon {
          font-size: 14px;
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

        .anomaly-hero-banner {
          padding: 14px 16px;
          display: flex;
          justify-content: space-between;
          align-items: center;
          gap: 16px;
          background: var(--bg-inset);
          border-radius: var(--radius-md);
        }

        .anomaly-score-right {
          text-align: right;
          min-width: 110px;
        }

        .score-number {
          font-size: 20px;
          line-height: 1.2;
        }

        .size-lg {
          padding: 4px 10px;
          font-size: 11px;
        }

        .feature-matrix-header {
          letter-spacing: 0.08em;
          font-weight: 600;
        }

        .feature-matrix-grid {
          display: grid;
          grid-template-columns: repeat(2, 1fr);
          gap: 8px;
        }

        .feature-chip {
          padding: 8px 10px;
          display: flex;
          justify-content: space-between;
          align-items: center;
          font-size: 10px;
        }

        .chip-left {
          display: flex;
          align-items: center;
          gap: 6px;
        }

        .intel-skeleton {
          display: flex;
          flex-direction: column;
          gap: 10px;
          padding: 20px 0;
        }

        .skeleton-line {
          height: 18px;
          background: var(--bg-inset);
          border-radius: var(--radius-sm);
          animation: pulse-subtle 1.8s infinite ease-in-out;
        }

        @keyframes pulse-subtle {
          0%, 100% { opacity: 0.5; }
          50% { opacity: 0.9; }
        }

        .intel-error-box {
          padding: 20px 16px;
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

        .val-cell {
          text-align: right;
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
          transition: width 0.3s ease;
        }

        .bg-accent { background: var(--accent); }
        .bg-info { background: var(--status-info); }
        .bg-warning { background: var(--status-warning); }
        .bg-critical { background: var(--status-critical); }

        .text-accent { color: var(--accent); }
        .text-info { color: var(--status-info); }
        .text-warning { color: var(--status-warning); }
        .text-healthy { color: var(--status-healthy); }
        .text-tertiary { color: var(--text-tertiary); }
        .text-secondary { color: var(--text-secondary); }
        .text-primary { color: var(--text-primary); }

        @media (max-width: 1200px) {
          .intelligence-grid {
            grid-template-columns: 1fr;
          }
        }

        @media (max-width: 768px) {
          .forecast-trajectories-grid {
            grid-template-columns: 1fr;
          }
          .feature-matrix-grid {
            grid-template-columns: 1fr;
          }
        }
      `}</style>
    </div>
  );
}

export default IntelligenceSection;
