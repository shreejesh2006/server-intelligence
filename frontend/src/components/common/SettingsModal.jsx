import React, { useState, useEffect } from 'react';
import { 
  X, 
  Settings, 
  ShieldCheck, 
  Terminal, 
  Eye, 
  Sun, 
  Moon, 
  Clock, 
  Bot, 
  Database, 
  Lock, 
  CheckCircle2, 
  AlertCircle, 
  User, 
  Crown, 
  Save, 
  RefreshCw, 
  Trash2 
} from 'lucide-react';
import { useTheme } from '../../context/ThemeContext';
import { useTimezone } from '../../context/TimezoneContext';
import { useAuth } from '../../context/AuthContext';
import { getAiSettingsApi, updateAiSettingsApi, deleteAiKeyApi } from '../../services/ai';

export function SettingsModal({ isOpen, onClose }) {
  const { theme, toggleTheme } = useTheme();
  const { timezone, setTimezone, formatTimestamp, TIMEZONE_OPTIONS } = useTimezone();
  const { user, switchRole } = useAuth();

  const [activeTab, setActiveTab] = useState('appearance'); // 'appearance' | 'ai' | 'monitoring'
  const [notice, setNotice] = useState(null);
  const [error, setError] = useState(null);

  // AI Settings state
  const [aiProvider, setAiProvider] = useState('ollama');
  const [aiModel, setAiModel] = useState('llama3');
  const [aiApiKey, setAiApiKey] = useState('');
  const [aiEnabled, setAiEnabled] = useState(true);
  const [aiHasKey, setAiHasKey] = useState(false);
  const [loadingAi, setLoadingAi] = useState(false);
  const [savingAi, setSavingAi] = useState(false);

  const currentRole = user?.role || 'ADMIN';
  const isAdmin = currentRole === 'ADMIN';

  const nowSeconds = Math.floor(Date.now() / 1000);
  const livePreviewTime = formatTimestamp ? formatTimestamp(nowSeconds, true) : 'NOW';

  useEffect(() => {
    if (!isOpen) return;

    let isCancelled = false;
    async function loadAi() {
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
        if (!isCancelled) {
          console.warn('AI settings load error:', err);
        }
      } finally {
        if (!isCancelled) setLoadingAi(false);
      }
    }

    loadAi();
    return () => {
      isCancelled = true;
    };
  }, [isOpen]);

  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === 'Escape' && isOpen) {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const handleSaveAi = async (e) => {
    e.preventDefault();
    if (savingAi) return;
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
      setNotice('AI Copilot settings updated successfully.');
      setAiHasKey(res.has_key ?? !!aiApiKey.trim());
      setAiApiKey('');
    } catch (err) {
      setError(err?.response?.data?.detail || 'Failed to save AI settings.');
    } finally {
      setSavingAi(false);
    }
  };

  const handleDeleteAiKey = async () => {
    if (savingAi) return;
    setSavingAi(true);
    try {
      await deleteAiKeyApi();
      setNotice('Saved API key removed.');
      setAiHasKey(false);
    } catch (err) {
      setError(err?.response?.data?.detail || 'Failed to remove API key.');
    } finally {
      setSavingAi(false);
    }
  };

  const isDarkMode = theme === 'dark';

  return (
    <div className="settings-modal-backdrop" onClick={onClose}>
      <div 
        className="settings-modal-container neo-card font-mono" 
        onClick={(e) => e.stopPropagation()}
      >
        {/* MODAL HEADER */}
        <div className="modal-header flex-between border-bottom padding-bottom-sm">
          <div className="flex-center gap-xs">
            <div className="modal-icon-box">
              <Settings size={18} className="text-accent" />
            </div>
            <div>
              <span className="editorial-tag font-bold font-sans">PLATFORM PREFERENCES & SETTINGS</span>
              <div className="text-xs text-tertiary margin-top-xs font-mono">
                ACTIVE USER: <strong className="text-primary">{user?.username || 'ADMIN'}</strong> &bull; ROLE: {currentRole}
              </div>
            </div>
          </div>
          <button 
            type="button" 
            className="neo-icon-btn close-btn" 
            onClick={onClose}
            title="Close Settings Window"
          >
            <X size={16} />
          </button>
        </div>

        {/* NOTIFICATION BANNERS */}
        {notice && (
          <div className="notice-banner notice-success margin-top-xs font-mono">
            <CheckCircle2 size={13} />
            <span>{notice}</span>
          </div>
        )}
        {error && (
          <div className="notice-banner notice-error margin-top-xs font-mono">
            <AlertCircle size={13} />
            <span>{error}</span>
          </div>
        )}

        {/* MODAL NAVIGATION TABS */}
        <div className="modal-tabs-bar margin-top-md">
          <button
            type="button"
            className={`tab-btn ${activeTab === 'appearance' ? 'active' : ''}`}
            onClick={() => setActiveTab('appearance')}
          >
            <Sun size={14} className="text-accent" />
            <span>THEME & TIMEZONE</span>
          </button>

          <button
            type="button"
            className={`tab-btn ${activeTab === 'ai' ? 'active' : ''}`}
            onClick={() => setActiveTab('ai')}
          >
            <Bot size={14} className="text-info" />
            <span>AI COPILOT</span>
          </button>

          <button
            type="button"
            className={`tab-btn ${activeTab === 'monitoring' ? 'active' : ''}`}
            onClick={() => setActiveTab('monitoring')}
          >
            <Database size={14} className="text-warning" />
            <span>POLICIES</span>
          </button>
        </div>

        {/* TAB 1: ROLE & PROFILE LOGOS */}
        {activeTab === 'role' && (
          <div className="tab-content margin-top-md">
            <div className="editorial-tag font-bold margin-bottom-xs">USER ROLE & PROFILE LOGO SELECTOR</div>
            <p className="text-xs text-secondary margin-bottom-md font-sans">
              Switch role scope to preview profile badges and accessibility permissions across the platform console.
            </p>

            <div className="roles-grid">
              {/* ADMIN ROLE CARD */}
              <div 
                className={`neo-card-inset role-select-card ${currentRole === 'ADMIN' ? 'role-card-active' : ''}`}
                onClick={() => switchRole && switchRole('ADMIN')}
              >
                <div className="role-card-top flex-between">
                  <div className="flex-center gap-xs">
                    <div className="role-avatar-badge role-admin-badge">
                      <Crown size={18} className="text-warning" />
                    </div>
                    <div>
                      <div className="font-bold text-primary font-sans">ADMINISTRATOR</div>
                      <div className="text-xs text-tertiary font-mono">FULL PLATFORM CONTROL</div>
                    </div>
                  </div>
                  {currentRole === 'ADMIN' && (
                    <span className="editorial-pill pill-healthy font-mono">ACTIVE ROLE</span>
                  )}
                </div>
                <p className="text-xs text-secondary margin-top-xs font-sans">
                  Full administrative permissions. Access retraining pipelines, security thresholds, and system settings.
                </p>
              </div>

              {/* OPERATOR ROLE CARD */}
              <div 
                className={`neo-card-inset role-select-card ${currentRole === 'OPERATOR' ? 'role-card-active' : ''}`}
                onClick={() => switchRole && switchRole('OPERATOR')}
              >
                <div className="role-card-top flex-between">
                  <div className="flex-center gap-xs">
                    <div className="role-avatar-badge role-operator-badge">
                      <Terminal size={18} className="text-accent" />
                    </div>
                    <div>
                      <div className="font-bold text-primary font-sans">SYSTEM OPERATOR</div>
                      <div className="text-xs text-tertiary font-mono">INFRASTRUCTURE MONITORING</div>
                    </div>
                  </div>
                  {currentRole === 'OPERATOR' && (
                    <span className="editorial-pill pill-healthy font-mono">ACTIVE ROLE</span>
                  )}
                </div>
                <p className="text-xs text-secondary margin-top-xs font-sans">
                  Operator scope. Acknowledge alerts, inspect predictive capacity models, and query telemetry data.
                </p>
              </div>

              {/* VIEWER ROLE CARD */}
              <div 
                className={`neo-card-inset role-select-card ${currentRole === 'VIEWER' ? 'role-card-active' : ''}`}
                onClick={() => switchRole && switchRole('VIEWER')}
              >
                <div className="role-card-top flex-between">
                  <div className="flex-center gap-xs">
                    <div className="role-avatar-badge role-viewer-badge">
                      <Eye size={18} className="text-info" />
                    </div>
                    <div>
                      <div className="font-bold text-primary font-sans">READ-ONLY VIEWER</div>
                      <div className="text-xs text-tertiary font-mono">AUDIT & DASHBOARD VIEW</div>
                    </div>
                  </div>
                  {currentRole === 'VIEWER' && (
                    <span className="editorial-pill pill-healthy font-mono">ACTIVE ROLE</span>
                  )}
                </div>
                <p className="text-xs text-secondary margin-top-xs font-sans">
                  Read-only view access. Inspect telemetry charts, historical analytics, and anomaly score reports.
                </p>
              </div>
            </div>
          </div>
        )}

        {/* TAB 2: APPEARANCE & TIMEZONE */}
        {activeTab === 'appearance' && (
          <div className="tab-content margin-top-md">
            <div className="setting-item flex-between border-bottom padding-bottom-xs margin-bottom-md">
              <div>
                <div className="setting-title font-sans font-bold text-primary">COLOR MODE THEME</div>
                <div className="text-xs text-secondary font-sans">Toggle between Light Industrial Paper and Dark Graphite themes.</div>
              </div>
              <button
                type="button"
                onClick={toggleTheme}
                className="neo-btn font-mono"
              >
                {isDarkMode ? <Moon size={14} /> : <Sun size={14} />}
                <span>{isDarkMode ? 'DARK MODE' : 'LIGHT MODE'}</span>
              </button>
            </div>

            <div className="setting-item flex-between">
              <div>
                <div className="setting-title font-sans font-bold text-primary">DISPLAY TIMEZONE</div>
                <div className="text-xs text-secondary font-sans">Format timestamps for telemetry series, charts, and incident logs.</div>
              </div>
              <div className="flex-column align-end gap-xs">
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
                <span className="text-xs text-tertiary">PREVIEW: {livePreviewTime}</span>
              </div>
            </div>
          </div>
        )}

        {/* TAB 3: AI COPILOT */}
        {activeTab === 'ai' && (
          <div className="tab-content margin-top-md">
            {loadingAi ? (
              <div className="text-center padding-md text-tertiary text-xs">
                <RefreshCw size={16} className="spin text-accent margin-bottom-xs" />
                <p>Loading AI Assistant configuration...</p>
              </div>
            ) : (
              <form onSubmit={handleSaveAi}>
                <div className="setting-item flex-between border-bottom padding-bottom-xs margin-bottom-md">
                  <div>
                    <div className="setting-title font-sans font-bold text-primary">COPILOT SERVICE STATUS</div>
                    <div className="text-xs text-secondary font-sans">Enable or disable local AI copilot engineering assistant.</div>
                  </div>
                  <button
                    type="button"
                    onClick={() => setAiEnabled((prev) => !prev)}
                    className={`neo-btn ${aiEnabled ? 'neo-btn-active' : ''}`}
                  >
                    <span>{aiEnabled ? 'COPILOT ACTIVE' : 'DISABLED'}</span>
                  </button>
                </div>

                <div className="setting-item flex-between border-bottom padding-bottom-xs margin-bottom-md">
                  <div>
                    <div className="setting-title font-sans font-bold text-primary">INFERENCE PROVIDER</div>
                    <div className="text-xs text-secondary font-sans">Select target LLM backend engine.</div>
                  </div>
                  <select
                    value={aiProvider}
                    onChange={(e) => setAiProvider(e.target.value)}
                    className="neo-select"
                  >
                    <option value="ollama">Ollama (Mac-Local 11434)</option>
                    <option value="openai">OpenAI Cloud API</option>
                    <option value="anthropic">Anthropic Claude API</option>
                  </select>
                </div>

                <div className="setting-item flex-between border-bottom padding-bottom-xs margin-bottom-md">
                  <div>
                    <div className="setting-title font-sans font-bold text-primary">MODEL ARCHITECTURE</div>
                    <div className="text-xs text-secondary font-sans">Target LLM parameter size and model family.</div>
                  </div>
                  <select
                    value={aiModel}
                    onChange={(e) => setAiModel(e.target.value)}
                    className="neo-select"
                  >
                    {aiProvider === 'ollama' && (
                      <>
                        <option value="qwen3:1.7b">Qwen 3 (1.7B - Fast)</option>
                        <option value="llama3">Llama 3 (8B Instruct)</option>
                        <option value="mistral">Mistral (7B Instruct)</option>
                      </>
                    )}
                    {aiProvider === 'openai' && (
                      <>
                        <option value="gpt-4o-mini">GPT-4o Mini</option>
                        <option value="gpt-4o">GPT-4o</option>
                      </>
                    )}
                    {aiProvider === 'anthropic' && (
                      <>
                        <option value="claude-3-5-sonnet">Claude 3.5 Sonnet</option>
                      </>
                    )}
                  </select>
                </div>

                {aiProvider !== 'ollama' && (
                  <div className="setting-item flex-between margin-bottom-md">
                    <div>
                      <div className="setting-title font-sans font-bold text-primary">API CREDENTIALS</div>
                      <div className="text-xs text-secondary font-sans">Encrypted API secret key for cloud backend.</div>
                    </div>
                    <div className="flex-center gap-xs">
                      <input
                        type="password"
                        value={aiApiKey}
                        onChange={(e) => setAiApiKey(e.target.value)}
                        placeholder={aiHasKey ? '••••••••••••' : 'Enter API Key'}
                        className="neo-input"
                      />
                      {aiHasKey && (
                        <button
                          type="button"
                          onClick={handleDeleteAiKey}
                          className="neo-btn btn-danger-icon"
                          title="Remove Key"
                        >
                          <Trash2 size={12} />
                        </button>
                      )}
                    </div>
                  </div>
                )}

                <div className="flex-end margin-top-md">
                  <button
                    type="submit"
                    disabled={savingAi}
                    className="neo-btn neo-btn-primary"
                  >
                    {savingAi ? <RefreshCw size={12} className="spin" /> : <Save size={12} />}
                    <span>SAVE AI CONFIG</span>
                  </button>
                </div>
              </form>
            )}
          </div>
        )}

        {/* TAB 4: MONITORING POLICIES */}
        {activeTab === 'monitoring' && (
          <div className="tab-content margin-top-md">
            <div className="setting-item flex-between border-bottom padding-bottom-xs margin-bottom-md">
              <div>
                <div className="setting-title font-sans font-bold text-primary">SCRAPE FREQUENCY</div>
                <div className="text-xs text-secondary font-sans">Python telemetry collection interval daemon.</div>
              </div>
              <span className="editorial-pill pill-healthy">30 SECONDS FIXED</span>
            </div>

            <div className="setting-item flex-between border-bottom padding-bottom-xs margin-bottom-md">
              <div>
                <div className="setting-title font-sans font-bold text-primary">CPU ALERT THRESHOLD</div>
                <div className="text-xs text-secondary font-sans">Trigger level for high compute utilization warnings.</div>
              </div>
              <span className="editorial-pill pill-warning">85.0% CRITICAL</span>
            </div>

            <div className="setting-item flex-between">
              <div>
                <div className="setting-title font-sans font-bold text-primary">MEMORY ALERT THRESHOLD</div>
                <div className="text-xs text-secondary font-sans">Trigger level for RAM exhaustion warnings.</div>
              </div>
              <span className="editorial-pill pill-critical">90.0% CRITICAL</span>
            </div>
          </div>
        )}

        {/* MODAL FOOTER */}
        <div className="modal-footer flex-between border-top margin-top-md padding-top-sm">
          <span className="text-xs text-tertiary font-mono">
            PRESS <kbd className="neo-kbd">ESC</kbd> TO CLOSE WINDOW
          </span>
          <button
            type="button"
            className="neo-btn neo-btn-primary"
            onClick={onClose}
          >
            <span>CLOSE & APPLY PREFERENCES</span>
          </button>
        </div>

        <style>{`
          .settings-modal-backdrop {
            position: fixed;
            top: 0;
            left: 0;
            right: 0;
            bottom: 0;
            background: rgba(0, 0, 0, 0.65);
            backdrop-filter: blur(4px);
            z-index: 1000;
            display: flex;
            align-items: center;
            justify-content: center;
            padding: 20px;
            animation: fadeIn 0.15s ease-out;
          }

          .settings-modal-container {
            width: 100%;
            max-width: 680px;
            background: var(--bg-surface);
            border: 1px solid var(--border-strong);
            box-shadow: var(--shadow-raised-lg);
            border-radius: var(--radius-lg);
            padding: 24px;
            position: relative;
            max-height: 85vh;
            overflow-y: auto;
          }

          .flex-between { display: flex; justify-content: space-between; align-items: center; }
          .flex-center { display: flex; align-items: center; }
          .flex-end { display: flex; justify-content: flex-end; }
          .flex-column { display: flex; flex-direction: column; }
          .align-end { align-items: flex-end; }
          .gap-xs { gap: 6px; }

          .modal-icon-box {
            width: 36px;
            height: 36px;
            background: var(--bg-inset);
            border-radius: var(--radius-md);
            border: 1px solid var(--border-subtle);
            box-shadow: var(--shadow-inset-sm);
            display: flex;
            align-items: center;
            justify-content: center;
          }

          .close-btn {
            width: 32px;
            height: 32px;
          }

          .modal-tabs-bar {
            display: grid;
            grid-template-columns: repeat(3, 1fr);
            gap: 8px;
            background: var(--bg-inset);
            padding: 4px;
            border-radius: var(--radius-md);
            border: 1px solid var(--border-subtle);
          }

          .tab-btn {
            display: flex;
            align-items: center;
            justify-content: center;
            gap: 6px;
            padding: 8px 10px;
            font-size: 11px;
            font-family: inherit;
            font-weight: 600;
            background: transparent;
            border: 1px solid transparent;
            border-radius: var(--radius-sm);
            color: var(--text-secondary);
            cursor: pointer;
            transition: all 0.15s ease;
          }

          .tab-btn.active {
            background: var(--bg-surface);
            color: var(--text-primary);
            border-color: var(--accent-border);
            box-shadow: var(--shadow-raised-sm);
          }

          .roles-grid {
            display: flex;
            flex-direction: column;
            gap: 12px;
          }

          .role-select-card {
            padding: 14px 16px;
            border-radius: var(--radius-md);
            cursor: pointer;
            transition: all 0.15s ease;
            border: 1px solid var(--border-subtle);
          }

          .role-select-card:hover {
            border-color: var(--accent-border);
            background: var(--bg-surface-hover);
          }

          .role-card-active {
            border-color: var(--accent) !important;
            box-shadow: var(--shadow-raised-sm);
          }

          .role-avatar-badge {
            width: 32px;
            height: 32px;
            border-radius: var(--radius-pill);
            display: flex;
            align-items: center;
            justify-content: center;
          }

          .role-admin-badge {
            background: rgba(245, 158, 11, 0.15);
            border: 1px solid rgba(245, 158, 11, 0.35);
          }

          .role-operator-badge {
            background: var(--accent-muted);
            border: 1px solid var(--accent-border);
          }

          .role-viewer-badge {
            background: rgba(56, 189, 248, 0.15);
            border: 1px solid rgba(56, 189, 248, 0.35);
          }

          .notice-banner {
            padding: 8px 12px;
            font-size: 11px;
            border-radius: var(--radius-md);
            display: flex;
            align-items: center;
            gap: 8px;
          }
          .notice-success {
            background: var(--accent-muted);
            color: var(--status-healthy);
            border: 1px solid var(--accent-border);
          }
          .notice-error {
            background: rgba(220, 38, 38, 0.1);
            color: var(--status-critical);
            border: 1px solid rgba(220, 38, 38, 0.3);
          }

          .neo-kbd {
            background: var(--bg-inset);
            border: 1px solid var(--border-subtle);
            padding: 1px 5px;
            border-radius: 3px;
            font-size: 9px;
          }

          .margin-top-xs { margin-top: 6px; }
          .margin-top-md { margin-top: 16px; }
          .margin-bottom-xs { margin-bottom: 6px; }
          .margin-bottom-md { margin-bottom: 16px; }
          .padding-bottom-xs { padding-bottom: 8px; }
          .padding-bottom-sm { padding-bottom: 12px; }
          .padding-top-sm { padding-top: 12px; }
          .border-bottom { border-bottom: 1px solid var(--border-subtle); }
          .border-top { border-top: 1px solid var(--border-subtle); }

          .text-accent { color: var(--accent); }
          .text-warning { color: var(--status-warning, #f59e0b); }
          .text-info { color: var(--status-info, #38bdf8); }
          .text-tertiary { color: var(--text-tertiary); }
          .text-secondary { color: var(--text-secondary); }
          .text-primary { color: var(--text-primary); }

          .spin {
            animation: spin 1s linear infinite;
          }

          @keyframes spin {
            from { transform: rotate(0deg); }
            to { transform: rotate(360deg); }
          }

          @keyframes fadeIn {
            from { opacity: 0; transform: scale(0.98); }
            to { opacity: 1; transform: scale(1); }
          }
        `}</style>
      </div>
    </div>
  );
}

export default SettingsModal;
