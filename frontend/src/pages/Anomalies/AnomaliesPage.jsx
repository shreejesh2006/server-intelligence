import React from 'react';
import PageHeader from '../../components/common/PageHeader';
import EmptyState from '../../components/common/EmptyState';
import { AlertTriangle, ShieldCheck, Activity } from 'lucide-react';

export function AnomaliesPage() {
  return (
    <div className="anomalies-page">
      <PageHeader
        index="04"
        title="ANOMALY DETECTION"
        subtitle="Unsupervised outlier identification in multi-dimensional server telemetry."
        tag="SECURITY & HEALTH OBSERVABILITY"
      />

      <EmptyState
        title="NO ANOMALY MODEL CONNECTED"
        subtitle="The Isolation Forest / Autoencoder anomaly detection pipeline is currently offline or unconfigured."
        statusTag="ANOMALY ENGINE OFFLINE"
        icon={AlertTriangle}
        technicalNotes={[
          'Model Type: Isolation Forest (iForest) for high-dimensional feature anomaly scoring',
          'Feature Space: CPU spikes, unexpected process inflation, disk I/O surges, memory leakage',
          'Anomaly Score Threshold: Standardized score scale [0.0 - 1.0]; flagged if score > 0.75',
          'Automated Action: Real-time alert dispatch to operational channels and incident logs',
        ]}
      />

      {/* Reserved Table Structure */}
      <section className="anomalies-table-section font-mono">
        <div className="section-top">
          <div>
            <span className="editorial-tag font-bold">ANOMALY EVENT LOG</span>
            <p className="editorial-subtitle font-sans text-xs text-secondary mt-1">
              Historical record of multi-variate statistical anomalies detected across metrics.
            </p>
          </div>
          <span className="editorial-pill pill-neutral">0 EVENTS LOGGED</span>
        </div>

        <table className="editorial-table">
          <thead>
            <tr>
              <th>TIMESTAMP</th>
              <th>TARGET METRIC</th>
              <th>OBSERVED VALUE</th>
              <th>ANOMALY SCORE</th>
              <th>SEVERITY</th>
              <th>EVALUATION STATUS</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td colSpan="6" className="text-center py-6 text-tertiary">
                NO ANOMALOUS BEHAVIOR FLAGGED IN CURRENT MONITORING WINDOW
              </td>
            </tr>
          </tbody>
        </table>
      </section>

      <style>{`
        .anomalies-table-section {
          background: var(--bg-surface);
          border: 1px solid var(--border-strong);
          padding: 24px;
          margin-top: 24px;
        }

        .section-top {
          display: flex;
          justify-content: space-between;
          align-items: flex-start;
          padding-bottom: 16px;
          border-bottom: 1px solid var(--border-subtle);
          margin-bottom: 16px;
        }

        .py-6 { padding-top: 24px; padding-bottom: 24px; }
        .text-center { text-align: center; }
        .text-tertiary { color: var(--text-tertiary); }
      `}</style>
    </div>
  );
}

export default AnomaliesPage;
