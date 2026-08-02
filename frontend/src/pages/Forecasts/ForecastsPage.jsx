import React, { useState } from 'react';
import PageHeader from '../../components/common/PageHeader';
import EmptyState from '../../components/common/EmptyState';
import { TrendingUp, Sliders, Layers } from 'lucide-react';

export function ForecastsPage() {
  const [selectedMetric, setSelectedMetric] = useState('cpu');
  const [selectedHorizon, setSelectedHorizon] = useState('30m');

  const METRICS = [
    { id: 'cpu', label: 'CPU UTILIZATION' },
    { id: 'memory', label: 'MEMORY USAGE' },
    { id: 'disk', label: 'DISK CAPACITY' },
  ];

  const HORIZONS = [
    { id: '5m', label: '5 MIN' },
    { id: '15m', label: '15 MIN' },
    { id: '30m', label: '30 MIN' },
    { id: '1h', label: '1 HOUR' },
    { id: '3h', label: '3 HOURS' },
  ];

  return (
    <div className="forecasts-page">
      <PageHeader
        index="03"
        title="MULTI-HORIZON FORECASTING"
        subtitle="Predictive infrastructure trends powered by PatchTST transformer neural networks."
        tag="PREDICTIVE INTELLIGENCE"
      />

      {/* Control Selector Strip */}
      <section className="control-strip font-mono">
        <div className="control-group">
          <span className="control-label">TARGET METRIC:</span>
          <div className="button-row">
            {METRICS.map((m) => (
              <button
                key={m.id}
                type="button"
                className={`editorial-btn ${selectedMetric === m.id ? 'editorial-btn-active' : ''}`}
                onClick={() => setSelectedMetric(m.id)}
              >
                {m.label}
              </button>
            ))}
          </div>
        </div>

        <div className="control-divider" />

        <div className="control-group">
          <span className="control-label">PREDICTION HORIZON:</span>
          <div className="button-row">
            {HORIZONS.map((h) => (
              <button
                key={h.id}
                type="button"
                className={`editorial-btn ${selectedHorizon === h.id ? 'editorial-btn-active' : ''}`}
                onClick={() => setSelectedHorizon(h.id)}
              >
                {h.label}
              </button>
            ))}
          </div>
        </div>
      </section>

      {/* Intentional Empty State / Architecture Frame */}
      <EmptyState
        title="FORECASTING ENGINE / MODEL PIPELINE PENDING"
        subtitle="The PatchTST (Patch Time Series Transformer) multi-horizon inference service is not connected to the current FastAPI endpoint."
        statusTag="PATCHTST MODEL PIPELINE PENDING"
        icon={TrendingUp}
        technicalNotes={[
          'Model Architecture: PatchTST (Patched Time Series Transformer for long-term forecasting)',
          'Input Feature Dimension: 13 system telemetry streams (CPU, RAM, Load, I/O rates, Network)',
          'Supported Prediction Horizons: 5m, 15m, 30m, 1h, 3h look-ahead evaluation',
          'Output Features: Expected mean prediction curve, 95% confidence intervals, forecasted peak time',
          'Alert Integration: Proactive threshold violation prediction prior to hard SLA breaches',
        ]}
      />

      {/* Forecast Visual Wireframe Container */}
      <section className="forecast-wireframe-frame font-mono">
        <div className="wireframe-header">
          <span className="editorial-tag">PREVIEW SPECIFICATION / PREDICTIVE LAYOUT</span>
          <span className="editorial-pill pill-neutral">MODEL DISCONNECTED</span>
        </div>

        <div className="wireframe-grid">
          <div className="wireframe-metric-box">
            <span className="w-label">CURRENT METRIC</span>
            <span className="w-val">TELEMETRY ACTIVE</span>
          </div>
          <div className="wireframe-metric-box">
            <span className="w-label">EXPECTED PEAK (30M)</span>
            <span className="w-val">—</span>
          </div>
          <div className="wireframe-metric-box">
            <span className="w-label">CONFIDENCE BOUND</span>
            <span className="w-val">—</span>
          </div>
          <div className="wireframe-metric-box">
            <span className="w-label">RISK LEVEL</span>
            <span className="w-val text-neutral">NOMINAL</span>
          </div>
        </div>
      </section>

      <style>{`
        .control-strip {
          background: var(--bg-surface);
          border: 1px solid var(--border-strong);
          padding: 16px 24px;
          display: flex;
          align-items: center;
          gap: 24px;
          margin-bottom: 24px;
          flex-wrap: wrap;
        }

        .control-group {
          display: flex;
          align-items: center;
          gap: 12px;
        }

        .control-label {
          font-size: 10px;
          color: var(--text-tertiary);
          letter-spacing: 0.08em;
        }

        .button-row {
          display: flex;
          gap: 8px;
        }

        .control-divider {
          width: 1px;
          height: 20px;
          background: var(--border-subtle);
        }

        .forecast-wireframe-frame {
          background: var(--bg-surface);
          border: 1px solid var(--border-strong);
          padding: 24px;
        }

        .wireframe-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          padding-bottom: 12px;
          border-bottom: 1px solid var(--border-subtle);
          margin-bottom: 20px;
        }

        .wireframe-grid {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
          gap: 16px;
        }

        .wireframe-metric-box {
          background: var(--bg-main);
          border: 1px solid var(--border-subtle);
          padding: 12px 16px;
          display: flex;
          flex-direction: column;
          gap: 4px;
        }

        .w-label {
          font-size: 9px;
          color: var(--text-tertiary);
          letter-spacing: 0.08em;
        }

        .w-val {
          font-size: 12px;
          font-weight: 600;
          color: var(--text-primary);
        }
      `}</style>
    </div>
  );
}

export default ForecastsPage;
