import React from 'react';
import { formatUptime, formatPercent } from '../../utils/formatters';

export function DataStrip({ metrics, isOffline, lastUpdated }) {
  const uptime = metrics?.uptime != null ? formatUptime(metrics.uptime) : 'N/A';
  const processes = metrics?.processes != null ? metrics.processes : 'N/A';
  const iowait = metrics?.iowait != null ? formatPercent(metrics.iowait) : 'N/A';
  const swap = metrics?.swap != null ? formatPercent(metrics.swap) : 'N/A';

  return (
    <div className="data-strip-container">
      <div className="data-strip-item">
        <span className="data-strip-label">API STATUS</span>
        <span className={`data-strip-value ${isOffline ? 'text-critical' : 'text-healthy'}`}>
          {isOffline ? 'OFFLINE' : 'ACTIVE / 200 OK'}
        </span>
      </div>

      <div className="strip-divider" />

      <div className="data-strip-item">
        <span className="data-strip-label">UPTIME</span>
        <span className="data-strip-value">{uptime}</span>
      </div>

      <div className="strip-divider" />

      <div className="data-strip-item">
        <span className="data-strip-label">PROCESSES</span>
        <span className="data-strip-value">{processes}</span>
      </div>

      <div className="strip-divider" />

      <div className="data-strip-item">
        <span className="data-strip-label">I/O WAIT</span>
        <span className="data-strip-value">{iowait}</span>
      </div>

      <div className="strip-divider" />

      <div className="data-strip-item">
        <span className="data-strip-label">SWAP UTILIZATION</span>
        <span className="data-strip-value">{swap}</span>
      </div>

      <div className="strip-divider" />

      <div className="data-strip-item">
        <span className="data-strip-label">POLL FREQUENCY</span>
        <span className="data-strip-value">30 SEC</span>
      </div>

      <style>{`
        .data-strip-container {
          display: flex;
          align-items: center;
          background-color: var(--bg-surface);
          border: 1px solid var(--border-strong);
          padding: 10px 20px;
          font-family: var(--font-mono);
          font-size: 11px;
          overflow-x: auto;
          gap: 20px;
          margin-bottom: 32px;
        }

        .data-strip-item {
          display: flex;
          align-items: center;
          gap: 8px;
          white-space: nowrap;
        }

        .data-strip-label {
          color: var(--text-tertiary);
          font-size: 10px;
          letter-spacing: 0.08em;
        }

        .data-strip-value {
          color: var(--text-primary);
          font-weight: 500;
        }

        .strip-divider {
          width: 1px;
          height: 14px;
          background-color: var(--border-subtle);
          flex-shrink: 0;
        }

        .text-healthy {
          color: var(--status-healthy);
        }

        .text-critical {
          color: var(--status-critical);
        }
      `}</style>
    </div>
  );
}

export default DataStrip;
