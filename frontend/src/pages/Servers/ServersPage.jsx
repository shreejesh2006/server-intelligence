import React from 'react';
import PageHeader from '../../components/common/PageHeader';
import OfflineBanner from '../../components/common/OfflineBanner';
import DataStrip from '../../components/common/DataStrip';
import { 
  formatPercent, 
  formatUptime, 
  formatBytesPerSec, 
  formatNumber, 
  formatUtcTime 
} from '../../utils/formatters';
import { Server, HardDrive, Cpu, Activity, Info } from 'lucide-react';

export function ServersPage({ metrics, isOffline, lastUpdated, refetch }) {
  const isHealthy = !isOffline && metrics != null;

  return (
    <div className="servers-page font-mono">
      <PageHeader
        index="02"
        title="INFRASTRUCTURE SERVERS"
        subtitle="Active host inventory and hardware resource allocation."
        tag="HOST MANAGEMENT"
      />

      {isOffline && <OfflineBanner onRetry={refetch} />}

      {/* Host Overview Card */}
      <section className="server-editorial-card">
        <div className="card-top">
          <div className="host-info font-sans">
            <div className="host-title-row">
              <Server className="host-icon" size={20} />
              <h2 className="host-name">Ubuntu Server</h2>
              <span className={`editorial-pill ${isHealthy ? 'pill-healthy' : 'pill-critical'}`}>
                {isHealthy ? 'ONLINE / CONNECTED' : 'UNREACHABLE'}
              </span>
            </div>
            <p className="host-desc font-mono text-xs text-secondary">
              PRIMARY OBSERVABILITY MONITORING INSTANCE
            </p>
          </div>

          <div className="host-badge">
            <span className="editorial-tag">COLLECTOR ENGINE</span>
            <div className="text-xs font-mono text-primary mt-1">PYTHON METRIC COLLECTOR</div>
          </div>
        </div>

        <div className="editorial-rule-subtle" />

        {/* Server Real Metrics Table */}
        <div className="metrics-summary-grid">
          <div className="grid-cell">
            <span className="cell-label">CPU USAGE</span>
            <span className="cell-value">{metrics?.cpu != null ? formatPercent(metrics.cpu) : '—'}</span>
          </div>
          <div className="grid-cell">
            <span className="cell-label">MEMORY USAGE</span>
            <span className="cell-value">{metrics?.memory != null ? formatPercent(metrics.memory) : '—'}</span>
          </div>
          <div className="grid-cell">
            <span className="cell-label">DISK USAGE</span>
            <span className="cell-value">{metrics?.disk != null ? formatPercent(metrics.disk) : '—'}</span>
          </div>
          <div className="grid-cell">
            <span className="cell-label">SWAP UTILIZATION</span>
            <span className="cell-value">{metrics?.swap != null ? formatPercent(metrics.swap) : '—'}</span>
          </div>
          <div className="grid-cell">
            <span className="cell-label">LOAD (1M / 5M / 15M)</span>
            <span className="cell-value">
              {metrics?.load_1m != null ? `${formatNumber(metrics.load_1m, 2)} / ${formatNumber(metrics.load_5m, 2)} / ${formatNumber(metrics.load_15m, 2)}` : '—'}
            </span>
          </div>
          <div className="grid-cell">
            <span className="cell-label">PROCESS COUNT</span>
            <span className="cell-value">{metrics?.processes != null ? metrics.processes : '—'}</span>
          </div>
          <div className="grid-cell">
            <span className="cell-label">I/O WAIT</span>
            <span className="cell-value">{metrics?.iowait != null ? formatPercent(metrics.iowait) : '—'}</span>
          </div>
          <div className="grid-cell">
            <span className="cell-label">UPTIME</span>
            <span className="cell-value">{metrics?.uptime != null ? formatUptime(metrics.uptime) : '—'}</span>
          </div>
        </div>
      </section>

      {/* Unexposed Metadata Placeholder Section */}
      <section className="metadata-placeholder-block">
        <div className="placeholder-header">
          <div className="placeholder-title-wrap">
            <Info size={14} className="text-secondary" />
            <span className="editorial-tag">SYSTEM METADATA / EXTENDED HARDWARE SPECIFICATION</span>
          </div>
          <span className="editorial-pill pill-neutral">ENDPOINT PENDING</span>
        </div>

        <p className="placeholder-desc font-sans">
          The following host system attributes are reserved for the upcoming host information discovery API endpoint. No synthetic hardware identifiers are generated.
        </p>

        <table className="editorial-table font-mono">
          <thead>
            <tr>
              <th>ATTRIBUTE</th>
              <th>HARDWARE PROPERTY</th>
              <th>EXPOSURE STATUS</th>
              <th>EXPECTED SOURCE</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>HOST IP ADDRESS</td>
              <td>Network Interface IPv4/IPv6</td>
              <td><span className="text-tertiary">Awaiting endpoint `/api/system/info`</span></td>
              <td>FastAPI Host Resolver</td>
            </tr>
            <tr>
              <td>OPERATING SYSTEM</td>
              <td>Linux Kernel & Distribution</td>
              <td><span className="text-tertiary">Awaiting endpoint `/api/system/info`</span></td>
              <td>python-platform / uname</td>
            </tr>
            <tr>
              <td>CPU ARCHITECTURE</td>
              <td>Model & Core Topography</td>
              <td><span className="text-tertiary">Awaiting endpoint `/api/system/info`</span></td>
              <td>/proc/cpuinfo</td>
            </tr>
            <tr>
              <td>STORAGE VOLUMES</td>
              <td>Partition Table & Mount Points</td>
              <td><span className="text-tertiary">Awaiting endpoint `/api/system/info`</span></td>
              <td>psutil.disk_partitions</td>
            </tr>
          </tbody>
        </table>
      </section>

      <style>{`
        .servers-page {
          display: flex;
          flex-direction: column;
        }

        .server-editorial-card {
          background: var(--bg-surface);
          border: 1px solid var(--border-strong);
          padding: 28px 32px;
          margin-bottom: 32px;
        }

        .card-top {
          display: flex;
          justify-content: space-between;
          align-items: flex-start;
          gap: 20px;
          flex-wrap: wrap;
        }

        .host-title-row {
          display: flex;
          align-items: center;
          gap: 12px;
        }

        .host-icon {
          color: var(--accent);
        }

        .host-name {
          font-size: 20px;
          font-weight: 700;
          color: var(--text-primary);
          letter-spacing: -0.01em;
        }

        .host-desc {
          margin-top: 4px;
        }

        .host-badge {
          background: var(--bg-main);
          border: 1px solid var(--border-subtle);
          padding: 8px 14px;
          text-align: right;
        }

        .editorial-rule-subtle {
          height: 1px;
          background: var(--border-subtle);
          margin: 24px 0;
        }

        .metrics-summary-grid {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
          gap: 20px;
        }

        .grid-cell {
          display: flex;
          flex-direction: column;
          gap: 4px;
          background: var(--bg-main);
          border: 1px solid var(--border-subtle);
          padding: 12px 16px;
        }

        .cell-label {
          font-size: 10px;
          color: var(--text-tertiary);
          letter-spacing: 0.08em;
        }

        .cell-value {
          font-size: 14px;
          font-weight: 600;
          color: var(--text-primary);
        }

        .metadata-placeholder-block {
          background: var(--bg-surface);
          border: 1px solid var(--border-strong);
          padding: 24px 28px;
        }

        .placeholder-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          padding-bottom: 12px;
          border-bottom: 1px solid var(--border-subtle);
          margin-bottom: 16px;
        }

        .placeholder-title-wrap {
          display: flex;
          align-items: center;
          gap: 8px;
        }

        .placeholder-desc {
          font-size: 12px;
          color: var(--text-secondary);
          margin-bottom: 20px;
        }
      `}</style>
    </div>
  );
}

export default ServersPage;
