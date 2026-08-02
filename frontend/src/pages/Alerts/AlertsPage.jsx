import React, { useState } from 'react';
import PageHeader from '../../components/common/PageHeader';
import EmptyState from '../../components/common/EmptyState';
import { Bell } from 'lucide-react';

export function AlertsPage() {
  const [activeTab, setActiveTab] = useState('ALL');

  const TABS = [
    { id: 'ALL', label: 'ALL ALERTS (0)' },
    { id: 'CRITICAL', label: 'CRITICAL (0)' },
    { id: 'WARNING', label: 'WARNING (0)' },
    { id: 'INFO', label: 'INFORMATIONAL (0)' },
  ];

  return (
    <div className="alerts-page">
      <PageHeader
        index="05"
        title="INCIDENT ALERTS"
        subtitle="Real-time alert dispatching for threshold breaches and predictive risks."
        tag="ALERT MANAGEMENT"
      />

      {/* Tabs */}
      <div className="tab-strip font-mono">
        {TABS.map((tab) => (
          <button
            key={tab.id}
            type="button"
            className={`editorial-btn ${activeTab === tab.id ? 'editorial-btn-active' : ''}`}
            onClick={() => setActiveTab(tab.id)}
          >
            {tab.label}
          </button>
        ))}
      </div>

      <EmptyState
        title="NO ALERT ENGINE CONNECTED"
        subtitle="Alert rules engine and notification dispatcher services are not currently active."
        statusTag="ALERT MANAGER OFFLINE"
        icon={Bell}
        technicalNotes={[
          'Alert Types: Hard threshold violation, forecasted SLA breach, Isolation Forest anomaly, health deterioration',
          'Notification Channels: Webhooks, Email, Slack, PagerDuty, SMS',
          'Severity Levels: CRITICAL (P1 - immediate action), WARNING (P2 - degraded state), INFO (P3 - audit events)',
          'Suppression & Grouping: Deduplication window 15m; alert flap prevention enabled',
        ]}
      />

      <style>{`
        .tab-strip {
          display: flex;
          gap: 10px;
          margin-bottom: 24px;
        }
      `}</style>
    </div>
  );
}

export default AlertsPage;
