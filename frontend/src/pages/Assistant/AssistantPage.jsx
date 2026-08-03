import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router';
import PageHeader from '../../components/common/PageHeader';
import { useAuth } from '../../context/AuthContext';
import { sendChatMessageApi, getAiSettingsApi } from '../../services/ai';
import { 
  Bot, 
  Send, 
  RefreshCw, 
  AlertCircle, 
  Sliders, 
  Sparkles, 
  Terminal,
  User as UserIcon
} from 'lucide-react';


export function AssistantPage() {
  const { user } = useAuth();
  const isAdmin = user?.role === 'ADMIN';
  const navigate = useNavigate();

  const [aiConfig, setAiConfig] = useState(null);
  const [checkingConfig, setCheckingConfig] = useState(true);

  const [messages, setMessages] = useState([]);
  const [inputText, setInputText] = useState('');
  const [isSending, setIsSending] = useState(false);
  const [chatError, setChatError] = useState(null);

  const messagesEndRef = useRef(null);
  const textareaRef = useRef(null);

  // Auto-scroll to bottom of chat
  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages, isSending]);

  // Check AI configuration on mount
  useEffect(() => {
    let isCancelled = false;

    async function checkConfiguration() {
      setCheckingConfig(true);
      try {
        const config = await getAiSettingsApi();
        if (!isCancelled) {
          setAiConfig(config);
        }
      } catch (err) {
        if (!isCancelled) {
          // If non-admin receives 403 when checking settings, check if error was permissions
          setAiConfig({ configured: false, enabled: false });
        }
      } finally {
        if (!isCancelled) {
          setCheckingConfig(false);
        }
      }
    }

    checkConfiguration();

    return () => {
      isCancelled = true;
    };
  }, []);

  const handleSend = async (e) => {
    if (e) e.preventDefault();
    const text = inputText.trim();
    if (!text || isSending) return;

    setChatError(null);
    const userMessage = { role: 'user', content: text };
    const updatedMessages = [...messages, userMessage];

    setMessages(updatedMessages);
    setInputText('');
    setIsSending(true);

    try {
      const response = await sendChatMessageApi(updatedMessages);
      const assistantMessage = {
        role: 'assistant',
        content: response.message,
        provider: response.provider,
        model: response.model,
      };
      setMessages([...updatedMessages, assistantMessage]);
    } catch (err) {
      const errorData = err?.response?.data;
      if (errorData?.detail?.code === 'AI_NOT_CONFIGURED') {
        setAiConfig({ configured: false, enabled: false });
      } else {
        const errMsg =
          typeof errorData?.detail === 'string'
            ? errorData.detail
            : errorData?.detail?.message || err.message || 'Failed to generate AI response.';
        setChatError(errMsg);
      }
    } finally {
      setIsSending(false);
    }
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const handlePromptSelect = (promptText) => {
    setInputText(promptText);
    textareaRef.current?.focus();
  };

  // Helper to render message text securely with code formatting
  const renderFormattedText = (content) => {
    if (!content) return null;
    const parts = content.split(/(```[\s\S]*?```)/g);

    return parts.map((part, index) => {
      if (part.startsWith('```') && part.endsWith('```')) {
        const codeContent = part.slice(3, -3).trim();
        const firstLineEnd = codeContent.indexOf('\n');
        let language = 'code';
        let codeText = codeContent;

        if (firstLineEnd !== -1) {
          const possibleLang = codeContent.substring(0, firstLineEnd).trim();
          if (possibleLang && !possibleLang.includes(' ')) {
            language = possibleLang;
            codeText = codeContent.substring(firstLineEnd + 1);
          }
        }

        return (
          <div key={index} className="assistant-code-block font-mono">
            <div className="code-block-header">
              <span>{language.toUpperCase()}</span>
            </div>
            <pre className="code-block-body">
              <code>{codeText}</code>
            </pre>
          </div>
        );
      }

      return (
        <span key={index} className="text-paragraph">
          {part}
        </span>
      );
    });
  };

  const isConfigured = aiConfig?.configured && aiConfig?.enabled;

  return (
    <div className="assistant-page font-mono">
      <PageHeader
        index="08"
        title="AI ASSISTANT"

        subtitle="General technical intelligence assistant powered by administrator BYOK provider."
        tag="AI ASSISTANT (GENERIC MODE)"
      >
        {isConfigured && (
          <span className="editorial-pill pill-healthy">
            <Sparkles size={11} /> {aiConfig.provider?.toUpperCase()} / {aiConfig.model?.toUpperCase()}
          </span>
        )}
      </PageHeader>

      {/* Loading state while checking configuration */}
      {checkingConfig ? (
        <div className="assistant-loading-box">
          <RefreshCw size={16} className="spinning text-accent" />
          <span>CHECKING AI PROVIDER CONFIGURATION...</span>
        </div>
      ) : !isConfigured ? (
        /* NOT CONFIGURED UX */
        <section className="unconfigured-card font-mono">
          <div className="unconfigured-header">
            <Bot size={24} className="text-secondary" />
            <h3 className="unconfigured-title font-sans">
              {isAdmin
                ? 'AI ASSISTANT REQUIRES PROVIDER CONFIGURATION'
                : 'AI ASSISTANT NOT CONFIGURED'}
            </h3>
          </div>

          <p className="unconfigured-desc font-sans text-xs text-secondary">
            {isAdmin
              ? 'An administrator must configure an AI provider (e.g. Gemini) and API key in Settings before using the assistant.'
              : 'AI Assistant has not been configured by an administrator. Contact your platform administrator to enable AI features.'}
          </p>

          {isAdmin && (
            <div className="unconfigured-action">
              <button
                type="button"
                onClick={() => navigate('/settings#ai-assistant')}
                className="editorial-btn btn-configure-ai"
              >
                <Sliders size={13} />
                <span>CONFIGURE AI ASSISTANT</span>
              </button>
            </div>
          )}
        </section>
      ) : (
        /* ACTIVE CHAT INTERFACE */
        <div className="chat-container">
          {/* Chat Messages Log */}
          <div className="chat-messages-area">
            {messages.length === 0 ? (
              <div className="empty-chat-hero font-mono">
                <div className="empty-hero-icon">
                  <Terminal size={22} className="text-accent" />
                </div>
                <h4 className="empty-hero-title font-sans">SERVER INTELLIGENCE AI ASSISTANT</h4>
                <p className="empty-hero-sub font-sans text-xs text-secondary">
                  Generic AI assistant mode. Ask technical questions regarding Linux administration, system architecture, database optimization, or software engineering.
                </p>

                <div className="prompt-suggestions">
                  <span className="suggestions-label">SUGGESTED TECHNICAL PROMPTS:</span>
                  <div className="suggestions-grid">
                    <button
                      type="button"
                      onClick={() => handlePromptSelect('Explain Linux CPU scheduling and IO wait metrics.')}
                      className="suggestion-btn"
                    >
                      "Explain Linux CPU scheduling and IO wait metrics."
                    </button>
                    <button
                      type="button"
                      onClick={() => handlePromptSelect('How does VictoriaMetrics handle high-cardinality time series data?')}
                      className="suggestion-btn"
                    >
                      "How does VictoriaMetrics handle high-cardinality time series data?"
                    </button>
                    <button
                      type="button"
                      onClick={() => handlePromptSelect('Write a bash script to monitor memory usage and trigger a log warning.')}
                      className="suggestion-btn"
                    >
                      "Write a bash script to monitor memory usage and trigger a log warning."
                    </button>
                  </div>
                </div>
              </div>
            ) : (
              messages.map((msg, index) => (
                <div
                  key={index}
                  className={`chat-bubble-wrapper ${
                    msg.role === 'user' ? 'bubble-user' : 'bubble-assistant'
                  }`}
                >
                  <div className="bubble-meta font-mono text-xs">
                    {msg.role === 'user' ? (
                      <>
                        <UserIcon size={12} />
                        <span>YOU ({user?.username?.toUpperCase() || 'USER'})</span>
                      </>
                    ) : (
                      <>
                        <Bot size={12} className="text-accent" />
                        <span>AI ASSISTANT ({msg.provider?.toUpperCase() || 'GEMINI'})</span>
                      </>
                    )}
                  </div>
                  <div className="bubble-content font-mono">
                    {renderFormattedText(msg.content)}
                  </div>
                </div>
              ))
            )}

            {/* Processing / Sending Indicator */}
            {isSending && (
              <div className="chat-bubble-wrapper bubble-assistant">
                <div className="bubble-meta font-mono text-xs">
                  <Bot size={12} className="text-accent spinning" />
                  <span>AI ASSISTANT GENERATING RESPONSE...</span>
                </div>
                <div className="typing-indicator font-mono">
                  <span className="typing-dot">■</span>
                  <span className="typing-dot">■</span>
                  <span className="typing-dot">■</span>
                </div>
              </div>
            )}

            {/* Error Banner inside Chat */}
            {chatError && (
              <div className="editorial-notice-banner notice-error">
                <AlertCircle size={15} />
                <span>{chatError}</span>
                <button
                  type="button"
                  onClick={() => setChatError(null)}
                  className="notice-close"
                  aria-label="Dismiss error"
                >
                  ✕
                </button>
              </div>
            )}

            <div ref={messagesEndRef} />
          </div>

          {/* Input Controls Footer */}
          <form onSubmit={handleSend} className="chat-input-form">
            <div className="input-box-wrapper">
              <textarea
                ref={textareaRef}
                value={inputText}
                onChange={(e) => setInputText(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="Type your message... (Enter to send, Shift+Enter for newline)"
                rows={2}
                disabled={isSending}
                className="chat-textarea font-mono"
              />
              <button
                type="submit"
                disabled={isSending || !inputText.trim()}
                aria-label="Send message to AI Assistant"
                className="editorial-btn btn-send-chat"
              >
                {isSending ? (
                  <RefreshCw size={13} className="spinning" />
                ) : (
                  <>
                    <Send size={13} />
                    <span>SEND</span>
                  </>
                )}
              </button>
            </div>
            <div className="input-footer-note font-mono text-xs text-tertiary">
              <span>GENERIC MODE — TELEMETRY CONTEXT NOT INCLUDED</span>
            </div>
          </form>
        </div>
      )}

      <style>{`
        .assistant-page {
          display: flex;
          flex-direction: column;
        }

        .assistant-loading-box {
          background: var(--bg-surface);
          border: 1px solid var(--border-strong);
          padding: 40px;
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 12px;
          color: var(--text-tertiary);
          font-size: 11px;
        }

        .unconfigured-card {
          background: var(--bg-surface);
          border: 1px solid var(--border-strong);
          border-left: 4px solid var(--status-warning);
          padding: 32px;
          max-width: 680px;
          margin: 20px 0;
        }

        .unconfigured-header {
          display: flex;
          align-items: center;
          gap: 12px;
          margin-bottom: 12px;
        }

        .unconfigured-title {
          font-size: 14px;
          font-weight: 700;
          color: var(--text-primary);
          letter-spacing: 0.05em;
        }

        .unconfigured-desc {
          line-height: 1.6;
          margin-bottom: 20px;
        }

        .unconfigured-action {
          display: flex;
        }

        .btn-configure-ai {
          padding: 10px 18px;
          border-color: var(--accent);
          color: var(--accent);
        }

        .btn-configure-ai:hover {
          background: var(--accent);
          color: #fff;
        }

        .chat-container {
          background: var(--bg-surface);
          border: 1px solid var(--border-strong);
          display: flex;
          flex-direction: column;
          min-height: 580px;
        }

        .chat-messages-area {
          flex: 1;
          padding: 24px;
          overflow-y: auto;
          max-height: 600px;
          display: flex;
          flex-direction: column;
          gap: 20px;
        }

        .empty-chat-hero {
          display: flex;
          flex-direction: column;
          align-items: center;
          text-align: center;
          padding: 40px 20px;
          max-width: 640px;
          margin: auto;
        }

        .empty-hero-icon {
          width: 44px;
          height: 44px;
          background: var(--bg-main);
          border: 1px solid var(--border-subtle);
          display: flex;
          align-items: center;
          justify-content: center;
          margin-bottom: 16px;
        }

        .empty-hero-title {
          font-size: 14px;
          font-weight: 700;
          color: var(--text-primary);
          letter-spacing: 0.08em;
          margin-bottom: 8px;
        }

        .empty-hero-sub {
          line-height: 1.5;
          margin-bottom: 28px;
        }

        .prompt-suggestions {
          width: 100%;
          text-align: left;
        }

        .suggestions-label {
          font-size: 9px;
          color: var(--text-tertiary);
          letter-spacing: 0.1em;
          margin-bottom: 10px;
          display: block;
        }

        .suggestions-grid {
          display: flex;
          flex-direction: column;
          gap: 8px;
        }

        .suggestion-btn {
          background: var(--bg-main);
          border: 1px solid var(--border-subtle);
          color: var(--text-secondary);
          padding: 10px 14px;
          font-family: var(--font-mono);
          font-size: 11px;
          text-align: left;
          cursor: pointer;
          transition: all 0.15s ease;
        }

        .suggestion-btn:hover {
          color: var(--accent);
          border-color: var(--accent);
          background: var(--bg-surface-hover);
        }

        .chat-bubble-wrapper {
          display: flex;
          flex-direction: column;
          gap: 6px;
          max-width: 85%;
        }

        .bubble-user {
          align-self: flex-end;
        }

        .bubble-assistant {
          align-self: flex-start;
        }

        .bubble-meta {
          display: flex;
          align-items: center;
          gap: 6px;
          color: var(--text-tertiary);
          font-size: 10px;
          letter-spacing: 0.05em;
        }

        .bubble-user .bubble-meta {
          justify-content: flex-end;
        }

        .bubble-content {
          padding: 14px 18px;
          font-size: 12px;
          line-height: 1.6;
          white-space: pre-wrap;
          word-break: break-word;
        }

        .bubble-user .bubble-content {
          background: var(--accent-muted);
          border: 1px solid var(--accent-border);
          color: var(--text-primary);
        }

        .bubble-assistant .bubble-content {
          background: var(--bg-main);
          border: 1px solid var(--border-strong);
          color: var(--text-primary);
        }

        .assistant-code-block {
          background: #0d1117;
          border: 1px solid var(--border-strong);
          margin: 10px 0;
          font-size: 11px;
        }

        .code-block-header {
          background: #161b22;
          padding: 4px 12px;
          font-size: 9px;
          color: var(--text-tertiary);
          border-bottom: 1px solid var(--border-subtle);
          letter-spacing: 0.08em;
        }

        .code-block-body {
          padding: 12px;
          overflow-x: auto;
          margin: 0;
          color: #e6edf3;
        }

        .typing-indicator {
          padding: 12px 18px;
          background: var(--bg-main);
          border: 1px solid var(--border-subtle);
          display: flex;
          gap: 6px;
          color: var(--accent);
        }

        .typing-dot {
          animation: blink 1.2s infinite ease-in-out both;
        }
        .typing-dot:nth-child(2) { animation-delay: 0.2s; }
        .typing-dot:nth-child(3) { animation-delay: 0.4s; }

        @keyframes blink {
          0%, 80%, 100% { opacity: 0.2; }
          40% { opacity: 1; }
        }

        .chat-input-form {
          border-top: 1px solid var(--border-strong);
          padding: 16px 20px;
          background: var(--bg-surface);
        }

        .input-box-wrapper {
          display: flex;
          gap: 12px;
          align-items: flex-end;
        }

        .chat-textarea {
          flex: 1;
          background: var(--bg-main);
          border: 1px solid var(--border-strong);
          color: var(--text-primary);
          padding: 10px 14px;
          font-size: 12px;
          resize: none;
          outline: none;
        }

        .chat-textarea:focus {
          border-color: var(--accent);
        }

        .btn-send-chat {
          height: 42px;
          padding: 0 20px;
        }

        .input-footer-note {
          margin-top: 8px;
          font-size: 9px;
          letter-spacing: 0.05em;
        }

        .notice-error {
          background: rgba(239, 68, 68, 0.1);
          border: 1px solid rgba(239, 68, 68, 0.3);
          border-left: 3px solid var(--status-critical);
          color: var(--status-critical);
          padding: 10px 14px;
          font-size: 11px;
          display: flex;
          align-items: center;
          gap: 8px;
        }

        .notice-close {
          margin-left: auto;
          background: transparent;
          border: none;
          color: inherit;
          cursor: pointer;
        }

        .spinning {
          animation: spin 1s linear infinite;
        }
        @keyframes spin {
          100% { transform: rotate(360deg); }
        }
        .text-accent { color: var(--accent); }
        .text-secondary { color: var(--text-secondary); }
        .text-tertiary { color: var(--text-tertiary); }
      `}</style>
    </div>
  );
}

export default AssistantPage;
