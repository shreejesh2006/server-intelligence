import React, { useEffect, useState } from 'react';
import PageHeader from '../../components/common/PageHeader';
import OfflineBanner from '../../components/common/OfflineBanner';
import { useServer } from '../../context/ServerContext';
import { getCurrentMetrics } from '../../services/metrics';
import { 
  formatPercent, 
  formatUptime, 
  formatNumber,
  formatBytesPerSec
} from '../../utils/formatters';
import { 
  Server, 
  CheckCircle2, 
  ArrowRight, 
  Cpu, 
  HardDrive, 
  Activity, 
  Zap, 
  Network, 
  Layers, 
  ShieldCheck, 
  RefreshCw,
  Clock
} from 'lucide-react';

export function ServersPage({ isOffline, refetch }) {
  const { servers, selectedHost, selectServer } = useServer();
  const [loading, setLoading] = useState(true);
  const [nodesData, setNodesData] = useState({
    ubuntu: { metrics: null, loading: true, error: null },
    kali: { metrics: null, loading: true, error: null },
  });

  const loadAllNodesTelemetry = async () => {
    setLoading(true);
    try {
      const [uRes, kRes] = await Promise.all([
        getCurrentMetrics('ubuntu').catch(() => null),
        getCurrentMetrics('kali').catch(() => null),
      ]);

      setNodesData({
        ubuntu: {
          metrics: uRes?.metrics || null,
          loading: false,
          error: uRes?.status === 'success' ? null : 'Telemetry offline',
        },
        kali: {
          metrics: kRes?.metrics || null,
          loading: false,
          error: kRes?.status === 'success' ? null : 'Telemetry offline',
        },
      });
    } catch (err) {
      setNodesData({
        ubuntu: { metrics: null, loading: false, error: err.message },
        kali: { metrics: null, loading: false, error: err.message },
      });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadAllNodesTelemetry();
  }, []);

  const totalNodes = servers.length;
  const onlineCount = Object.values(nodesData).filter((n) => n.metrics != null).length;

  return (
    <div className="servers-page font-sans">
      <PageHeader
        index="02"
        title="MANAGED SERVERS"
        subtitle="Infrastructure node inventory, tailscale network endpoints, and real-time physical telemetry."
        tag="NODE INVENTORY CONSOLE"
      />

      {isOffline && <OfflineBanner onRetry={refetch} />}

      {/* INFRASTRUCTURE HEALTH SUMMARY STRIP */}
      <div className="infra-summary-strip grid-4 font-mono margin-top-md margin-bottom-lg">
        <div className="neo-card-inset summary-stat-tile">
          <div className="stat-top text-tertiary text-xs flex-center gap-xs">
            <Server size={14} className="text-accent" />
            <span>TOTAL MANAGED NODES</span>
          </div>
          <div className="stat-num font-bold text-primary margin-top-xs">
            {totalNodes} <span className="text-xs text-tertiary font-normal">NODES</span>
          </div>
          <div className="stat-sub text-healthy text-xs margin-top-xs">
            {onlineCount} OF {totalNodes} NODES ONLINE
          </div>
        </div>

        <div className="neo-card-inset summary-stat-tile">
          <div className="stat-top text-tertiary text-xs flex-center gap-xs">
            <ShieldCheck size={14} className="text-healthy" />
            <span>INFRASTRUCTURE HEALTH</span>
          </div>
          <div className="stat-num font-bold text-healthy margin-top-xs">
            {onlineCount === totalNodes ? '100%' : `${Math.round((onlineCount / totalNodes) * 100)}%`}
          </div>
          <div className="stat-sub text-tertiary text-xs margin-top-xs">
            VICTORIAMETRICS INGESTION ACTIVE
          </div>
        </div>

        <div className="neo-card-inset summary-stat-tile">
          <div className="stat-top text-tertiary text-xs flex-center gap-xs">
            <Network size={14} className="text-info" />
            <span>TAILSCALE MESH OVERLAY</span>
          </div>
          <div className="stat-num font-bold text-info margin-top-xs">
            2 ENDPOINTS
          </div>
          <div className="stat-sub text-tertiary text-xs margin-top-xs">
            100.108.160.2 / 100.83.170.83
          </div>
        </div>

        <div className="neo-card-inset summary-stat-tile flex-between align-center">
          <div>
            <div className="stat-top text-tertiary text-xs flex-center gap-xs">
              <Clock size={14} className="text-tertiary" />
              <span>TELEMETRY REFRESH</span>
            </div>
            <div className="stat-num font-bold text-primary margin-top-xs">
              30S INTERVAL
            </div>
          </div>
          <button
            type="button"
            className="neo-icon-btn"
            onClick={loadAllNodesTelemetry}
            title="Refresh Node Telemetry"
            disabled={loading}
          >
            <RefreshCw size={14} className={loading ? 'spin' : ''} />
          </button>
        </div>
      </div>

      {/* SERVER NODES CARDS LIST */}
      <div className="section-label-strip font-mono margin-bottom-sm">
        <span className="editorial-tag">01 / PHYSICAL MACHINE NODE INVENTORY ({servers.length} HOSTS)</span>
      </div>

      <div className="server-nodes-grid margin-bottom-lg">
        {servers.map((srv) => {
          const isSelected = selectedHost.toLowerCase() === srv.host.toLowerCase();
          const nodeState = nodesData[srv.host.toLowerCase()] || {};
          const m = nodeState.metrics;
          const isHealthy = !isOffline && m != null;

          const cpuVal = m?.cpu != null ? m.cpu : 0;
          const memVal = m?.memory != null ? m.memory : 0;
          const diskVal = m?.disk != null ? m.disk : 0;
          const swapVal = m?.swap != null ? m.swap : 0;
          const iowaitVal = m?.iowait != null ? m.iowait : 0;
          const rxRate = m?.network_rx != null ? m.network_rx : 0;
          const txRate = m?.network_tx != null ? m.network_tx : 0;
          const readRate = m?.disk_read != null ? m.disk_read : 0;
          const writeRate = m?.disk_write != null ? m.disk_write : 0;
          const procCount = m?.processes != null ? Math.round(m.processes) : 0;

          return (
            <section
              key={srv.host}
              className={`neo-card physical-node-card ${isSelected ? 'card-active-target' : ''}`}
            >
              {/* NODE HEADER */}
              <div className="node-card-header">
                <div className="node-title-box">
                  <div className="node-icon font-mono">
                    <Server size={22} className={isSelected ? 'text-accent' : 'text-secondary'} />
                  </div>
                  <div>
                    <div className="node-name font-sans flex-center gap-xs">
                      {srv.name}
                      <span className="editorial-tag text-tertiary">({srv.host.toUpperCase()})</span>
                    </div>
                    <div className="node-sub font-mono text-tertiary margin-top-xs">
                      {srv.os} &bull; TAILSCALE IP: <strong className="text-primary">{srv.ip}</strong>
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

              {/* NODE SPECIFICATIONS & ROLE STRIP */}
              <div className="node-specs-row font-mono">
                <div className="spec-item">
                  <span className="spec-label text-tertiary">NODE ROLE:</span>
                  <span className="spec-val text-accent font-bold">{srv.role}</span>
                </div>
                <div className="spec-item">
                  <span className="spec-label text-tertiary">CANONICAL HOST:</span>
                  <span className="spec-val text-primary font-bold">{srv.host}</span>
                </div>
                <div className="spec-item">
                  <span className="spec-label text-tertiary">IP ADDRESS:</span>
                  <span className="spec-val text-secondary">{srv.ip}</span>
                </div>
                <div className="spec-item">
                  <span className="spec-label text-tertiary">SYSTEM UPTIME:</span>
                  <span className="spec-val text-healthy font-bold">
                    {m?.uptime ? formatUptime(m.uptime) : 'N/A'}
                  </span>
                </div>
              </div>

              {/* 6-GAUGE TELEMETRY GRID */}
              <div className="node-gauges-grid font-mono margin-top-md">
                {/* 1. CPU Utilization */}
                <div className="node-gauge-box neo-card-inset">
                  <div className="gauge-header flex-between">
                    <div className="flex-center gap-xs">
                      <Cpu size={14} className="text-accent" />
                      <span className="gauge-title text-tertiary">CPU UTILIZATION</span>
                    </div>
                    <span className="text-xs text-tertiary">IO WAIT: {formatNumber(iowaitVal, 1)}%</span>
                  </div>
                  <div className="neo-metric-num margin-top-xs">
                    {formatNumber(cpuVal, 1)}
                    <span className="neo-metric-unit">%</span>
                  </div>
                  <div className="neo-progress-track margin-top-xs">
                    <div
                      className={`neo-progress-fill ${cpuVal > 85 ? 'bg-critical' : cpuVal > 70 ? 'bg-warning' : 'bg-accent'}`}
                      style={{ width: `${Math.min(100, Math.max(0, cpuVal))}%` }}
                    />
                  </div>
                </div>

                {/* 2. Memory Footprint */}
                <div className="node-gauge-box neo-card-inset">
                  <div className="gauge-header flex-between">
                    <div className="flex-center gap-xs">
                      <Activity size={14} className="text-info" />
                      <span className="gauge-title text-tertiary">RAM FOOTPRINT</span>
                    </div>
                    <span className="text-xs text-tertiary">SWAP: {formatPercent(swapVal)}</span>
                  </div>
                  <div className="neo-metric-num margin-top-xs">
                    {formatNumber(memVal, 1)}
                    <span className="neo-metric-unit">%</span>
                  </div>
                  <div className="neo-progress-track margin-top-xs">
                    <div
                      className={`neo-progress-fill ${memVal > 90 ? 'bg-critical' : memVal > 75 ? 'bg-warning' : 'bg-info'}`}
                      style={{ width: `${Math.min(100, Math.max(0, memVal))}%` }}
                    />
                  </div>
                </div>

                {/* 3. Root Disk Storage */}
                <div className="node-gauge-box neo-card-inset">
                  <div className="gauge-header flex-between">
                    <div className="flex-center gap-xs">
                      <HardDrive size={14} className="text-warning" />
                      <span className="gauge-title text-tertiary">DISK STORAGE (/)</span>
                    </div>
                    <span className="text-xs text-tertiary">R/W: {formatBytesPerSec(readRate)}</span>
                  </div>
                  <div className="neo-metric-num margin-top-xs">
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

                {/* 4. Run-Queue System Load */}
                <div className="node-gauge-box neo-card-inset">
                  <div className="gauge-header flex-between">
                    <div className="flex-center gap-xs">
                      <Zap size={14} className="text-accent" />
                      <span className="gauge-title text-tertiary">SYSTEM LOAD (1M)</span>
                    </div>
                    <span className="text-xs text-tertiary">5M/15M BREAKDOWN</span>
                  </div>
                  <div className="neo-metric-num margin-top-xs">
                    {m?.load_1m != null ? formatNumber(m.load_1m, 2) : '—'}
                  </div>
                  <div className="stat-sub text-tertiary text-xs margin-top-xs">
                    5M: {m?.load_5m != null ? formatNumber(m.load_5m, 2) : '—'} &bull; 15M: {m?.load_15m != null ? formatNumber(m.load_15m, 2) : '—'}
                  </div>
                </div>

                {/* 5. Network Throughput Rates */}
                <div className="node-gauge-box neo-card-inset">
                  <div className="gauge-header flex-between">
                    <div className="flex-center gap-xs">
                      <Network size={14} className="text-info" />
                      <span className="gauge-title text-tertiary">NETWORK THROUGHPUT</span>
                    </div>
                    <span className="text-xs text-accent">ETH0</span>
                  </div>
                  <div className="network-rates-col margin-top-xs">
                    <div className="rate-line text-xs">
                      <span className="text-tertiary">RX (INGRESS):</span>
                      <span className="font-bold text-accent">{formatBytesPerSec(rxRate)}</span>
                    </div>
                    <div className="rate-line text-xs margin-top-xs">
                      <span className="text-tertiary">TX (EGRESS):</span>
                      <span className="font-bold text-warning">{formatBytesPerSec(txRate)}</span>
                    </div>
                  </div>
                </div>

                {/* 6. Active Process Count */}
                <div className="node-gauge-box neo-card-inset">
                  <div className="gauge-header flex-between">
                    <div className="flex-center gap-xs">
                      <Layers size={14} className="text-primary" />
                      <span className="gauge-title text-tertiary">ACTIVE PROCESSES</span>
                    </div>
                    <span className="text-xs text-tertiary">THREAD POOL</span>
                  </div>
                  <div className="neo-metric-num margin-top-xs text-primary">
                    {procCount > 0 ? procCount : '—'}
                  </div>
                  <div className="stat-sub text-tertiary text-xs margin-top-xs">
                    CPU IOWAIT: {formatNumber(iowaitVal, 2)}%
                  </div>
                </div>
              </div>

              {/* NODE SELECTION FOOTER */}
              <div className="node-card-footer margin-top-md font-mono flex-between align-center">
                <span className="text-xs text-tertiary">
                  LAST MONITORED: <strong className="text-secondary">{isHealthy ? 'LIVE' : 'DISCONNECTED'}</strong>
                </span>
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
        .margin-top-xs { margin-top: 6px; }
        .margin-top-md { margin-top: 20px; }
        .margin-bottom-sm { margin-bottom: 12px; }
        .margin-bottom-lg { margin-bottom: 28px; }
        .flex-center { display: flex; align-items: center; }
        .flex-between { display: flex; justify-content: space-between; align-items: center; }
        .gap-xs { gap: 6px; }
        .align-center { align-items: center; }

        .infra-summary-strip {
          display: grid;
          grid-template-columns: repeat(4, 1fr);
          gap: 16px;
        }

        .summary-stat-tile {
          padding: 16px 18px;
          display: flex;
          flex-direction: column;
          justify-content: space-between;
        }

        .stat-num {
          font-size: 20px;
          line-height: 1.2;
        }

        .server-nodes-grid {
          display: flex;
          flex-direction: column;
          gap: 24px;
        }

        .physical-node-card {
          padding: 24px;
          border-left: 4px solid var(--border-strong);
        }

        .physical-node-card.card-active-target {
          border-left: 4px solid var(--accent);
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
          gap: 14px;
        }

        .node-icon {
          width: 44px;
          height: 44px;
          background: var(--bg-inset);
          border-radius: var(--radius-md);
          border: 1px solid var(--border-subtle);
          box-shadow: var(--shadow-inset-sm);
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
          font-size: 20px;
          font-weight: 800;
          color: var(--text-primary);
          letter-spacing: -0.01em;
        }

        .node-sub {
          font-size: 11px;
        }

        .node-divider {
          height: 1px;
          background: var(--border-subtle);
          margin: 18px 0;
        }

        .node-specs-row {
          display: grid;
          grid-template-columns: repeat(4, 1fr);
          gap: 12px;
          font-size: 11px;
          background: var(--bg-inset);
          border: 1px solid var(--border-subtle);
          border-radius: var(--radius-md);
          padding: 12px 16px;
        }

        .spec-item {
          display: flex;
          gap: 8px;
        }

        .node-gauges-grid {
          display: grid;
          grid-template-columns: repeat(3, 1fr);
          gap: 16px;
        }

        .node-gauge-box {
          padding: 14px 16px;
          border-radius: var(--radius-md);
          display: flex;
          flex-direction: column;
          justify-content: space-between;
        }

        .gauge-title {
          font-size: 10px;
          letter-spacing: 0.06em;
          font-weight: 700;
        }

        .network-rates-col {
          display: flex;
          flex-direction: column;
          gap: 4px;
        }

        .rate-line {
          display: flex;
          justify-content: space-between;
        }

        .neo-progress-track {
          height: 5px;
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
          justify-content: space-between;
          align-items: center;
          border-top: 1px dashed var(--border-subtle);
          padding-top: 14px;
        }

        .spin {
          animation: spin 1s linear infinite;
        }

        @keyframes spin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }

        .bg-accent { background: var(--accent); }
        .bg-info { background: var(--status-info); }
        .bg-warning { background: var(--status-warning); }
        .bg-critical { background: var(--status-critical); }

        .text-accent { color: var(--accent); }
        .text-info { color: var(--status-info); }
        .text-warning { color: var(--status-warning); }
        .text-critical { color: var(--status-critical); }
        .text-healthy { color: var(--status-healthy); }
        .text-tertiary { color: var(--text-tertiary); }
        .text-secondary { color: var(--text-secondary); }
        .text-primary { color: var(--text-primary); }

        @media (max-width: 1200px) {
          .infra-summary-strip {
            grid-template-columns: repeat(2, 1fr);
          }
          .node-gauges-grid {
            grid-template-columns: repeat(2, 1fr);
          }
          .node-specs-row {
            grid-template-columns: repeat(2, 1fr);
          }
        }

        @media (max-width: 768px) {
          .infra-summary-strip {
            grid-template-columns: 1fr;
          }
          .node-gauges-grid {
            grid-template-columns: 1fr;
          }
          .node-specs-row {
            grid-template-columns: 1fr;
          }
        }
      `}</style>
    </div>
  );
}

export default ServersPage;
