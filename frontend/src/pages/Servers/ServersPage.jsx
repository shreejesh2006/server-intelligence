import React from 'react';
import PageHeader from '../../components/common/PageHeader';
import OfflineBanner from '../../components/common/OfflineBanner';
import { 
  formatPercent, 
  formatUptime, 
  formatNumber 
} from '../../utils/formatters';
import { Server, Info } from 'lucide-react';

export function ServersPage({ metrics, isOffline, refetch }) {
  const isHealthy = !isOffline && metrics != null;

  return (
    <div className="servers-page font-mono">
      <PageHeader
        index="02"
        title="MANAGED SERVERS"
        subtitle="Infrastructure server inventory and node telemetry status."
        tag="NODE INVENTORY"
      />

      {isOffline && <OfflineBanner onRetry={refetch} />}

      {/* Primary Server Node Card */}
      <section className="server-node-card">
        <div className="node-card-header">
          <div className="node-title-box">
            <Server size={18} className="text-accent" />
            <div>
              <div className="node-name font-sans">ubuntu-primary</div>
              <div className="node-sub font-mono">UBUNTU 24.04 LTS (X86_64)</div>
            </div>
          </div>
          <span className={`editorial-pill ${isHealthy ? 'pill-healthy' : 'pill-critical'}`}>
            {isHealthy ? 'ONLINE / HEALTHY' : 'OFFLINE / UNREACHABLE'}
          </span>
        </div>

        <div className="editorial-rule-subtle" />

        <div className="node-spec-grid font-mono">
          <div className="spec-item">
            <span className="spec-label">HOSTNAME:</span>
            <span className="spec-val">ubuntu-primary.local</span>
          </div>
          <div className="spec-item">
            <span className="spec-label">IP ADDRESS:</span>
            <span className="spec-val">192.168.64.22</span>
          </div>
          <div className="spec-item">
            <span className="spec-label">UPTIME:</span>
            <span className="spec-val">{metrics?.uptime ? formatUptime(metrics.uptime) : 'N/A'}</span>
          </div>
          <div className="spec-item">
            <span className="spec-label">CPU CORES:</span>
            <span className="spec-val">2 VCPU</span>
          </div>
          <div className="spec-item">
            <span className="spec-label">TOTAL RAM:</span>
            <span className="spec-val">4.0 GB</span>
          </div>
          <div className="spec-item">
            <span className="spec-label">KERNEL:</span>
            <span className="spec-val">Linux 6.8.0-generic</span>
          </div>
        </div>

        <div className="node-metrics-strip margin-top-md font-mono">
          <div className="strip-metric">
            <span className="strip-label">CPU:</span>
            <span className="strip-val">{metrics?.cpu != null ? formatPercent(metrics.cpu) : '—'}</span>
          </div>
          <div className="strip-sep">/</div>
          <div className="strip-metric">
            <span className="strip-label">RAM:</span>
            <span className="strip-val">{metrics?.memory != null ? formatPercent(metrics.memory) : '—'}</span>
          </div>
          <div className="strip-sep">/</div>
          <div className="strip-metric">
            <span className="strip-label">DISK:</span>
            <span className="strip-val">{metrics?.disk != null ? formatPercent(metrics.disk) : '—'}</span>
          </div>
          <div className="strip-sep">/</div>
          <div className="strip-metric">
            <span className="strip-label">LOAD 1M:</span>
            <span className="strip-val">{metrics?.load_1m != null ? formatNumber(metrics.load_1m, 2) : '—'}</span>
          </div>
        </div>
      </section>

      {/* Cluster Nodes Provisioning Preview */}
      <section className="cluster-preview-section font-mono">
        <div className="editorial-header">
          <div>
            <span className="editorial-tag">CLUSTER EXPANSION SURFACE</span>
            <h3 className="editorial-title font-sans">ADDITIONAL CLUSTER NODES</h3>
          </div>
          <span className="editorial-pill pill-neutral">SINGLE NODE MODE</span>
        </div>

        <div className="placeholder-node-box">
          <Info size={16} className="text-secondary" />
          <p className="font-sans text-xs text-secondary">
            Only 1 target host (<code>ubuntu-primary</code>) is currently configured in the Python collector target registry. Multi-node auto-discovery is pending fleet integration.
          </p>
        </div>
      </section>

      <style>{`
        .server-node-card {
          background: var(--bg-surface);
          border: 1px solid var(--border-strong);
          border-left: 4px solid var(--accent);
          padding: 24px;
          margin-bottom: 28px;
        }

        .node-card-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          gap: 16px;
        }

        .node-title-box {
          display: flex;
          align-items: center;
          gap: 12px;
        }

        .node-name {
          font-size: 16px;
          font-weight: 700;
          color: var(--text-primary);
        }

        .node-sub {
          font-size: 10px;
          color: var(--text-tertiary);
          letter-spacing: 0.05em;
        }

        .editorial-rule-subtle {
          height: 1px;
          background: var(--border-subtle);
          margin: 20px 0;
        }

        .node-spec-grid {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
          gap: 16px;
          font-size: 11px;
        }

        .spec-item {
          display: flex;
          gap: 8px;
        }

        .spec-label {
          color: var(--text-tertiary);
          width: 90px;
          flex-shrink: 0;
        }

        .spec-val {
          color: var(--text-primary);
          font-weight: 500;
        }

        .node-metrics-strip {
          background: var(--bg-main);
          border: 1px solid var(--border-subtle);
          padding: 12px 16px;
          display: flex;
          align-items: center;
          gap: 12px;
          font-size: 11px;
          flex-wrap: wrap;
        }

        .strip-metric {
          display: flex;
          gap: 6px;
        }

        .strip-label {
          color: var(--text-tertiary);
        }

        .strip-val {
          color: var(--accent);
          font-weight: 600;
        }

        .strip-sep {
          color: var(--border-strong);
        }

        .margin-top-md {
          margin-top: 20px;
        }

        .cluster-preview-section {
          background: var(--bg-surface);
          border: 1px solid var(--border-strong);
          padding: 24px;
        }

        .placeholder-node-box {
          background: var(--bg-main);
          border: 1px solid var(--border-subtle);
          padding: 16px;
          display: flex;
          align-items: center;
          gap: 12px;
          margin-top: 16px;
        }

        .text-accent { color: var(--accent); }
        .text-secondary { color: var(--text-secondary); }
      `}</style>
    </div>
  );
}

export default ServersPage;
