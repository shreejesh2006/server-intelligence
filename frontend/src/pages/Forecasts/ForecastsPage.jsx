import React, { useEffect, useState, useCallback } from 'react';
import OfflineBanner from '../../components/common/OfflineBanner';
import { getForecast } from '../../services/intelligence';
import { useServer } from '../../context/ServerContext';
import { formatNumber } from '../../utils/formatters';
import { 
  TrendingUp, 
  Server as ServerIcon, 
  ArrowUpRight, 
  ArrowDownRight,
  Activity,
  Cpu,
  Layers,
  RefreshCw,
  AlertCircle
} from 'lucide-react';

const FORECAST_HORIZONS = ['5m', '15m', '30m', '1h', '3h'];

export function ForecastsPage({ metrics, isOffline, lastUpdated, refetch }) {
  const { servers, selectedHost, selectServer, activeServer } = useServer();
  const [loading, setLoading] = useState(true);
  const [forecastData, setForecastData] = useState(null);
  const [errorMsg, setErrorMsg] = useState(null);

  const loadData = useCallback(async () => {
    setLoading(true);
    setErrorMsg(null);

    try {
      const res = await getForecast(selectedHost);
      setForecastData(res);
    } catch (err) {
      setErrorMsg(err?.response?.data?.detail || 'Forecast intelligence model unavailable');
    } finally {
      setLoading(false);
    }
  }, [selectedHost]);

  useEffect(() => {
    loadData();
  }, [loadData, lastUpdated]);

  const primaryModel = forecastData?.primary_model;

  const targetConfigs = [
    {
      key: 'cpu',
      label: 'CPU Utilization',
      shortLabel: 'CPU',
      unit: '%',
      decimals: 1,
      icon: Cpu,
      currentVal: metrics?.cpu ?? forecastData?.cpu?.current ?? 0,
      forecastObj: forecastData?.cpu,
    },
    {
      key: 'memory',
      label: 'Memory Usage',
      shortLabel: 'Memory',
      unit: '%',
      decimals: 1,
      icon: Layers,
      currentVal: metrics?.memory ?? forecastData?.memory?.current ?? 0,
      forecastObj: forecastData?.memory,
    },
    {
      key: 'load_1m',
      label: 'System Load (1m)',
      shortLabel: 'Load 1m',
      unit: '',
      decimals: 2,
      icon: Activity,
      currentVal: metrics?.load_1m ?? forecastData?.load_1m?.current ?? 0,
      forecastObj: forecastData?.load_1m,
    },
  ];

  return (
    <div className="forecasts-page font-sans">
      {isOffline && <OfflineBanner onRetry={refetch} />}

      {/* HEADER WITH HOST SELECTOR */}
      <div className="page-header-block">
        <div>
          <h1 className="page-title font-sans">Forecasts</h1>
        </div>

        {/* Active Host Selector */}
        <div className="server-host-selector font-sans">
          <span className="selector-label font-sans">Host:</span>
          {servers.map((s) => (
            <button
              key={s.host}
              type="button"
              onClick={() => selectServer(s.host)}
              className={`host-tab-btn ${selectedHost === s.host ? 'active' : ''}`}
            >
              <ServerIcon size={12} />
              <span>{s.name}</span>
            </button>
          ))}
        </div>
      </div>

      {/* MAIN CONTENT AREA */}
      {loading ? (
        <div className="netra-panel forecast-state-box font-sans">
          <RefreshCw size={18} className="spinning text-muted" />
          <span className="text-muted text-xs font-medium">Loading forecast intelligence for {activeServer.name}...</span>
        </div>
      ) : errorMsg ? (
        <div className="netra-panel forecast-state-box font-sans">
          <AlertCircle size={18} className="text-warning-icon" />
          <div className="error-text-group">
            <span className="error-msg font-medium text-xs">{errorMsg}</span>
            <button type="button" onClick={loadData} className="retry-btn font-sans">
              Retry fetch
            </button>
          </div>
        </div>
      ) : !forecastData ? (
        <div className="netra-panel forecast-state-box font-sans">
          <span className="text-muted text-xs font-medium">No forecast data returned for {activeServer.name}.</span>
        </div>
      ) : (
        <div className="netra-panel forecast-outlook-panel">
          <div className="panel-title-bar">
            <div className="title-left">
              <TrendingUp size={16} className="text-muted" />
              <h2 className="panel-title font-sans">Forecast Outlook</h2>
            </div>
          </div>

          {/* TARGET METRICS SECTIONS */}
          <div className="forecast-metrics-list">
            {targetConfigs.map((target) => {
              const Icon = target.icon;
              const curVal = target.currentVal;
              const rawPredictions = target.forecastObj?.predictions || {};
              const hasPredictions = Object.keys(rawPredictions).length > 0;
              const predictions = rawPredictions;
              const strategy = target.forecastObj?.strategy || (hasPredictions ? primaryModel : 'unavailable');

              return (
                <div key={target.key} className="forecast-target-block">
                  {/* TARGET METRIC TITLE & CURRENT READOUT */}
                  <div className="target-header-row font-sans">
                    <div className="target-title-group">
                      <Icon size={15} className="text-muted" />
                      <span className="target-name font-semibold">{target.label}</span>
                      {strategy && <span className="strategy-tag font-sans">{strategy}</span>}
                    </div>

                    <div className="current-readout-pill font-sans">
                      <span className="readout-label font-sans">Current:</span>
                      <span className="readout-val font-sans font-semibold">
                        {formatNumber(curVal, target.decimals)}{target.unit}
                      </span>
                    </div>
                  </div>

                  {/* 5 HORIZONS READOUT GRID */}
                  <div className="horizons-row-grid">
                    {FORECAST_HORIZONS.map((h) => {
                      const predVal = predictions[h];
                      const hasVal = predVal != null;
                      const diff = hasVal ? predVal - curVal : null;
                      const isUp = hasVal && predVal > curVal;
                      const isSame = hasVal && Math.abs(diff) < 0.001;

                      return (
                        <div key={h} className="horizon-readout-card font-sans">
                          <div className="horizon-top font-sans">
                            <span className="horizon-label font-sans">{h}</span>
                            {hasVal && !isSame && (
                              isUp ? (
                                <ArrowUpRight size={13} className="text-critical-icon" />
                              ) : (
                                <ArrowDownRight size={13} className="text-healthy-icon" />
                              )
                            )}
                          </div>

                          <div className="horizon-main-val font-sans">
                            {hasVal ? `${formatNumber(predVal, target.decimals)}${target.unit}` : '—'}
                          </div>

                          <div className="horizon-delta font-sans">
                            {hasVal && diff != null ? (
                              <span className={isUp ? 'text-critical-icon' : isSame ? 'text-muted' : 'text-healthy-icon'}>
                                {diff > 0 ? '+' : ''}{formatNumber(diff, target.decimals)}{target.unit}
                              </span>
                            ) : (
                              <span className="text-muted">—</span>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      <style>{`
        .forecasts-page {
          display: flex;
          flex-direction: column;
          gap: 16px;
        }

        /* Header */
        .page-header-block {
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding-bottom: 2px;
        }

        .page-title {
          font-size: 24px;
          font-weight: 600;
          letter-spacing: -0.02em;
          color: var(--text-primary);
          line-height: 1.2;
        }

        .page-subtitle {
          font-size: 12px;
          color: var(--text-muted);
          margin-top: 2px;
        }

        .fallback-tag {
          color: var(--status-warning);
        }

        .server-host-selector {
          display: flex;
          align-items: center;
          gap: 8px;
        }

        .selector-label {
          font-size: 12px;
          color: var(--text-muted);
        }

        .host-tab-btn {
          display: flex;
          align-items: center;
          gap: 6px;
          background: transparent;
          border: 1px solid var(--border-subtle);
          color: var(--text-secondary);
          font-family: var(--font-sans);
          font-size: 12px;
          padding: 4px 10px;
          border-radius: var(--radius-sm);
          cursor: pointer;
          transition: all 0.15s ease;
        }

        .host-tab-btn:hover {
          background-color: var(--bg-surface-hover);
          color: var(--text-primary);
        }

        .host-tab-btn.active {
          background-color: var(--bg-surface);
          border-color: var(--border-strong);
          color: var(--text-primary);
          font-weight: 500;
        }

        /* Panels */
        .netra-panel {
          background-color: var(--bg-surface);
          border: 1px solid var(--border-subtle);
          border-radius: var(--radius-md);
          padding: 20px;
          display: flex;
          flex-direction: column;
          gap: 16px;
        }

        .panel-title-bar {
          display: flex;
          align-items: center;
          justify-content: space-between;
        }

        .title-left {
          display: flex;
          align-items: center;
          gap: 8px;
        }

        .panel-title {
          font-size: 15px;
          font-weight: 600;
          color: var(--text-primary);
          letter-spacing: -0.01em;
        }

        /* Target Metrics List */
        .forecast-metrics-list {
          display: flex;
          flex-direction: column;
          gap: 20px;
        }

        .forecast-target-block {
          background-color: var(--bg-canvas);
          border: 1px solid var(--border-subtle);
          border-radius: var(--radius-sm);
          padding: 16px;
          display: flex;
          flex-direction: column;
          gap: 12px;
        }

        .target-header-row {
          display: flex;
          align-items: center;
          justify-content: space-between;
          flex-wrap: wrap;
          gap: 10px;
        }

        .target-title-group {
          display: flex;
          align-items: center;
          gap: 8px;
        }

        .target-name {
          font-size: 14px;
          color: var(--text-primary);
        }

        .strategy-tag {
          font-size: 11px;
          color: var(--text-muted);
          background-color: var(--bg-subtle);
          padding: 2px 6px;
          border-radius: var(--radius-xs);
        }

        .current-readout-pill {
          display: flex;
          align-items: center;
          gap: 8px;
          background-color: var(--bg-surface);
          border: 1px solid var(--border-subtle);
          padding: 4px 10px;
          border-radius: var(--radius-xs);
        }

        .readout-tag {
          font-size: 10px;
          font-weight: 600;
          letter-spacing: 0.05em;
          color: var(--text-muted);
        }

        .readout-val {
          font-size: 14px;
          font-weight: 600;
          color: var(--text-primary);
        }

        /* Horizons Grid */
        .horizons-row-grid {
          display: grid;
          grid-template-columns: repeat(5, 1fr);
          gap: 10px;
        }

        .horizon-readout-card {
          background-color: var(--bg-surface);
          border: 1px solid var(--border-subtle);
          border-radius: var(--radius-xs);
          padding: 10px 12px;
          display: flex;
          flex-direction: column;
          gap: 4px;
        }

        .horizon-top {
          display: flex;
          align-items: center;
          justify-content: space-between;
        }

        .horizon-label {
          font-size: 11px;
          font-weight: 500;
          color: var(--text-muted);
        }

        .horizon-main-val {
          font-size: 16px;
          font-weight: 600;
          color: var(--text-primary);
          letter-spacing: -0.01em;
        }

        .horizon-delta {
          font-size: 11px;
        }

        .text-healthy-icon { color: var(--status-healthy); }
        .text-warning-icon { color: var(--status-warning); }
        .text-critical-icon { color: var(--status-critical); }

        /* State Boxes */
        .forecast-state-box {
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 10px;
          padding: 40px;
          text-align: center;
        }

        .error-text-group {
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 8px;
        }

        .error-msg {
          color: var(--text-secondary);
        }

        .retry-btn {
          background: var(--bg-subtle);
          border: 1px solid var(--border-subtle);
          color: var(--text-primary);
          font-size: 11px;
          padding: 4px 10px;
          border-radius: var(--radius-xs);
          cursor: pointer;
        }

        .retry-btn:hover {
          background: var(--bg-surface-hover);
        }

        .spinning {
          animation: spin 1s linear infinite;
        }

        @keyframes spin {
          100% { transform: rotate(360deg); }
        }

        @media (max-width: 900px) {
          .horizons-row-grid {
            grid-template-columns: repeat(3, 1fr);
          }
        }
        @media (max-width: 600px) {
          .horizons-row-grid {
            grid-template-columns: repeat(2, 1fr);
          }
        }
      `}</style>
    </div>
  );
}

export default ForecastsPage;
