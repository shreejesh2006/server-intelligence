import React, { useState, useEffect } from 'react';
import { useTheme } from '../../context/ThemeContext';
import { useTimezone } from '../../context/TimezoneContext';
import { useAuth } from '../../context/AuthContext';
import { 
  getAiSettingsApi, 
  updateAiSettingsApi
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
  const [aiModel, setAiModel] = useState('qwen3:1.7b');
  const [aiApiKey, setAiApiKey] = useState('');
  const [aiEnabled, setAiEnabled] = useState(true);
  const [loadingAi, setLoadingAi] = useState(false);
  const [savingAi, setSavingAi] = useState(false);

  useEffect(() => {
    if (notice) {
      const timer = setTimeout(() => setNotice(null), 4000);
      return () => clearTimeout(timer);
    }
  }, [notice]);

  useEffect(() => {
    let isCancelled = false;

    async function loadAiSettings() {
      if (!isAdmin) return;
      setLoadingAi(true);

      try {
        const config = await getAiSettingsApi();
        if (!isCancelled && config) {
          setAiProvider(config.provider || 'ollama');
          setAiModel(config.model || 'qwen3:1.7b');
          setAiEnabled(config.enabled ?? true);
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

  const handleSaveAiSettings = async (e) => {
    e.preventDefault();
    setSavingAi(true);
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

      await updateAiSettingsApi(payload);
      setAiApiKey('');
      setNotice('AI Copilot settings updated successfully.');
    } catch (err) {
      setError(err?.response?.data?.detail || 'Failed to update AI settings.');
    } finally {
      setSavingAi(false);
    }
  };

  return (
    <div className="settings-page font-sans">
      <div className="page-header-block">
        <h1 className="page-title">Settings</h1>
        <p className="page-subtitle">Preferences and system configuration</p>
      </div>

      {notice && <div className="notice-banner font-sans text-xs">{notice}</div>}
      {error && <div className="error-banner font-sans text-xs">{error}</div>}

      {/* Appearance Section */}
      <div className="settings-section border-box">
        <h2 className="section-title">Appearance</h2>

        <div className="setting-row margin-top-md">
          <div>
            <div className="setting-name font-medium">Theme</div>
            <div className="setting-desc text-muted">Toggle between light and dark interface</div>
          </div>
          <button
            type="button"
            onClick={toggleTheme}
            className="nokia-btn"
          >
            {theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
          </button>
        </div>
      </div>

      {/* Timezone Section */}
      <div className="settings-section border-box">
        <h2 className="section-title">Timezone & Regional</h2>

        <div className="setting-row margin-top-md">
          <div>
            <div className="setting-name font-medium">Display Timezone</div>
            <div className="setting-desc text-muted">Preview: {livePreviewTime}</div>
          </div>
          <select
            value={timezone}
            onChange={(e) => {
              setTimezone(e.target.value);
              setNotice(`Timezone updated to ${e.target.value}`);
            }}
            className="nokia-select font-mono"
          >
            {TIMEZONE_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label} ({opt.offset})
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* AI Assistant Section */}
      {isAdmin && (
        <div id="ai-assistant" className="settings-section border-box">
          <h2 className="section-title">AI Assistant Engine</h2>

          {loadingAi ? (
            <div className="text-muted text-xs margin-top-md">Loading AI engine configuration...</div>
          ) : (
            <form onSubmit={handleSaveAiSettings} className="margin-top-md setting-form">
              <div className="form-group">
                <label className="setting-name font-medium">Engine Provider</label>
                <select
                  value={aiProvider}
                  onChange={(e) => setAiProvider(e.target.value)}
                  className="nokia-select font-mono"
                >
                  <option value="ollama">Ollama (Mac-Local)</option>
                  <option value="openai">OpenAI (Remote API)</option>
                </select>
              </div>

              <div className="form-group">
                <label className="setting-name font-medium">Model</label>
                <input
                  type="text"
                  value={aiModel}
                  onChange={(e) => setAiModel(e.target.value)}
                  placeholder="e.g. qwen3:1.7b"
                  className="nokia-select font-mono"
                />
              </div>

              <div className="form-group">
                <button
                  type="submit"
                  disabled={savingAi}
                  className="nokia-btn nokia-btn-primary"
                >
                  {savingAi ? 'Saving...' : 'Save AI settings'}
                </button>
              </div>
            </form>
          )}
        </div>
      )}

      <style>{`
        .settings-page {
          display: flex;
          flex-direction: column;
          gap: 20px;
        }

        .page-header-block {
          margin-bottom: 8px;
        }

        .page-title {
          font-size: 20px;
          font-weight: 600;
          color: var(--text-primary);
        }

        .page-subtitle {
          font-size: 13px;
          color: var(--text-muted);
        }

        .border-box {
          background: var(--bg-surface);
          border: 1px solid var(--border-subtle);
          border-radius: var(--radius-md);
          padding: 20px;
        }

        .section-title {
          font-size: 15px;
          font-weight: 500;
          color: var(--text-primary);
        }

        .margin-top-md { margin-top: 16px; }

        .setting-row {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 16px;
        }

        .setting-name {
          font-size: 13px;
          color: var(--text-primary);
        }

        .setting-desc {
          font-size: 12px;
        }

        .setting-form {
          display: flex;
          flex-direction: column;
          gap: 16px;
          max-width: 400px;
        }

        .form-group {
          display: flex;
          flex-direction: column;
          gap: 6px;
        }

        .notice-banner {
          padding: 10px 14px;
          background: var(--status-healthy-bg);
          color: var(--status-healthy);
          border-radius: var(--radius-sm);
        }

        .error-banner {
          padding: 10px 14px;
          background: var(--status-critical-bg);
          color: var(--status-critical);
          border-radius: var(--radius-sm);
        }

        .text-muted { color: var(--text-muted); }
      `}</style>
    </div>
  );
}

export default SettingsPage;
