import React from 'react';
import PageHeader from '../../components/common/PageHeader';
import { Sliders, Shield, Database, Bell, Lock, Sun, Moon } from 'lucide-react';
import { useTheme } from '../../context/ThemeContext';

export function SettingsPage() {
  const { theme, toggleTheme } = useTheme();

  return (
    <div className="settings-page font-mono">
      <PageHeader
        index="08"
        title="SYSTEM SETTINGS"
        subtitle="Global platform configuration, metric collection parameters, and security policies."
        tag="PLATFORM CONFIGURATION"
      />

      <div className="settings-sections">
        {/* Monitoring Settings */}
        <section className="settings-card">
          <div className="settings-card-header">
            <div className="title-with-icon">
              <Database size={16} className="text-accent" />
              <h3 className="section-title">01 / MONITORING & COLLECTOR</h3>
            </div>
            <span className="editorial-pill pill-healthy font-mono">ACTIVE ENGINE</span>
          </div>

          <div className="setting-row">
            <div className="setting-info">
              <div className="setting-name">COLLECTION INTERVAL</div>
              <div className="setting-desc font-sans text-xs text-secondary">
                Frequency at which the Python metric collector scrapes system metrics.
              </div>
            </div>
            <div className="setting-control font-mono">
              <input
                type="text"
                readOnly
                value="30 SECONDS"
                className="editorial-input"
              />
              <span className="control-note">READ-ONLY (ACTIVE CONFIG)</span>
            </div>
          </div>

          <div className="setting-row">
            <div className="setting-info">
              <div className="setting-name">FASTAPI BACKEND TARGET URL</div>
              <div className="setting-desc font-sans text-xs text-secondary">
                Base URL endpoint for authentication and telemetry metrics API.
              </div>
            </div>
            <div className="setting-control">
              <input
                type="text"
                readOnly
                value="same-origin /api -> http://192.168.64.22:8000"
                className="editorial-input"
              />
              <span className="control-note">VITE PROXY GATEWAY</span>
            </div>
          </div>
        </section>

        {/* Visual Theme Settings */}
        <section className="settings-card">
          <div className="settings-card-header">
            <div className="title-with-icon">
              {theme === 'dark' ? <Moon size={16} className="text-accent" /> : <Sun size={16} className="text-accent" />}
              <h3 className="section-title">02 / VISUAL THEME & DISPLAY</h3>
            </div>
            <span className="editorial-pill pill-healthy">SYSTEM PREFERENCE PERSISTED</span>
          </div>

          <div className="setting-row">
            <div className="setting-info">
              <div className="setting-name">EDITORIAL COLOR MODE</div>
              <div className="setting-desc font-sans text-xs text-secondary">
                Toggle between Dark Graphite and Light Paper technical editorial themes.
              </div>
            </div>
            <div className="setting-control">
              <button
                type="button"
                onClick={toggleTheme}
                className="editorial-btn"
              >
                {theme === 'dark' ? <Moon size={12} /> : <Sun size={12} />}
                <span>CURRENT THEME: {theme.toUpperCase()}</span>
              </button>
            </div>
          </div>
        </section>

        {/* Forecasting & AI Engine */}
        <section className="settings-card">
          <div className="settings-card-header">
            <div className="title-with-icon">
              <Sliders size={16} className="text-accent" />
              <h3 className="section-title">03 / FORECASTING & AI ENGINE</h3>
            </div>
            <span className="editorial-pill pill-neutral">PENDING API</span>
          </div>

          <div className="setting-row">
            <div className="setting-info">
              <div className="setting-name">PATCHTST MODEL HORIZON</div>
              <div className="setting-desc font-sans text-xs text-secondary">
                Default multi-step prediction window for capacity forecasting.
              </div>
            </div>
            <div className="setting-control">
              <select disabled className="editorial-select">
                <option>30 MINUTES (DEFAULT)</option>
              </select>
            </div>
          </div>
        </section>

        {/* Alert Thresholds */}
        <section className="settings-card">
          <div className="settings-card-header">
            <div className="title-with-icon">
              <Bell size={16} className="text-accent" />
              <h3 className="section-title">04 / ALERT THRESHOLDS</h3>
            </div>
            <span className="editorial-pill pill-neutral">READ-ONLY PREVIEW</span>
          </div>

          <div className="setting-row">
            <div className="setting-info">
              <div className="setting-name">CPU CRITICAL THRESHOLD</div>
              <div className="setting-desc font-sans text-xs text-secondary">
                Sustained utilization trigger level for critical alerts.
              </div>
            </div>
            <div className="setting-control">
              <input type="text" readOnly value="85.0%" className="editorial-input" />
            </div>
          </div>

          <div className="setting-row">
            <div className="setting-info">
              <div className="setting-name">MEMORY CRITICAL THRESHOLD</div>
              <div className="setting-desc font-sans text-xs text-secondary">
                RAM saturation level before dispatching incident warning.
              </div>
            </div>
            <div className="setting-control">
              <input type="text" readOnly value="90.0%" className="editorial-input" />
            </div>
          </div>
        </section>

        {/* Security & GeoLock */}
        <section className="settings-card">
          <div className="settings-card-header">
            <div className="title-with-icon">
              <Lock size={16} className="text-accent" />
              <h3 className="section-title">05 / SECURITY & GEOLOCK</h3>
            </div>
            <span className="editorial-pill pill-neutral">ENFORCEMENT READY</span>
          </div>

          <div className="setting-row">
            <div className="setting-info">
              <div className="setting-name">GEOLOCK IP FILTERING</div>
              <div className="setting-desc font-sans text-xs text-secondary">
                Restrict access to verified subnet ranges only.
              </div>
            </div>
            <div className="setting-control">
              <span className="editorial-pill pill-healthy">ENABLED (SUBNET MATCH)</span>
            </div>
          </div>
        </section>
      </div>

      <style>{`
        .settings-sections {
          display: flex;
          flex-direction: column;
          gap: 24px;
        }

        .settings-card {
          background: var(--bg-surface);
          border: 1px solid var(--border-strong);
          padding: 24px 28px;
        }

        .settings-card-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          padding-bottom: 14px;
          border-bottom: 1px solid var(--border-subtle);
          margin-bottom: 20px;
        }

        .title-with-icon {
          display: flex;
          align-items: center;
          gap: 10px;
        }

        .section-title {
          font-size: 13px;
          font-weight: 700;
          color: var(--text-primary);
          letter-spacing: 0.05em;
        }

        .text-accent {
          color: var(--accent);
        }

        .setting-row {
          display: flex;
          justify-content: space-between;
          align-items: center;
          padding: 14px 0;
          border-bottom: 1px solid var(--border-subtle);
          gap: 20px;
        }

        .setting-row:last-child {
          border-bottom: none;
        }

        .setting-name {
          font-size: 11px;
          font-weight: 600;
          color: var(--text-primary);
          letter-spacing: 0.05em;
        }

        .setting-control {
          display: flex;
          flex-direction: column;
          align-items: flex-end;
          gap: 4px;
        }

        .editorial-input, .editorial-select {
          background: var(--bg-main);
          border: 1px solid var(--border-strong);
          color: var(--text-primary);
          padding: 6px 12px;
          font-family: var(--font-mono);
          font-size: 11px;
          text-align: right;
        }

        .editorial-select:disabled {
          opacity: 0.6;
        }

        .control-note {
          font-size: 9px;
          color: var(--text-tertiary);
        }
      `}</style>
    </div>
  );
}

export default SettingsPage;
