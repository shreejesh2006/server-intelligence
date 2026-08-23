import React, { useState } from 'react';
import PageHeader from '../../components/common/PageHeader';
import { Bell, CheckCircle2, Filter } from 'lucide-react';

export function AlertsPage() {
  const [activeTab, setActiveTab] = useState('ALL');

  const TABS = [
    { id: 'ALL', label: 'ALL EVENTS (0)' },
    { id: 'CRITICAL', label: 'CRITICAL (0)' },
    { id: 'WARNING', label: 'WARNING (0)' },
    { id: 'INFO', label: 'INFORMATIONAL (0)' },
    { id: 'RESOLVED', label: 'RESOLVED (0)' },
  ];

  return (
    <div className="alerts-page font-sans">
      <PageHeader
        index="05"
        title="INCIDENT ALERTS"
        subtitle="Real-time alert dispatching for threshold breaches, anomaly events, and capacity risks."
        tag="ALERT DISPATCH CONSOLE"
      />

      {/* Segmented Filter Control */}
      <section className="neo-card font-mono margin-top-md margin-bottom-lg">
        <div className="alert-filter-bar">
          <div className="filter-left">
            <Filter size={14} className="text-accent" />
            <span className="editorial-tag">EVENT FILTER:</span>
            <div className="neo-segmented-track">
              {TABS.map((tab) => (
                <button
                  key={tab.id}
                  type="button"
                  className={`neo-segmented-item ${activeTab === tab.id ? 'active' : ''}`}
                  onClick={() => setActiveTab(tab.id)}
                >
                  {tab.label}
                </button>
              ))}
            </div>
          </div>

          <span className="editorial-pill pill-healthy font-mono">
            <CheckCircle2 size={11} /> RULES ENGINE READY
          </span>
        </div>
      </section>

      {/* ALERT COMMAND CENTER HERO */}
      <section className="neo-card neo-card-raised font-mono margin-bottom-lg">
        <div className="alert-hero-row">
          <div className="hero-left">
            <div className="alert-icon-box">
              <Bell size={22} className="text-accent" />
            </div>
            <div>
              <div className="alert-title font-sans">ACTIVE ALERT MANAGER</div>
              <div className="alert-sub text-tertiary">
                0 ACTIVE CRITICAL ALERTS &bull; 0 UNRESOLVED INCIDENTS
              </div>
            </div>
          </div>

          <div className="hero-right">
            <span className="editorial-pill pill-neutral">DEDUPLICATION: 15M WINDOW</span>
          </div>
        </div>
      </section>

      {/* NO ALERTS STATE — NEUMORPHIC INSET CARD */}
      <div className="neo-card-inset empty-alerts-card font-mono margin-bottom-lg">
        <div className="empty-content">
          <CheckCircle2 size={32} className="text-healthy margin-bottom-xs" />
          <h4 className="empty-title font-sans text-primary">NO ACTIVE INCIDENT ALERTS</h4>
          <p className="empty-desc text-secondary font-sans text-xs">
            All monitored nodes (Ubuntu and Kali) are operating within nominal thresholds. No active alert triggers detected in current evaluation window.
          </p>
        </div>
      </div>

      {/* DISPATCH SPECIFICATIONS & CHANNELS */}
      <section className="neo-card-dashed font-mono">
        <div className="specs-header border-bottom padding-bottom-sm">
          <span className="editorial-tag font-bold">01 / ALERT DISPATCHER SPECIFICATIONS & CHANNELS</span>
        </div>

        <div className="specs-grid margin-top-md">
          <div className="neo-card-inset spec-card">
            <span className="spec-card-title text-tertiary">EVALUATION TRIGGERS</span>
            <span className="spec-card-body text-accent font-bold">Multi-dimensional Thresholds</span>
            <p className="spec-desc text-secondary">Hard metrics (&gt;85% CPU, &gt;90% RAM), Isolation Forest anomaly scores, and ML capacity forecasts.</p>
          </div>

          <div className="neo-card-inset spec-card">
            <span className="spec-card-title text-tertiary">DISPATCH CHANNELS</span>
            <span className="spec-card-body text-primary font-bold">Webhooks, Slack, PagerDuty</span>
            <p className="spec-desc text-secondary">Asynchronous alert dispatching with emergency escalation routing.</p>
          </div>

          <div className="neo-card-inset spec-card">
            <span className="spec-card-title text-tertiary">FLAP PREVENTION</span>
            <span className="spec-card-body text-healthy font-bold">Enabled (15m Hysteresis)</span>
            <p className="spec-desc text-secondary">Automatic deduplication and alert flap dampening to prevent notification noise.</p>
          </div>
        </div>
      </section>

      <style>{`
        .margin-top-xs { margin-top: 6px; }
        .margin-top-md { margin-top: 20px; }
        .margin-bottom-xs { margin-bottom: 8px; }
        .margin-bottom-lg { margin-bottom: 28px; }

        .alert-filter-bar {
          display: flex;
          justify-content: space-between;
          align-items: center;
          gap: 16px;
          flex-wrap: wrap;
        }

        .filter-left {
          display: flex;
          align-items: center;
          gap: 12px;
          flex-wrap: wrap;
        }

        .alert-hero-row {
          display: flex;
          justify-content: space-between;
          align-items: center;
          padding: 8px;
          gap: 16px;
          flex-wrap: wrap;
        }

        .hero-left {
          display: flex;
          align-items: center;
          gap: 14px;
        }

        .alert-icon-box {
          width: 44px;
          height: 44px;
          background: var(--bg-inset);
          box-shadow: var(--shadow-inset-sm);
          border-radius: var(--radius-md);
          border: 1px solid var(--border-subtle);
          display: flex;
          align-items: center;
          justify-content: center;
        }

        .alert-title {
          font-size: 16px;
          font-weight: 800;
          color: var(--text-primary);
        }

        .alert-sub {
          font-size: 11px;
          margin-top: 2px;
        }

        .empty-alerts-card {
          padding: 42px 24px;
          text-align: center;
          border-radius: var(--radius-lg);
        }

        .empty-content {
          max-width: 540px;
          margin: 0 auto;
          display: flex;
          flex-direction: column;
          align-items: center;
        }

        .empty-title {
          font-size: 15px;
          font-weight: 700;
          letter-spacing: 0.04em;
        }

        .empty-desc {
          margin-top: 6px;
          line-height: 1.5;
        }

        .specs-grid {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(260px, 1fr));
          gap: 16px;
        }

        .spec-card {
          padding: 16px;
          border-radius: var(--radius-md);
          display: flex;
          flex-direction: column;
          gap: 6px;
        }

        .spec-card-title {
          font-size: 10px;
          letter-spacing: 0.08em;
        }

        .spec-card-body {
          font-size: 13px;
        }

        .spec-desc {
          font-size: 11px;
          line-height: 1.4;
          margin-top: 4px;
        }

        .border-bottom { border-bottom: 1px solid var(--border-subtle); }
        .padding-bottom-sm { padding-bottom: 10px; }

        .text-accent { color: var(--accent); }
        .text-healthy { color: var(--status-healthy); }
        .text-tertiary { color: var(--text-tertiary); }
        .text-secondary { color: var(--text-secondary); }
        .text-primary { color: var(--text-primary); }
      `}</style>
    </div>
  );
}

export default AlertsPage;
