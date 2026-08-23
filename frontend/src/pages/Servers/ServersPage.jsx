import React, { useEffect, useState } from 'react';
import PageHeader from '../../components/common/PageHeader';
import OfflineBanner from '../../components/common/OfflineBanner';
import { useServer } from '../../context/ServerContext';
import { getCurrentMetrics } from '../../services/metrics';
import { 
  formatPercent, 
  formatUptime, 
  formatNumber 
} from '../../utils/formatters';
import { Server, CheckCircle2, ArrowRight } from 'lucide-react';

export function ServersPage({ isOffline, refetch }) {
  const { servers, selectedHost, selectServer } = useServer();
  const [nodesData, setNodesData] = useState({
    ubuntu: { metrics: null, loading: true, error: null },
    Kali: { metrics: null, loading: true, error: null },
  });

  useEffect(() => {
    let isCancelled = false;

    async function loadAllNodesTelemetry() {
      try {
        const [uRes, kRes] = await Promise.all([
          getCurrentMetrics('ubuntu').catch(() => null),
          getCurrentMetrics('Kali').catch(() => null),
        ]);

        if (isCancelled) return;

        setNodesData({
          ubuntu: {
            metrics: uRes?.metrics || null,
            loading: false,
            error: uRes?.status === 'success' ? null : 'Telemetry offline',
          },
          Kali: {
            metrics: kRes?.metrics || null,
            loading: false,
            error: kRes?.status === 'success' ? null : 'Telemetry offline',
          },
        });
      } catch (err) {
        if (!isCancelled) {
          setNodesData({
            ubuntu: { metrics: null, loading: false, error: err.message },
            Kali: { metrics: null, loading: false, error: err.message },
          });
        }
      }
    }

    loadAllNodesTelemetry();

    return () => {
      isCancelled = true;
    };
  }, []);

  return (
    <div className="servers-page font-mono">
      <PageHeader
        index="02"
        title="MANAGED SERVERS"
        subtitle="Infrastructure VM node inventory and live telemetry state for monitored servers."
        tag="NODE INVENTORY"
      />

      {isOffline && <OfflineBanner onRetry={refetch} />}

      <div className="server-nodes-grid">
        {servers.map((srv) => {
          const isSelected = selectedHost === srv.host;
          const nodeState = nodesData[srv.host] || {};
          const nodeMetrics = nodeState.metrics;
          const isHealthy = !isOffline && nodeMetrics != null;

          return (
            <section
              key={srv.host}
              className={`server-node-card ${isSelected ? 'card-selected' : ''}`}
            >
              <div className="node-card-header">
                <div className="node-title-box">
                  <Server size={20} className={isSelected ? 'text-accent' : 'text-secondary'} />
                  <div>
                    <div className="node-name font-sans">{srv.name}</div>
                    <div className="node-sub font-mono">{srv.os}</div>
                  </div>
                </div>

                <div className="header-badges">
                  {isSelected && (
                    <span className="editorial-pill pill-healthy font-mono">
                      <CheckCircle2 size={11} /> SELECTED TARGET
                    </span>
                  )}
                  <span className={`editorial-pill ${isHealthy ? 'pill-healthy' : 'pill-critical'}`}>
                    {isHealthy ? 'ONLINE / HEALTHY' : 'OFFLINE / UNREACHABLE'}
                  </span>
                </div>
              </div>

              <div className="editorial-rule-subtle" />

              <div className="node-spec-grid font-mono">
                <div className="spec-item">
                  <span className="spec-label">HOST LABEL:</span>
                  <span className="spec-val text-accent">{srv.host}</span>
                </div>
                <div className="spec-item">
                  <span className="spec-label">TAILSCALE IP:</span>
                  <span className="spec-val">{srv.ip}</span>
                </div>
                <div className="spec-item">
                  <span className="spec-label">ROLE:</span>
                  <span className="spec-val">{srv.role}</span>
                </div>
                <div className="spec-item">
                  <span className="spec-label">UPTIME:</span>
                  <span className="spec-val">
                    {nodeMetrics?.uptime ? formatUptime(nodeMetrics.uptime) : 'N/A'}
                  </span>
                </div>
              </div>

              {/* REAL LIVE TELEMETRY STRIP */}
              <div className="node-metrics-strip margin-top-md font-mono">
                <div className="strip-metric">
                  <span className="strip-label">CPU:</span>
                  <span className="strip-val">
                    {nodeMetrics?.cpu != null ? formatPercent(nodeMetrics.cpu) : '—'}
                  </span>
                </div>
                <div className="strip-sep">/</div>
                <div className="strip-metric">
                  <span className="strip-label">RAM:</span>
                  <span className="strip-val">
                    {nodeMetrics?.memory != null ? formatPercent(nodeMetrics.memory) : '—'}
                  </span>
                </div>
                <div className="strip-sep">/</div>
                <div className="strip-metric">
                  <span className="strip-label">DISK:</span>
                  <span className="strip-val">
                    {nodeMetrics?.disk != null ? formatPercent(nodeMetrics.disk) : '—'}
                  </span>
                </div>
                <div className="strip-sep">/</div>
                <div className="strip-metric">
                  <span className="strip-label">SWAP:</span>
                  <span className="strip-val">
                    {nodeMetrics?.swap != null ? formatPercent(nodeMetrics.swap) : '—'}
                  </span>
                </div>
                <div className="strip-sep">/</div>
                <div className="strip-metric">
                  <span className="strip-label">LOAD 1M:</span>
                  <span className="strip-val">
                    {nodeMetrics?.load_1m != null ? formatNumber(nodeMetrics.load_1m, 2) : '—'}
                  </span>
                </div>
              </div>

              <div className="node-card-footer margin-top-md">
                <button
                  type="button"
                  onClick={() => selectServer(srv.host)}
                  disabled={isSelected}
                  className={`editorial-btn btn-select-node font-mono ${isSelected ? 'btn-active-node' : ''}`}
                >
                  <span>{isSelected ? 'CURRENTLY MONITORING' : 'SELECT FOR MONITORING'}</span>
                  {!isSelected && <ArrowRight size={13} />}
                </button>
              </div>
            </section>
          );
        })}
      </div>

      <style>{`
        .server-nodes-grid {
          display: flex;
          flex-direction: column;
          gap: 24px;
        }

        .server-node-card {
          background: var(--bg-surface);
          border: 1px solid var(--border-strong);
          border-left: 4px solid var(--border-strong);
          padding: 24px;
          transition: all 0.15s ease;
        }

        .server-node-card.card-selected {
          border-left: 4px solid var(--accent);
          background: var(--bg-surface);
        }

        .node-card-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          gap: 16px;
          flex-wrap: wrap;
        }

        .node-title-box {
          display: flex;
          align-items: center;
          gap: 12px;
        }

        .header-badges {
          display: flex;
          align-items: center;
          gap: 8px;
        }

        .node-name {
          font-size: 17px;
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
          grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
          gap: 16px;
          font-size: 11px;
        }

        .spec-item {
          display: flex;
          gap: 8px;
        }

        .spec-label {
          color: var(--text-tertiary);
          width: 100px;
          flex-shrink: 0;
        }

        .spec-val {
          color: var(--text-primary);
          font-weight: 500;
        }

        .node-metrics-strip {
          background: var(--bg-main);
          border: 1px solid var(--border-subtle);
          padding: 14px 18px;
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

        .node-card-footer {
          display: flex;
          justify-content: flex-end;
        }

        .btn-select-node {
          padding: 8px 18px;
          font-size: 11px;
          display: inline-flex;
          align-items: center;
          gap: 8px;
        }

        .btn-active-node {
          border-color: var(--accent-border);
          color: var(--accent);
          background: var(--bg-main);
          cursor: default;
        }

        .text-accent { color: var(--accent); }
        .text-secondary { color: var(--text-secondary); }
      `}</style>
    </div>
  );
}

export default ServersPage;
