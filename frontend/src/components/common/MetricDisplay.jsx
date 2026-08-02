import React from 'react';

export function MetricDisplay({
  label,
  value,
  unit = '%',
  sublabel,
  accentColor,
  status = 'normal', // normal, warning, critical
  secondaryText,
}) {
  const isAvailable = value !== null && value !== undefined && !isNaN(value);

  return (
    <div className={`metric-display-block status-${status}`}>
      <div className="metric-header">
        <span className="editorial-tag">{label}</span>
        {status === 'critical' && <span className="editorial-pill pill-critical">CRITICAL</span>}
        {status === 'warning' && <span className="editorial-pill pill-warning">ELEVATED</span>}
      </div>

      <div className="metric-value-row">
        <span className="metric-number font-mono">
          {isAvailable ? value : '—'}
        </span>
        {isAvailable && unit && <span className="metric-unit font-mono">{unit}</span>}
      </div>

      {(sublabel || secondaryText) && (
        <div className="metric-footer font-mono">
          {sublabel && <span className="metric-sublabel">{sublabel}</span>}
          {secondaryText && <span className="metric-secondary">{secondaryText}</span>}
        </div>
      )}

      <style>{`
        .metric-display-block {
          background-color: var(--bg-surface);
          border: 1px solid var(--border-strong);
          border-left: 3px solid var(--border-strong);
          padding: 20px 24px;
          display: flex;
          flex-direction: column;
          gap: 12px;
          transition: border-color 0.15s ease;
        }

        .metric-display-block.status-warning {
          border-left-color: var(--status-warning);
        }

        .metric-display-block.status-critical {
          border-left-color: var(--status-critical);
        }

        .metric-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
        }

        .metric-value-row {
          display: flex;
          align-items: baseline;
          gap: 6px;
        }

        .metric-number {
          font-size: 38px;
          font-weight: 600;
          line-height: 1;
          color: var(--text-primary);
          letter-spacing: -0.03em;
        }

        .metric-unit {
          font-size: 16px;
          color: var(--text-secondary);
          font-weight: 400;
        }

        .metric-footer {
          display: flex;
          justify-content: space-between;
          align-items: center;
          font-size: 11px;
          color: var(--text-tertiary);
          border-top: 1px solid var(--border-subtle);
          padding-top: 8px;
        }

        .metric-sublabel {
          color: var(--text-secondary);
        }
      `}</style>
    </div>
  );
}

export default MetricDisplay;
