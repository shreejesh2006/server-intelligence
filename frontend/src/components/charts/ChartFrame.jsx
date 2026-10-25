import React from 'react';

export function ChartFrame({
  title,
  subtitle,
  currentValue,
  peakValue,
  unit = '',
  children,
}) {
  return (
    <div className="nokia-chart-frame font-sans">
      <div className="chart-frame-header">
        <div className="chart-title-group">
          <span className="chart-title">{title}</span>
          {subtitle && <span className="chart-subtitle">{subtitle}</span>}
        </div>

        <div className="chart-meta-group">
          {currentValue !== undefined && currentValue !== null && (
            <div className="meta-readout">
              <span className="meta-label">Current:</span>
              <span className="meta-val">
                {currentValue}
                {unit}
              </span>
            </div>
          )}
          {peakValue !== undefined && peakValue !== null && (
            <div className="meta-readout">
              <span className="meta-label">Peak:</span>
              <span className="meta-val font-sans">
                {peakValue}
                {unit}
              </span>
            </div>
          )}
        </div>
      </div>

      <div className="chart-body-inset">{children}</div>

      <style>{`
        .nokia-chart-frame {
          padding: 16px;
          background-color: var(--bg-surface);
          border: 1px solid var(--border-subtle);
          border-radius: var(--radius-md);
          display: flex;
          flex-direction: column;
        }

        .chart-frame-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          padding-bottom: 12px;
          margin-bottom: 12px;
          flex-wrap: wrap;
          gap: 8px;
        }

        .chart-title-group {
          display: flex;
          align-items: baseline;
          gap: 8px;
        }

        .chart-title {
          font-weight: 500;
          font-size: 14px;
          color: var(--text-primary);
        }

        .chart-subtitle {
          font-size: 12px;
          color: var(--text-muted);
        }

        .chart-meta-group {
          display: flex;
          align-items: center;
          gap: 12px;
          font-size: 12px;
        }

        .meta-readout {
          display: flex;
          align-items: center;
          gap: 4px;
        }

        .meta-label {
          color: var(--text-muted);
        }

        .meta-val {
          font-weight: 500;
          color: var(--text-primary);
        }

        .chart-body-inset {
          width: 100%;
          height: 220px;
          border-radius: var(--radius-sm);
        }
      `}</style>
    </div>
  );
}

export default ChartFrame;
