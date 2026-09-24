import React, { useState, useEffect } from 'react';
import { 
  X, 
  Settings, 
  Sliders,
  Sun, 
  Moon, 
  Bot, 
  CheckCircle2, 
  AlertCircle, 
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
  const { user } = useAuth();

  const [activeTab, setActiveTab] = useState('general'); // 'general' | 'ai'
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
  const displayRole = currentRole === 'ADMIN' ? 'Admin' : currentRole === 'OPERATOR' ? 'Operator' : 'Viewer';

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

  const handleSaveSettings = async () => {
    if (savingAi) return;
    setNotice(null);
    setError(null);

    if (activeTab === 'ai') {
      setSavingAi(true);
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
        setNotice('Settings saved.');
        setAiHasKey(res.has_key ?? !!aiApiKey.trim());
        setAiApiKey('');
        setTimeout(() => onClose(), 400);
      } catch (err) {
        setError(err?.response?.data?.detail || 'Failed to save AI settings.');
      } finally {
        setSavingAi(false);
      }
    } else {
      setNotice('Settings saved.');
      setTimeout(() => onClose(), 400);
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
        className="settings-modal-container font-sans" 
        onClick={(e) => e.stopPropagation()}
      >
        {/* MODAL HEADER */}
        <div className="modal-header flex-between border-bottom padding-bottom-sm">
          <div className="flex-center gap-xs">
            <div className="modal-icon-box">
              <Settings size={18} className="text-primary" />
            </div>
            <div className="modal-title font-semibold text-primary">Settings</div>
          </div>
          <button 
            type="button" 
            className="close-btn" 
            onClick={onClose}
            title="Close Settings Window"
          >
            <X size={16} />
          </button>
        </div>

        {/* NOTIFICATION BANNERS */}
        {notice && (
          <div className="notice-banner notice-success margin-top-xs font-sans">
            <CheckCircle2 size={13} />
            <span>{notice}</span>
          </div>
        )}
        {error && (
          <div className="notice-banner notice-error margin-top-xs font-sans">
            <AlertCircle size={13} />
            <span>{error}</span>
          </div>
        )}

        {/* MODAL NAVIGATION TABS */}
        <div className="modal-tabs-bar margin-top-md font-sans">
          <button
            type="button"
            className={`tab-btn ${activeTab === 'general' ? 'active' : ''}`}
            onClick={() => setActiveTab('general')}
          >
            <Sliders size={14} />
            <span>General</span>
          </button>

          <button
            type="button"
            className={`tab-btn ${activeTab === 'ai' ? 'active' : ''}`}
            onClick={() => setActiveTab('ai')}
          >
            <Bot size={14} />
            <span>AI Copilot</span>
          </button>
        </div>

        {/* TAB 1: GENERAL (USER DETAILS + THEME & TIMEZONE) */}
        {activeTab === 'general' && (
          <div className="tab-content margin-top-md font-sans">
            <div className="setting-item flex-between border-bottom padding-bottom-xs margin-bottom-md">
              <div className="setting-title font-semibold text-primary font-sans">Username</div>
              <span className="font-medium text-primary font-sans">{user?.username || 'admin'}</span>
            </div>

            <div className="setting-item flex-between border-bottom padding-bottom-xs margin-bottom-md">
              <div className="setting-title font-semibold text-primary font-sans">Role</div>
              <span className="font-medium text-primary font-sans">{displayRole}</span>
            </div>

            <div className="setting-item flex-between border-bottom padding-bottom-xs margin-bottom-md">
              <div className="setting-title font-semibold text-primary font-sans">System Access</div>
              <span className="text-xs text-muted font-sans">Full Control</span>
            </div>

            <div className="setting-item flex-between border-bottom padding-bottom-xs margin-bottom-md">
              <div className="setting-title font-semibold text-primary font-sans">Theme</div>
              <button
                type="button"
                onClick={toggleTheme}
                className="host-tab-btn font-sans"
              >
                {isDarkMode ? <Sun size={13} /> : <Moon size={13} />}
                <span>{isDarkMode ? 'Light Mode' : 'Dark Mode'}</span>
              </button>
            </div>

            <div className="setting-item flex-between">
              <div className="setting-title font-semibold text-primary font-sans">Display Timezone</div>
              <div className="flex-column align-end gap-xs">
                <select
                  value={timezone}
                  onChange={(e) => setTimezone && setTimezone(e.target.value)}
                  className="netra-metric-dropdown font-sans"
                >
                  {TIMEZONE_OPTIONS.map((opt) => (
                    <option key={opt.id} value={opt.id}>
                      {opt.name}
                    </option>
                  ))}
                </select>
                <span className="text-xs text-muted font-sans">Preview: {livePreviewTime}</span>
              </div>
            </div>
          </div>
        )}

        {/* TAB 2: AI COPILOT */}
        {activeTab === 'ai' && (
          <div className="tab-content margin-top-md font-sans">
            {loadingAi ? (
              <div className="text-center padding-md text-muted text-xs font-sans">
                <RefreshCw size={16} className="spin margin-bottom-xs" />
                <p>Loading AI Assistant configuration...</p>
              </div>
            ) : (
              <div>
                <div className="setting-item flex-between border-bottom padding-bottom-xs margin-bottom-md">
                  <div className="setting-title font-semibold text-primary font-sans">Copilot Status</div>
                  <button
                    type="button"
                    onClick={() => setAiEnabled((prev) => !prev)}
                    className={`host-tab-btn ${aiEnabled ? 'active' : ''} font-sans`}
                  >
                    <span>{aiEnabled ? 'Copilot Active' : 'Disabled'}</span>
                  </button>
                </div>

                <div className="setting-item flex-between border-bottom padding-bottom-xs margin-bottom-md">
                  <div className="setting-title font-semibold text-primary font-sans">Inference Provider</div>
                  <select
                    value={aiProvider}
                    onChange={(e) => setAiProvider(e.target.value)}
                    className="netra-metric-dropdown font-sans"
                  >
                    <option value="ollama">Ollama (Mac-Local 11434)</option>
                    <option value="openai">OpenAI Cloud API</option>
                    <option value="anthropic">Anthropic Claude API</option>
                  </select>
                </div>

                <div className="setting-item flex-between border-bottom padding-bottom-xs margin-bottom-md">
                  <div className="setting-title font-semibold text-primary font-sans">Model Architecture</div>
                  <select
                    value={aiModel}
                    onChange={(e) => setAiModel(e.target.value)}
                    className="netra-metric-dropdown font-sans"
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
                    <div className="setting-title font-semibold text-primary font-sans">API Credentials</div>
                    <div className="flex-center gap-xs">
                      <input
                        type="password"
                        value={aiApiKey}
                        onChange={(e) => setAiApiKey(e.target.value)}
                        placeholder={aiHasKey ? '••••••••••••' : 'Enter API Key'}
                        className="netra-input font-sans"
                      />
                      {aiHasKey && (
                        <button
                          type="button"
                          onClick={handleDeleteAiKey}
                          className="close-btn"
                          title="Remove Key"
                        >
                          <Trash2 size={13} />
                        </button>
                      )}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {/* MODAL FOOTER */}
        <div className="modal-footer flex-between border-top margin-top-md padding-top-sm">
          <span className="text-xs text-muted font-sans">
            Press <kbd className="neo-kbd font-sans">ESC</kbd> to close
          </span>
          <div className="flex-center gap-xs">
            <button
              type="button"
              className="host-tab-btn active font-sans"
              disabled={savingAi}
              onClick={handleSaveSettings}
            >
              {savingAi ? <RefreshCw size={12} className="spin" /> : <Save size={12} />}
              <span>Save Settings</span>
            </button>
            <button
              type="button"
              className="host-tab-btn font-sans"
              onClick={onClose}
            >
              <span>Close</span>
            </button>
          </div>
        </div>

        <style>{`
          .settings-modal-backdrop {
            position: fixed;
            top: 0;
            left: 0;
            right: 0;
            bottom: 0;
            background: rgba(0, 0, 0, 0.45);
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
            max-width: 620px;
            background: var(--bg-surface);
            border: 1px solid var(--border-subtle);
            box-shadow: 0 20px 40px -10px rgba(0, 0, 0, 0.15);
            border-radius: var(--radius-md);
            padding: 20px 24px;
            position: relative;
            max-height: 85vh;
            overflow-y: auto;
          }

          .flex-between { display: flex; justify-content: space-between; align-items: center; }
          .flex-center { display: flex; align-items: center; }
          .flex-end { display: flex; justify-content: flex-end; }
          .flex-column { display: flex; flex-direction: column; }
          .align-end { align-items: flex-end; }
          .gap-xs { gap: 8px; }

          .modal-icon-box {
            width: 32px;
            height: 32px;
            background: var(--bg-canvas);
            border-radius: var(--radius-sm);
            border: 1px solid var(--border-subtle);
            display: flex;
            align-items: center;
            justify-content: center;
          }

          .modal-title {
            font-size: 16px;
            letter-spacing: -0.01em;
          }

          .close-btn {
            width: 28px;
            height: 28px;
            border: none;
            background: transparent;
            color: var(--text-muted);
            border-radius: var(--radius-xs);
            display: flex;
            align-items: center;
            justify-content: center;
            cursor: pointer;
            transition: all 0.15s ease;
          }

          .close-btn:hover {
            color: var(--text-primary);
            background: var(--bg-subtle);
          }

          .modal-tabs-bar {
            display: grid;
            grid-template-columns: repeat(2, 1fr);
            gap: 4px;
            background: var(--bg-subtle);
            padding: 3px;
            border-radius: var(--radius-sm);
          }

          .tab-btn {
            display: flex;
            align-items: center;
            justify-content: center;
            gap: 6px;
            padding: 6px 10px;
            font-size: 12px;
            font-family: var(--font-sans);
            font-weight: 500;
            background: transparent;
            border: none;
            border-radius: var(--radius-xs);
            color: var(--text-muted);
            cursor: pointer;
            transition: all 0.15s ease;
          }

          .tab-btn:hover {
            color: var(--text-primary);
          }

          .tab-btn.active {
            background: var(--bg-surface);
            color: var(--text-primary);
            box-shadow: 0 1px 2px rgba(0, 0, 0, 0.05);
          }

          .setting-title {
            font-size: 13px;
          }

          .notice-banner {
            padding: 8px 12px;
            font-size: 12px;
            border-radius: var(--radius-sm);
            display: flex;
            align-items: center;
            gap: 8px;
          }

          .notice-success {
            background: var(--status-healthy-bg);
            color: var(--status-healthy);
            border: 1px solid var(--border-subtle);
          }

          .notice-error {
            background: var(--status-critical-bg);
            color: var(--status-critical);
            border: 1px solid var(--border-subtle);
          }

          .netra-input {
            background: var(--bg-canvas);
            border: 1px solid var(--border-subtle);
            border-radius: var(--radius-xs);
            color: var(--text-primary);
            font-size: 12px;
            padding: 4px 10px;
            outline: none;
          }

          .neo-kbd {
            background: var(--bg-subtle);
            border: 1px solid var(--border-subtle);
            padding: 1px 5px;
            border-radius: 3px;
            font-size: 10px;
            color: var(--text-secondary);
          }

          .host-tab-btn {
            display: flex;
            align-items: center;
            gap: 6px;
            background: transparent;
            border: 1px solid var(--border-subtle);
            color: var(--text-secondary);
            font-family: var(--font-sans);
            font-size: 12px;
            padding: 4px 12px;
            border-radius: var(--radius-sm);
            cursor: pointer;
            transition: all 0.15s ease;
          }

          .host-tab-btn:hover {
            background-color: var(--bg-surface-hover);
            color: var(--text-primary);
          }

          .host-tab-btn.active {
            background-color: var(--bg-surface);
            border-color: var(--border-strong);
            color: var(--text-primary);
            font-weight: 500;
          }

          .netra-metric-dropdown {
            background-color: var(--bg-canvas);
            border: 1px solid var(--border-subtle);
            border-radius: var(--radius-xs);
            color: var(--text-primary);
            font-size: 12px;
            padding: 4px 10px;
            outline: none;
            cursor: pointer;
            font-weight: 500;
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

          .text-tertiary { color: var(--text-muted); }
          .text-secondary { color: var(--text-secondary); }
          .text-primary { color: var(--text-primary); }
          .text-muted { color: var(--text-muted); }

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
