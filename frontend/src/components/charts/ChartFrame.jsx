import React from 'react';

export function ChartFrame({
  figNum = 'FIG. 01',
  title,
  subtitle = 'LAST 60 MINUTES',
  currentValue,
  peakValue,
  unit = '',
  source = 'VICTORIAMETRICS',
  children,
}) {
  return (
    <div className="chart-frame font-mono">
      <div className="chart-frame-header">
        <div className="chart-title-group">
          <span className="editorial-number text-xs">{figNum}</span>
          <span className="chart-slash">/</span>
          <span className="chart-title">{title}</span>
          <span className="chart-subtitle">{subtitle}</span>
        </div>

        <div className="chart-meta-group">
          {currentValue !== undefined && currentValue !== null && (
            <div className="meta-readout">
              <span className="meta-readout-label">NOW</span>
              <span className="meta-readout-value">
                {currentValue}
                {unit}
              </span>
            </div>
          )}
          {peakValue !== undefined && peakValue !== null && (
            <div className="meta-readout">
              <span className="meta-readout-label">PEAK</span>
              <span className="meta-readout-value">
                {peakValue}
                {unit}
              </span>
            </div>
          )}
          <span className="chart-source-tag">{source}</span>
        </div>
      </div>

      <div className="chart-body">{children}</div>

      <style>{`
        .chart-frame {
          background-color: var(--bg-surface);
          border: 1px solid var(--border-strong);
          padding: 20px;
          display: flex;
          flex-direction: column;
          margin-bottom: 24px;
        }

        .chart-frame-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          padding-bottom: 12px;
          border-bottom: 1px solid var(--border-subtle);
          margin-bottom: 16px;
          flex-wrap: wrap;
          gap: 12px;
        }

        .chart-title-group {
          display: flex;
          align-items: center;
          gap: 8px;
        }

        .chart-slash {
          color: var(--border-strong);
        }

        .chart-title {
          font-size: 12px;
          font-weight: 700;
          color: var(--text-primary);
          text-transform: uppercase;
          letter-spacing: 0.05em;
        }

        .chart-subtitle {
          font-size: 10px;
          color: var(--text-tertiary);
          margin-left: 4px;
        }

        .chart-meta-group {
          display: flex;
          align-items: center;
          gap: 16px;
          font-size: 10px;
        }

        .meta-readout {
          display: flex;
          align-items: center;
          gap: 6px;
        }

        .meta-readout-label {
          color: var(--text-tertiary);
        }

        .meta-readout-value {
          color: var(--text-primary);
          font-weight: 600;
        }

        .chart-source-tag {
          font-size: 9px;
          color: var(--text-tertiary);
          border: 1px solid var(--border-subtle);
          padding: 1px 6px;
        }

        .chart-body {
          width: 100%;
          height: 220px;
        }
      `}</style>
    </div>
  );
}

export default ChartFrame;
