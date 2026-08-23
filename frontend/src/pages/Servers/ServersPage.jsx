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
import { Server, CheckCircle2, ArrowRight, Cpu, HardDrive, Activity, Zap } from 'lucide-react';

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
    <div className="servers-page font-sans">
      <PageHeader
        index="02"
        title="MANAGED SERVERS"
        subtitle="Infrastructure VM inventory & physical machine node status."
        tag="NODE INVENTORY CONSOLE"
      />

      {isOffline && <OfflineBanner onRetry={refetch} />}

      <div className="server-nodes-grid margin-top-md">
        {servers.map((srv) => {
          const isSelected = selectedHost === srv.host;
          const nodeState = nodesData[srv.host] || {};
          const m = nodeState.metrics;
          const isHealthy = !isOffline && m != null;

          const cpuVal = m?.cpu != null ? m.cpu : 0;
          const memVal = m?.memory != null ? m.memory : 0;
          const diskVal = m?.disk != null ? m.disk : 0;

          return (
            <section
              key={srv.host}
              className={`neo-card physical-node-card ${isSelected ? 'card-active-target' : ''}`}
            >
              <div className="node-card-header">
                <div className="node-title-box">
                  <div className="node-icon font-mono">
                    <Server size={20} className={isSelected ? 'text-accent' : 'text-secondary'} />
                  </div>
                  <div>
                    <div className="node-name font-sans">{srv.name}</div>
                    <div className="node-sub font-mono text-tertiary">
                      {srv.os} &bull; <strong className="text-primary">{srv.ip}</strong>
                    </div>
                  </div>
                </div>

                <div className="node-badges font-mono">
                  {isSelected && (
                    <span className="editorial-pill pill-healthy">
                      <CheckCircle2 size={11} /> ACTIVE TARGET
                    </span>
                  )}
                  <span className={`editorial-pill ${isHealthy ? 'pill-healthy' : 'pill-critical'}`}>
                    {isHealthy ? 'ONLINE / HEALTHY' : 'OFFLINE / UNREACHABLE'}
                  </span>
                </div>
              </div>

              <div className="node-divider" />

              {/* Specs Grid */}
              <div className="node-specs-row font-mono">
                <div className="spec-item">
                  <span className="spec-label text-tertiary">HOST LABEL:</span>
                  <span className="spec-val text-accent font-bold">{srv.host}</span>
                </div>
                <div className="spec-item">
                  <span className="spec-label text-tertiary">TAILSCALE IP:</span>
                  <span className="spec-val text-primary font-bold">{srv.ip}</span>
                </div>
                <div className="spec-item">
                  <span className="spec-label text-tertiary">ROLE:</span>
                  <span className="spec-val text-secondary">{srv.role}</span>
                </div>
                <div className="spec-item">
                  <span className="spec-label text-tertiary">UPTIME:</span>
                  <span className="spec-val text-healthy font-bold">
                    {m?.uptime ? formatUptime(m.uptime) : 'N/A'}
                  </span>
                </div>
              </div>

              {/* Node Gauges */}
              <div className="node-gauges-grid font-mono margin-top-md">
                <div className="node-gauge-box">
                  <div className="gauge-header">
                    <Cpu size={13} className="text-accent" />
                    <span className="gauge-title text-tertiary">CPU</span>
                  </div>
                  <div className="neo-metric-num">
                    {formatNumber(cpuVal, 1)}
                    <span className="neo-metric-unit">%</span>
                  </div>
                  <div className="neo-progress-track margin-top-xs">
                    <div
                      className="neo-progress-fill bg-accent"
                      style={{ width: `${Math.min(100, Math.max(0, cpuVal))}%` }}
                    />
                  </div>
                </div>

                <div className="node-gauge-box">
                  <div className="gauge-header">
                    <Activity size={13} className="text-info" />
                    <span className="gauge-title text-tertiary">MEMORY</span>
                  </div>
                  <div className="neo-metric-num">
                    {formatNumber(memVal, 1)}
                    <span className="neo-metric-unit">%</span>
                  </div>
                  <div className="neo-progress-track margin-top-xs">
                    <div
                      className="neo-progress-fill bg-info"
                      style={{ width: `${Math.min(100, Math.max(0, memVal))}%` }}
                    />
                  </div>
                </div>

                <div className="node-gauge-box">
                  <div className="gauge-header">
                    <HardDrive size={13} className="text-warning" />
                    <span className="gauge-title text-tertiary">DISK (/)</span>
                  </div>
                  <div className="neo-metric-num">
                    {formatNumber(diskVal, 1)}
                    <span className="neo-metric-unit">%</span>
                  </div>
                  <div className="neo-progress-track margin-top-xs">
                    <div
                      className="neo-progress-fill bg-warning"
                      style={{ width: `${Math.min(100, Math.max(0, diskVal))}%` }}
                    />
                  </div>
                </div>

                <div className="node-gauge-box">
                  <div className="gauge-header">
                    <Zap size={13} className="text-accent" />
                    <span className="gauge-title text-tertiary">LOAD 1M</span>
                  </div>
                  <div className="neo-metric-num">
                    {m?.load_1m != null ? formatNumber(m.load_1m, 2) : '—'}
                  </div>
                  <div className="text-tertiary text-xs margin-top-xs">
                    SWAP: {m?.swap != null ? formatPercent(m.swap) : '—'}
                  </div>
                </div>
              </div>

              {/* Node selection footer */}
              <div className="node-card-footer margin-top-md font-mono">
                <button
                  type="button"
                  onClick={() => selectServer(srv.host)}
                  disabled={isSelected}
                  className={`neo-btn ${isSelected ? 'neo-btn-active' : 'neo-btn-primary'}`}
                >
                  <span>{isSelected ? 'CURRENTLY MONITORING NODE' : 'INSPECT & SELECT NODE'}</span>
                  {!isSelected && <ArrowRight size={13} />}
                </button>
              </div>
            </section>
          );
        })}
      </div>

      <style>{`
        .margin-top-xs { margin-top: 4px; }
        .margin-top-md { margin-top: 16px; }

        .server-nodes-grid {
          display: flex;
          flex-direction: column;
          gap: 20px;
        }

        .physical-node-card {
          padding: 22px 24px;
          border-left: 3px solid var(--border-strong);
        }

        .physical-node-card.card-active-target {
          border-left: 3px solid var(--accent);
          box-shadow: var(--shadow-raised-md);
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

        .node-icon {
          width: 40px;
          height: 40px;
          background: var(--bg-inset);
          border-radius: var(--radius-md);
          border: 1px solid var(--border-subtle);
          display: flex;
          align-items: center;
          justify-content: center;
        }

        .node-badges {
          display: flex;
          align-items: center;
          gap: 8px;
        }

        .node-name {
          font-size: 18px;
          font-weight: 700;
          color: var(--text-primary);
          letter-spacing: -0.01em;
        }

        .node-sub {
          font-size: 11px;
          margin-top: 1px;
        }

        .node-divider {
          height: 1px;
          background: var(--border-subtle);
          margin: 16px 0;
        }

        .node-specs-row {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
          gap: 12px;
          font-size: 11px;
          background: var(--bg-inset);
          border: 1px solid var(--border-subtle);
          border-radius: var(--radius-md);
          padding: 10px 14px;
        }

        .spec-item {
          display: flex;
          gap: 6px;
        }

        .spec-label {
          width: 85px;
          flex-shrink: 0;
        }

        .node-gauges-grid {
          display: grid;
          grid-template-columns: repeat(4, 1fr);
          gap: 12px;
        }

        .node-gauge-box {
          background: var(--bg-surface);
          border: 1px solid var(--border-subtle);
          border-radius: var(--radius-md);
          padding: 12px 14px;
        }

        .gauge-header {
          display: flex;
          align-items: center;
          gap: 6px;
          margin-bottom: 6px;
        }

        .gauge-title {
          font-size: 10px;
          letter-spacing: 0.05em;
        }

        .neo-progress-track {
          height: 4px;
          background: rgba(148, 163, 184, 0.2);
          border-radius: var(--radius-pill);
          overflow: hidden;
        }

        .neo-progress-fill {
          height: 100%;
          border-radius: var(--radius-pill);
        }

        .node-card-footer {
          display: flex;
          justify-content: flex-end;
        }

        .bg-accent { background: var(--accent); }
        .bg-info { background: var(--status-info); }
        .bg-warning { background: var(--status-warning); }

        .text-accent { color: var(--accent); }
        .text-info { color: var(--status-info); }
        .text-warning { color: var(--status-warning); }
        .text-healthy { color: var(--status-healthy); }
        .text-tertiary { color: var(--text-tertiary); }
        .text-secondary { color: var(--text-secondary); }
        .text-primary { color: var(--text-primary); }

        @media (max-width: 900px) {
          .node-gauges-grid {
            grid-template-columns: repeat(2, 1fr);
          }
        }
      `}</style>
    </div>
  );
}

export default ServersPage;
