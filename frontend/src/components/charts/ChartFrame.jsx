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
    <div className="neo-chart-frame neo-card font-mono">
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
              <span className="meta-readout-label text-tertiary">NOW:</span>
              <span className="meta-readout-value text-accent font-bold">
                {currentValue}
                {unit}
              </span>
            </div>
          )}
          {peakValue !== undefined && peakValue !== null && (
            <div className="meta-readout">
              <span className="meta-readout-label text-tertiary">PEAK:</span>
              <span className="meta-readout-value text-primary font-bold">
                {peakValue}
                {unit}
              </span>
            </div>
          )}
          <span className="chart-source-tag">{source}</span>
        </div>
      </div>

      <div className="chart-body-inset">{children}</div>

      <style>{`
        .neo-chart-frame {
          padding: 16px 18px;
          display: flex;
          flex-direction: column;
        }

        .chart-frame-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          padding-bottom: 10px;
          border-bottom: 1px solid var(--border-subtle);
          margin-bottom: 12px;
          flex-wrap: wrap;
          gap: 8px;
        }

        .chart-title-group {
          display: flex;
          align-items: center;
          gap: 6px;
        }

        .chart-slash {
          color: var(--border-strong);
        }

        .chart-title {
          font-size: 11px;
          font-weight: 700;
          color: var(--text-primary);
          text-transform: uppercase;
          letter-spacing: 0.04em;
        }

        .chart-subtitle {
          font-size: 10px;
          color: var(--text-tertiary);
          margin-left: 2px;
        }

        .chart-meta-group {
          display: flex;
          align-items: center;
          gap: 12px;
          font-size: 10px;
        }

        .meta-readout {
          display: flex;
          align-items: center;
          gap: 4px;
        }

        .chart-source-tag {
          font-size: 9px;
          color: var(--text-tertiary);
          border: 1px solid var(--border-subtle);
          background: var(--bg-inset);
          padding: 2px 6px;
          border-radius: var(--radius-sm);
        }

        .chart-body-inset {
          width: 100%;
          height: 210px;
          background: var(--bg-inset);
          box-shadow: var(--shadow-inset-sm);
          border-radius: var(--radius-md);
          border: 1px solid var(--border-subtle);
          padding: 10px;
        }

        .text-accent { color: var(--accent); }
        .text-tertiary { color: var(--text-tertiary); }
        .text-primary { color: var(--text-primary); }
      `}</style>
    </div>
  );
}

export default ChartFrame;
