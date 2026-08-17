import React, { useState, useEffect } from 'react';
import PageHeader from '../../components/common/PageHeader';
import { 
  Database, 
  Bell, 
  Lock, 
  Sun, 
  Moon, 
  Clock, 
  Sliders, 
  CheckCircle2, 
  AlertCircle,
  Save
} from 'lucide-react';
import { useTheme } from '../../context/ThemeContext';
import { useTimezone } from '../../context/TimezoneContext';
import { useAuth } from '../../context/AuthContext';
export function SettingsPage() {
  const { theme, toggleTheme } = useTheme();
  const { timezone, setTimezone, formatTimestamp, TIMEZONE_OPTIONS } = useTimezone();
  const { user } = useAuth();
  const isAdmin = user?.role === 'ADMIN';

  const nowSeconds = Math.floor(Date.now() / 1000);
  const livePreviewTime = formatTimestamp(nowSeconds, true);

  const [notice, setNotice] = useState(null);
  const [error, setError] = useState(null);

  // Auto-dismiss notice
  useEffect(() => {
    if (notice) {
      const timer = setTimeout(() => setNotice(null), 4000);
      return () => clearTimeout(timer);
    }
  }, [notice]);

  // Handle smooth scroll anchor for #ai-assistant
  useEffect(() => {
    if (window.location.hash === '#ai-assistant') {
      const el = document.getElementById('ai-assistant');
      if (el) {
        setTimeout(() => el.scrollIntoView({ behavior: 'smooth' }), 100);
      }
    }
  }, []);

  return (
    <div className="settings-page font-mono">
      <PageHeader
        index="09"
        title="SYSTEM SETTINGS"

        subtitle="Global platform configuration, metric collection parameters, and security policies."
        tag="PLATFORM CONFIGURATION"
      />

      {/* Feedback Notices */}
      {notice && (
        <div className="editorial-notice-banner notice-success mb-4">
          <CheckCircle2 size={15} />
          <span>{notice}</span>
          <button type="button" onClick={() => setNotice(null)} className="notice-close">✕</button>
        </div>
      )}

      {error && (
        <div className="editorial-notice-banner notice-error mb-4">
          <AlertCircle size={15} />
          <span>{error}</span>
          <button type="button" onClick={() => setError(null)} className="notice-close">✕</button>
        </div>
      )}

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

        {/* Visual Theme & Timezone Settings */}
        <section className="settings-card">
          <div className="settings-card-header">
            <div className="title-with-icon">
              <Clock size={16} className="text-accent" />
              <h3 className="section-title">02 / VISUAL THEME & TIMEZONE PREFERENCE</h3>
            </div>
            <span className="editorial-pill pill-healthy">USER PREFERENCE PERSISTED</span>
          </div>

          <div className="setting-row">
            <div className="setting-info">
              <div className="setting-name">DISPLAY TIMEZONE</div>
              <div className="setting-desc font-sans text-xs text-secondary">
                Timezone formatting for live telemetry updates, chart axes, and logs.
              </div>
            </div>
            <div className="setting-control">
              <select
                value={timezone}
                onChange={(e) => setTimezone(e.target.value)}
                className="editorial-select timezone-select"
              >
                {TIMEZONE_OPTIONS.map((opt) => (
                  <option key={opt.id} value={opt.id}>
                    {opt.name}
                  </option>
                ))}
              </select>
              <span className="control-note">PREVIEW: {livePreviewTime}</span>
            </div>
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

        .timezone-select {
          cursor: pointer;
          min-width: 220px;
        }

        .editorial-select:disabled {
          opacity: 0.6;
        }

        .control-note {
          font-size: 9px;
          color: var(--text-tertiary);
        }

        .editorial-notice-banner {
          padding: 10px 16px;
          font-size: 11px;
          display: flex;
          align-items: center;
          gap: 10px;
        }

        .notice-success {
          background: rgba(34, 197, 94, 0.1);
          border: 1px solid rgba(34, 197, 94, 0.3);
          border-left: 3px solid var(--status-healthy);
          color: var(--status-healthy);
        }

        .notice-error {
          background: rgba(239, 68, 68, 0.1);
          border: 1px solid rgba(239, 68, 68, 0.3);
          border-left: 3px solid var(--status-critical);
          color: var(--status-critical);
        }

        .notice-close {
          margin-left: auto;
          background: transparent;
          border: none;
          color: inherit;
          cursor: pointer;
        }

        .mb-4 { margin-bottom: 16px; }
        .spinning { animation: spin 1s linear infinite; }
        @keyframes spin { 100% { transform: rotate(360deg); } }
      `}</style>
    </div>
  );
}

export default SettingsPage;
