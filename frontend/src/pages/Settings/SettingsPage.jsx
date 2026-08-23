import React, { useState, useEffect } from 'react';
import PageHeader from '../../components/common/PageHeader';
import { 
  Database, 
  Lock, 
  Sun, 
  Moon, 
  Clock, 
  CheckCircle2, 
  AlertCircle,
  Bot,
  Save,
  RefreshCw,
  Trash2
} from 'lucide-react';
import { useTheme } from '../../context/ThemeContext';
import { useTimezone } from '../../context/TimezoneContext';
import { useAuth } from '../../context/AuthContext';
import { 
  getAiSettingsApi, 
  updateAiSettingsApi, 
  deleteAiKeyApi 
} from '../../services/ai';

export function SettingsPage() {
  const { theme = 'light', toggleTheme } = useTheme();
  const { timezone = 'UTC', setTimezone, formatTimestamp, TIMEZONE_OPTIONS = [] } = useTimezone();
  const { user } = useAuth();
  const isAdmin = user?.role === 'ADMIN';

  const nowSeconds = Math.floor(Date.now() / 1000);
  const livePreviewTime = formatTimestamp ? formatTimestamp(nowSeconds, true) : 'NOW';

  const [notice, setNotice] = useState(null);
  const [error, setError] = useState(null);

  // AI Settings State
  const [aiProvider, setAiProvider] = useState('ollama');
  const [aiModel, setAiModel] = useState('llama3');
  const [aiApiKey, setAiApiKey] = useState('');
  const [aiEnabled, setAiEnabled] = useState(true);
  const [aiHasKey, setAiHasKey] = useState(false);
  const [loadingAi, setLoadingAi] = useState(false);
  const [savingAi, setSavingAi] = useState(false);

  // Auto-dismiss notice
  useEffect(() => {
    if (notice) {
      const timer = setTimeout(() => setNotice(null), 4000);
      return () => clearTimeout(timer);
    }
  }, [notice]);

  // Fetch AI configuration on load if admin
  useEffect(() => {
    let isCancelled = false;

    async function loadAiSettings() {
      if (!isAdmin) return;
      setLoadingAi(true);

      try {
        const config = await getAiSettingsApi();
        if (!isCancelled && config) {
          setAiProvider(config.provider || 'ollama');
          setAiModel(config.model || 'llama3');
          setAiEnabled(config.enabled ?? true);
          setAiHasKey(config.has_key ?? false);
        }
      } catch (err) {
        if (!isCancelled && import.meta.env.DEV) {
          console.warn('AI Settings fetch error:', err);
        }
      } finally {
        if (!isCancelled) {
          setLoadingAi(false);
        }
      }
    }

    loadAiSettings();

    return () => {
      isCancelled = true;
    };
  }, [isAdmin]);

  // Handle smooth scroll anchor for #ai-assistant
  useEffect(() => {
    if (window.location.hash === '#ai-assistant') {
      const el = document.getElementById('ai-assistant');
      if (el) {
        setTimeout(() => el.scrollIntoView({ behavior: 'smooth' }), 100);
      }
    }
  }, []);

  // Save AI settings
  const handleSaveAiSettings = async (e) => {
    e.preventDefault();
    if (!isAdmin || savingAi) return;

    setSavingAi(true);
    setNotice(null);
    setError(null);

    try {
      const payload = {
        provider: aiProvider,
        model: aiModel,
        enabled: aiEnabled,
      };

      if (aiApiKey.trim()) {
        payload.api_key = aiApiKey.trim();
      }

      const res = await updateAiSettingsApi(payload);
      setNotice('AI Assistant configuration updated successfully.');
      setAiHasKey(res.has_key ?? !!aiApiKey.trim());
      setAiApiKey('');
    } catch (err) {
      setError(err?.response?.data?.detail || 'Failed to save AI settings.');
    } finally {
      setSavingAi(false);
    }
  };

  // Delete saved AI Key
  const handleDeleteAiKey = async () => {
    if (!isAdmin || savingAi) return;
    setSavingAi(true);

    try {
      await deleteAiKeyApi();
      setNotice('Saved AI API Key removed.');
      setAiHasKey(false);
    } catch (err) {
      setError(err?.response?.data?.detail || 'Failed to remove API key.');
    } finally {
      setSavingAi(false);
    }
  };

  const isDarkMode = theme === 'dark';

  return (
    <div className="settings-page font-sans">
      <PageHeader
        index="09"
        title="SYSTEM SETTINGS"
        subtitle="Global platform configuration, visual theme preferences, and security policies."
        tag="PLATFORM CONFIGURATION"
      />

      {/* Global Alerts */}
      {notice && (
        <div className="editorial-notice-banner notice-success font-mono margin-bottom-md">
          <CheckCircle2 size={14} />
          <span>{notice}</span>
          <button type="button" onClick={() => setNotice(null)} className="notice-close">✕</button>
        </div>
      )}

      {error && (
        <div className="editorial-notice-banner notice-error font-mono margin-bottom-md">
          <AlertCircle size={14} />
          <span>{error}</span>
          <button type="button" onClick={() => setError(null)} className="notice-close">✕</button>
        </div>
      )}

      <div className="settings-cards-grid">
        {/* 1. VISUAL THEME & TIMEZONE PREFERENCES */}
        <section className="neo-card settings-card font-mono">
          <div className="card-header border-bottom padding-bottom-xs">
            <div className="title-box">
              <Clock size={16} className="text-accent" />
              <span className="editorial-tag">VISUAL THEME & TIMEZONE PREFERENCES</span>
            </div>
            <span className="editorial-pill pill-healthy">USER PERSISTED</span>
          </div>

          <div className="setting-row margin-top-md">
            <div className="row-info">
              <div className="setting-title font-sans">DISPLAY TIMEZONE</div>
              <div className="setting-desc font-sans text-xs text-secondary">
                Timezone formatting for live telemetry updates, chart axes, and incident logs.
              </div>
            </div>
            <div className="row-control">
              <select
                value={timezone}
                onChange={(e) => setTimezone && setTimezone(e.target.value)}
                className="neo-select select-tz"
              >
                {TIMEZONE_OPTIONS.map((opt) => (
                  <option key={opt.id} value={opt.id}>
                    {opt.name}
                  </option>
                ))}
              </select>
              <span className="control-subtext text-tertiary text-xs">PREVIEW: {livePreviewTime}</span>
            </div>
          </div>

          <div className="setting-row margin-top-md">
            <div className="row-info">
              <div className="setting-title font-sans">EDITORIAL COLOR MODE</div>
              <div className="setting-desc font-sans text-xs text-secondary">
                Toggle between Light Paper Industrial and Dark Graphite technical editorial themes.
              </div>
            </div>
            <div className="row-control">
              <button
                type="button"
                onClick={toggleTheme}
                className="neo-btn"
              >
                {isDarkMode ? <Moon size={13} /> : <Sun size={13} />}
                <span>CURRENT MODE: {isDarkMode ? 'DARK' : 'LIGHT'}</span>
              </button>
            </div>
          </div>
        </section>

        {/* 2. AI ASSISTANT CONFIGURATION */}
        <section id="ai-assistant" className="neo-card settings-card font-mono">
          <div className="card-header border-bottom padding-bottom-xs">
            <div className="title-box">
              <Bot size={16} className="text-accent" />
              <span className="editorial-tag">AI ENGINEERING COPILOT CONFIGURATION</span>
            </div>
            <span className={`editorial-pill ${aiEnabled ? 'pill-healthy' : 'pill-neutral'}`}>
              {aiEnabled ? 'COPILOT ENABLED' : 'COPILOT DISABLED'}
            </span>
          </div>

          {!isAdmin ? (
            <div className="setting-row margin-top-md">
              <div className="setting-desc font-sans text-xs text-tertiary">
                AI Assistant provider settings are read-only for non-admin accounts. Contact an administrator to update Ollama/LLM configuration.
              </div>
            </div>
          ) : loadingAi ? (
            <div className="loading-box text-tertiary text-xs padding-md margin-top-md">
              <RefreshCw size={14} className="spinning text-accent" />
              <span>LOADING COPILOT SETTINGS...</span>
            </div>
          ) : (
            <form onSubmit={handleSaveAiSettings} className="margin-top-md">
              <div className="setting-row">
                <div className="row-info">
                  <div className="setting-title font-sans">COPILOT SERVICE STATUS</div>
                  <div className="setting-desc font-sans text-xs text-secondary">
                    Enable or disable the local AI copilot chat interface across the platform.
                  </div>
                </div>
                <div className="row-control">
                  <button
                    type="button"
                    onClick={() => setAiEnabled((prev) => !prev)}
                    className={`neo-btn ${aiEnabled ? 'neo-btn-active' : ''}`}
                  >
                    <span>{aiEnabled ? 'ENABLED' : 'DISABLED'}</span>
                  </button>
                </div>
              </div>

              <div className="setting-row margin-top-md">
                <div className="row-info">
                  <div className="setting-title font-sans">AI PROVIDER ENGINE</div>
                  <div className="setting-desc font-sans text-xs text-secondary">
                    Target LLM inference backend engine.
                  </div>
                </div>
                <div className="row-control">
                  <select
                    value={aiProvider}
                    onChange={(e) => setAiProvider(e.target.value)}
                    className="neo-select"
                  >
                    <option value="ollama">Ollama (Local Server Endpoint)</option>
                    <option value="openai">OpenAI (API Endpoint)</option>
                    <option value="anthropic">Anthropic Claude (API Endpoint)</option>
                  </select>
                </div>
              </div>

              <div className="setting-row margin-top-md">
                <div className="row-info">
                  <div className="setting-title font-sans">MODEL ARCHITECTURE</div>
                  <div className="setting-desc font-sans text-xs text-secondary">
                    Selected LLM model for operational telemetry analysis.
                  </div>
                </div>
                <div className="row-control">
                  <select
                    value={aiModel}
                    onChange={(e) => setAiModel(e.target.value)}
                    className="neo-select"
                  >
                    {aiProvider === 'ollama' && (
                      <>
                        <option value="llama3">Llama 3 (8B Instruct)</option>
                        <option value="mistral">Mistral (7B Instruct)</option>
                        <option value="qwen">Qwen 2.5 (Coder)</option>
                      </>
                    )}
                    {aiProvider === 'openai' && (
                      <>
                        <option value="gpt-4o-mini">GPT-4o Mini (Fast Observability)</option>
                        <option value="gpt-4o">GPT-4o (High Precision)</option>
                      </>
                    )}
                    {aiProvider === 'anthropic' && (
                      <>
                        <option value="claude-3-5-sonnet">Claude 3.5 Sonnet</option>
                        <option value="claude-3-haiku">Claude 3 Haiku</option>
                      </>
                    )}
                  </select>
                </div>
              </div>

              {aiProvider !== 'ollama' && (
                <div className="setting-row margin-top-md">
                  <div className="row-info">
                    <div className="setting-title font-sans">PROVIDER API KEY</div>
                    <div className="setting-desc font-sans text-xs text-secondary">
                      Encrypted credentials for cloud LLM provider.
                    </div>
                  </div>
                  <div className="row-control">
                    <div className="api-key-input-group">
                      <input
                        type="password"
                        value={aiApiKey}
                        onChange={(e) => setAiApiKey(e.target.value)}
                        placeholder={aiHasKey ? '••••••••••••••••' : 'Enter Provider API Key'}
                        className="neo-input"
                      />
                      {aiHasKey && (
                        <button
                          type="button"
                          onClick={handleDeleteAiKey}
                          className="neo-btn btn-danger-icon"
                          title="Remove saved API key"
                        >
                          <Trash2 size={12} />
                        </button>
                      )}
                    </div>
                    {aiHasKey && <span className="control-subtext text-healthy text-xs">ENCRYPTED KEY SAVED</span>}
                  </div>
                </div>
              )}

              <div className="form-save-bar margin-top-md">
                <button
                  type="submit"
                  disabled={savingAi}
                  className="neo-btn neo-btn-primary"
                >
                  {savingAi ? <RefreshCw size={12} className="spinning" /> : <Save size={12} />}
                  <span>SAVE COPILOT SETTINGS</span>
                </button>
              </div>
            </form>
          )}
        </section>

        {/* 3. MONITORING & SCRAPER */}
        <section className="neo-card settings-card font-mono">
          <div className="card-header border-bottom padding-bottom-xs">
            <div className="title-box">
              <Database size={16} className="text-accent" />
              <span className="editorial-tag">MONITORING & TELEMETRY ENGINE</span>
            </div>
            <span className="editorial-pill pill-healthy">VICTORIAMETRICS ONLINE</span>
          </div>

          <div className="setting-row margin-top-md">
            <div className="row-info">
              <div className="setting-title font-sans">SCRAPE COLLECTION INTERVAL</div>
              <div className="setting-desc font-sans text-xs text-secondary">
                Python daemon scrape frequency for VM metrics telemetry.
              </div>
            </div>
            <div className="row-control">
              <input type="text" readOnly value="30 SECONDS" className="neo-input input-readonly" />
              <span className="control-subtext text-tertiary text-xs">ACTIVE PIPELINE CONFIG</span>
            </div>
          </div>

          <div className="setting-row margin-top-md">
            <div className="row-info">
              <div className="setting-title font-sans">FASTAPI BACKEND GATEWAY</div>
              <div className="setting-desc font-sans text-xs text-secondary">
                Telemetry API gateway and authentication endpoint.
              </div>
            </div>
            <div className="row-control">
              <input type="text" readOnly value="http://192.168.64.22:8000 /api" className="neo-input input-readonly" />
              <span className="control-subtext text-tertiary text-xs">VITE REVERSE PROXY ACTIVE</span>
            </div>
          </div>
        </section>

        {/* 4. ALERT THRESHOLDS & SECURITY */}
        <section className="neo-card settings-card font-mono">
          <div className="card-header border-bottom padding-bottom-xs">
            <div className="title-box">
              <Lock size={16} className="text-accent" />
              <span className="editorial-tag">ALERT THRESHOLDS & GEOLOCK POLICY</span>
            </div>
            <span className="editorial-pill pill-healthy">POLICY ENFORCED</span>
          </div>

          <div className="setting-row margin-top-md">
            <div className="row-info">
              <div className="setting-title font-sans">CPU CRITICAL THRESHOLD</div>
              <div className="setting-desc font-sans text-xs text-secondary">
                Sustained utilization trigger level for incident alerts.
              </div>
            </div>
            <div className="row-control">
              <input type="text" readOnly value="85.0%" className="neo-input input-readonly" />
            </div>
          </div>

          <div className="setting-row margin-top-md">
            <div className="row-info">
              <div className="setting-title font-sans">MEMORY CRITICAL THRESHOLD</div>
              <div className="setting-desc font-sans text-xs text-secondary">
                RAM saturation level before dispatching incident warning.
              </div>
            </div>
            <div className="row-control">
              <input type="text" readOnly value="90.0%" className="neo-input input-readonly" />
            </div>
          </div>

          <div className="setting-row margin-top-md">
            <div className="row-info">
              <div className="setting-title font-sans">SUBNET GEOLOCK FILTER</div>
              <div className="setting-desc font-sans text-xs text-secondary">
                Tailscale VM subnet IP verification enforcement.
              </div>
            </div>
            <div className="row-control">
              <span className="editorial-pill pill-healthy">ENABLED (100.x.x.x SUBNET)</span>
            </div>
          </div>
        </section>
      </div>

      <style>{`
        .margin-top-xs { margin-top: 4px; }
        .margin-top-md { margin-top: 16px; }
        .margin-bottom-md { margin-bottom: 16px; }
        .padding-bottom-xs { padding-bottom: 8px; }
        .border-bottom { border-bottom: 1px solid var(--border-subtle); }

        .editorial-notice-banner {
          padding: 8px 14px;
          font-size: 11px;
          display: flex;
          align-items: center;
          gap: 8px;
          border-radius: var(--radius-md);
        }

        .notice-success {
          background: var(--accent-muted);
          border: 1px solid var(--accent-border);
          color: var(--status-healthy);
        }

        .notice-error {
          background: rgba(220, 38, 38, 0.1);
          border: 1px solid rgba(220, 38, 38, 0.3);
          color: var(--status-critical);
        }

        .notice-close {
          margin-left: auto;
          background: transparent;
          border: none;
          color: inherit;
          cursor: pointer;
        }

        .settings-cards-grid {
          display: flex;
          flex-direction: column;
          gap: 20px;
        }

        .settings-card {
          padding: 20px 24px;
        }

        .card-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          gap: 16px;
        }

        .title-box {
          display: flex;
          align-items: center;
          gap: 8px;
        }

        .setting-row {
          display: flex;
          justify-content: space-between;
          align-items: center;
          gap: 20px;
          padding-bottom: 12px;
          border-bottom: 1px solid var(--border-subtle);
        }

        .setting-row:last-child {
          border-bottom: none;
          padding-bottom: 0;
        }

        .setting-title {
          font-size: 12px;
          font-weight: 700;
          color: var(--text-primary);
        }

        .row-control {
          display: flex;
          flex-direction: column;
          align-items: flex-end;
          gap: 4px;
          min-width: 200px;
        }

        .select-tz {
          min-width: 220px;
        }

        .input-readonly {
          opacity: 0.75;
          width: 220px;
          text-align: right;
        }

        .api-key-input-group {
          display: flex;
          gap: 6px;
        }

        .btn-danger-icon {
          color: var(--status-critical);
          padding: 0 8px;
        }

        .form-save-bar {
          display: flex;
          justify-content: flex-end;
        }

        .loading-box {
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 8px;
        }

        .text-accent { color: var(--accent); }
        .text-healthy { color: var(--status-healthy); }
        .text-tertiary { color: var(--text-tertiary); }
        .text-secondary { color: var(--text-secondary); }
        .text-primary { color: var(--text-primary); }
      `}</style>
    </div>
  );
}

export default SettingsPage;
