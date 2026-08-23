import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router';
import PageHeader from '../../components/common/PageHeader';
import { useAuth } from '../../context/AuthContext';
import { useServer } from '../../context/ServerContext';
import { sendChatMessageApi, getAiSettingsApi } from '../../services/ai';
import {
  Bot,
  Send,
  RefreshCw,
  AlertCircle,
  Sliders,
  Sparkles,
  Terminal,
  User as UserIcon,
  Activity,
  Cpu,
  ShieldAlert,
  LineChart,
  Copy,
  Check,
  Server,
} from 'lucide-react';

/* ============================================================
   INLINE MARKDOWN RENDERER
   ============================================================ */

function InlineText({ children }) {
  const text = String(children ?? '');
  const parts = text.split(/(`[^`]+`|\*\*[^*]+\*\*|\*[^*]+\*)/g);

  return (
    <>
      {parts.map((part, index) => {
        if (part.startsWith('`') && part.endsWith('`')) {
          return (
            <code key={index} className="copilot-inline-code font-mono">
              {part.slice(1, -1)}
            </code>
          );
        }
        if (part.startsWith('**') && part.endsWith('**')) {
          return <strong key={index}>{part.slice(2, -2)}</strong>;
        }
        if (part.startsWith('*') && part.endsWith('*')) {
          return <em key={index}>{part.slice(1, -1)}</em>;
        }
        return <React.Fragment key={index}>{part}</React.Fragment>;
      })}
    </>
  );
}

function CodeBlock({ language, code }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = () => {
    if (!code) return;
    navigator.clipboard.writeText(code).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }).catch(() => {});
  };

  return (
    <div className="copilot-code-block font-mono">
      <div className="code-block-header">
        <span className="code-block-lang text-accent font-bold">{language || 'CODE'}</span>
        <button
          type="button"
          onClick={handleCopy}
          className="neo-btn code-copy-btn"
          title="Copy code"
        >
          {copied ? <Check size={11} className="text-healthy" /> : <Copy size={11} />}
          <span>{copied ? 'COPIED' : 'COPY'}</span>
        </button>
      </div>
      <pre className="code-block-body">
        <code>{code}</code>
      </pre>
    </div>
  );
}

function ResponseRenderer({ content }) {
  if (!content) return null;

  const normalized = content.replace(/\r\n/g, '\n').trim();
  const segments = normalized.split(/(```[\s\S]*?```)/g);

  return (
    <div className="copilot-response">
      {segments.map((segment, segmentIndex) => {
        if (!segment) return null;

        if (segment.startsWith('```') && segment.endsWith('```')) {
          const raw = segment.slice(3, -3);
          const firstNewline = raw.indexOf('\n');
          let language = 'code';
          let code = raw;

          if (firstNewline !== -1) {
            const possibleLang = raw.slice(0, firstNewline).trim();
            if (possibleLang && /^[a-zA-Z0-9+#.-]+$/.test(possibleLang)) {
              language = possibleLang;
              code = raw.slice(firstNewline + 1);
            }
          }

          return (
            <CodeBlock
              key={`code-${segmentIndex}`}
              language={language.toUpperCase()}
              code={code.trim()}
            />
          );
        }

        const lines = segment.split('\n');
        const blocks = [];
        let currentList = null;

        const flushList = () => {
          if (!currentList) return;
          blocks.push(currentList);
          currentList = null;
        };

        lines.forEach((rawLine, lineIndex) => {
          const line = rawLine.trim();
          if (!line) {
            flushList();
            return;
          }

          const headingMatch = line.match(/^(#{1,3})\s+(.+)$/);
          if (headingMatch) {
            flushList();
            blocks.push({
              type: 'heading',
              level: headingMatch[1].length,
              content: headingMatch[2],
              key: `${segmentIndex}-heading-${lineIndex}`,
            });
            return;
          }

          const bulletMatch = line.match(/^[-*•]\s+(.+)$/);
          if (bulletMatch) {
            if (!currentList || currentList.type !== 'ul') {
              flushList();
              currentList = { type: 'ul', items: [], key: `${segmentIndex}-ul-${lineIndex}` };
            }
            currentList.items.push(bulletMatch[1]);
            return;
          }

          const numberedMatch = line.match(/^\d+[.)]\s+(.+)$/);
          if (numberedMatch) {
            if (!currentList || currentList.type !== 'ol') {
              flushList();
              currentList = { type: 'ol', items: [], key: `${segmentIndex}-ol-${lineIndex}` };
            }
            currentList.items.push(numberedMatch[1]);
            return;
          }

          flushList();

          if (/^(-{3,}|\*{3,}|_{3,})$/.test(line)) {
            blocks.push({ type: 'hr', key: `${segmentIndex}-hr-${lineIndex}` });
            return;
          }

          blocks.push({
            type: 'paragraph',
            content: line,
            key: `${segmentIndex}-p-${lineIndex}`,
          });
        });

        flushList();

        return (
          <React.Fragment key={`segment-${segmentIndex}`}>
            {blocks.map((block) => {
              if (block.type === 'heading') {
                const Heading = block.level === 1 ? 'h3' : block.level === 2 ? 'h4' : 'h5';
                return (
                  <Heading key={block.key} className={`copilot-heading copilot-h${block.level}`}>
                    <InlineText>{block.content}</InlineText>
                  </Heading>
                );
              }
              if (block.type === 'ul') {
                return (
                  <ul key={block.key} className="copilot-list">
                    {block.items.map((item, idx) => (
                      <li key={idx}><InlineText>{item}</InlineText></li>
                    ))}
                  </ul>
                );
              }
              if (block.type === 'ol') {
                return (
                  <ol key={block.key} className="copilot-list copilot-ol">
                    {block.items.map((item, idx) => (
                      <li key={idx}><InlineText>{item}</InlineText></li>
                    ))}
                  </ol>
                );
              }
              if (block.type === 'hr') {
                return <hr key={block.key} className="copilot-hr" />;
              }
              return (
                <p key={block.key} className="copilot-p">
                  <InlineText>{block.content}</InlineText>
                </p>
              );
            })}
          </React.Fragment>
        );
      })}
    </div>
  );
}

/* ============================================================
   ASSISTANT PAGE
   ============================================================ */

export function AssistantPage() {
  const { user } = useAuth();
  const { activeServer } = useServer();
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

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isSending]);

  useEffect(() => {
    let isCancelled = false;

    async function checkConfiguration() {
      setCheckingConfig(true);
      try {
        const config = await getAiSettingsApi();
        if (!isCancelled) {
          setAiConfig(config);
        }
      } catch {
        if (!isCancelled) {
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
    const userMsg = {
      role: 'user',
      content: text,
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
    };

    const updated = [...messages, userMsg];
    setMessages(updated);
    setInputText('');
    setIsSending(true);

    try {
      const res = await sendChatMessageApi(updated);
      const assistantMsg = {
        role: 'assistant',
        content: res.message,
        provider: res.provider,
        model: res.model,
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      };
      setMessages([...updated, assistantMsg]);
    } catch (err) {
      const errData = err?.response?.data;
      if (errData?.detail?.code === 'AI_NOT_CONFIGURED') {
        setAiConfig({ configured: false, enabled: false });
      } else {
        const msg = typeof errData?.detail === 'string'
          ? errData.detail
          : errData?.detail?.message || err.message || 'Failed to generate AI response.';
        setChatError(msg);
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

  const isConfigured = aiConfig?.configured && aiConfig?.enabled;

  return (
    <div className="assistant-page font-sans">
      <PageHeader
        index="08"
        title="AI ASSISTANT"
        subtitle="Operational engineering copilot powered by local LLM backend."
        tag="ENGINEERING COPILOT"
      >
        {isConfigured && (
          <span className="editorial-pill pill-healthy font-mono">
            <Sparkles size={11} />
            {aiConfig.provider?.toUpperCase()} / {aiConfig.model?.toUpperCase()}
          </span>
        )}
      </PageHeader>

      {/* Loading state */}
      {checkingConfig && (
        <div className="neo-card-inset loading-box font-mono margin-top-md">
          <RefreshCw size={14} className="spinning text-accent" />
          <span>CONNECTING TO LOCAL AI ASSISTANT ENGINE...</span>
        </div>
      )}

      {/* Unconfigured state */}
      {!checkingConfig && !isConfigured && (
        <section className="neo-card unconfigured-card margin-top-md font-mono">
          <div className="unconfigured-header">
            <Bot size={22} className="text-tertiary" />
            <h3 className="unconfigured-title font-sans">LOCAL AI ENGINE UNAVAILABLE</h3>
          </div>
          <p className="unconfigured-desc font-sans text-xs text-secondary margin-top-xs">
            {isAdmin
              ? 'The local Ollama assistant service is currently disabled or unconfigured.'
              : 'The local AI assistant is currently unavailable. Contact system administrator.'}
          </p>
          {isAdmin && (
            <div className="margin-top-md">
              <button
                type="button"
                onClick={() => navigate('/settings#ai-assistant')}
                className="neo-btn neo-btn-primary"
              >
                <Sliders size={13} />
                <span>CONFIGURE AI SETTINGS</span>
              </button>
            </div>
          )}
        </section>
      )}

      {/* COPILOT CHAT WORKSPACE */}
      {!checkingConfig && isConfigured && (
        <div className="neo-card copilot-workspace margin-top-md">
          {/* Status strip */}
          <div className="copilot-status-strip font-mono">
            <div className="status-item">
              <span className="live-dot-small" />
              <span>MODEL ONLINE</span>
            </div>
            <div className="status-item">
              <Cpu size={12} />
              <span>{aiConfig.model}</span>
            </div>
            <div className="status-item">
              <Server size={12} />
              <span>NODE: {activeServer.name.toUpperCase()}</span>
            </div>
          </div>

          {/* Messages Surface */}
          <div className="copilot-messages-log neo-card-inset">
            {messages.length === 0 && (
              <div className="empty-copilot-hero">
                <div className="empty-icon-box">
                  <Terminal size={22} className="text-accent" />
                </div>
                <h4 className="empty-hero-title font-sans">SERVER INTELLIGENCE COPILOT</h4>
                <p className="empty-hero-sub text-secondary text-xs font-sans margin-top-xs">
                  Ask operational queries regarding node telemetry, capacity saturation forecasts, or Isolation Forest anomalies.
                </p>

                <div className="copilot-capabilities font-mono margin-top-md">
                  <div className="cap-pill"><Activity size={12} /><span>TELEMETRY</span></div>
                  <div className="cap-pill"><LineChart size={12} /><span>FORECASTS</span></div>
                  <div className="cap-pill"><ShieldAlert size={12} /><span>ANOMALIES</span></div>
                </div>

                <div className="prompt-suggestions font-mono margin-top-md">
                  <span className="suggestions-label text-tertiary">QUICK PROMPTS:</span>
                  <div className="suggestions-grid margin-top-xs">
                    <button
                      type="button"
                      onClick={() => handlePromptSelect('Is the server healthy right now?')}
                      className="suggestion-btn"
                    >
                      Is the server healthy right now?
                    </button>
                    <button
                      type="button"
                      onClick={() => handlePromptSelect('What is the current CPU and memory usage?')}
                      className="suggestion-btn"
                    >
                      What is the current CPU and memory usage?
                    </button>
                    <button
                      type="button"
                      onClick={() => handlePromptSelect('What does the CPU forecast look like for the next 3 hours?')}
                      className="suggestion-btn"
                    >
                      What does the CPU forecast look like for next 3 hours?
                    </button>
                    <button
                      type="button"
                      onClick={() => handlePromptSelect('Are there any anomalies detected across metrics?')}
                      className="suggestion-btn"
                    >
                      Are there any anomalies detected?
                    </button>
                  </div>
                </div>
              </div>
            )}

            {/* Messages */}
            {messages.map((msg, index) => (
              <div
                key={index}
                className={`message-wrapper ${msg.role === 'user' ? 'msg-user' : 'msg-assistant'}`}
              >
                <div className="msg-meta font-mono text-xs text-tertiary">
                  {msg.role === 'user' ? (
                    <>
                      <UserIcon size={12} />
                      <span>YOU ({user?.username?.toUpperCase() || 'USER'})</span>
                    </>
                  ) : (
                    <>
                      <Bot size={12} className="text-accent" />
                      <span>COPILOT ({msg.model || aiConfig?.model})</span>
                    </>
                  )}
                  {msg.timestamp && <span className="msg-time">{msg.timestamp}</span>}
                </div>

                <div className={`msg-card ${msg.role === 'user' ? 'neo-card-raised' : 'neo-card'}`}>
                  {msg.role === 'assistant' ? (
                    <ResponseRenderer content={msg.content} />
                  ) : (
                    <p className="user-msg-text font-mono">{msg.content}</p>
                  )}
                </div>
              </div>
            ))}

            {/* Thinking indicator */}
            {isSending && (
              <div className="message-wrapper msg-assistant">
                <div className="msg-meta font-mono text-xs text-tertiary">
                  <Bot size={12} className="text-accent spinning" />
                  <span>COPILOT EVALUATING...</span>
                </div>
                <div className="neo-card msg-card typing-indicator font-mono">
                  <span className="dot">●</span>
                  <span className="dot">●</span>
                  <span className="dot">●</span>
                </div>
              </div>
            )}

            {chatError && (
              <div className="editorial-notice-banner notice-error font-mono margin-top-sm">
                <AlertCircle size={14} />
                <span>{chatError}</span>
                <button type="button" onClick={() => setChatError(null)} className="notice-close">✕</button>
              </div>
            )}

            <div ref={messagesEndRef} />
          </div>

          {/* Composer */}
          <form onSubmit={handleSend} className="copilot-composer font-mono">
            <div className="composer-wrapper">
              <textarea
                ref={textareaRef}
                value={inputText}
                onChange={(e) => setInputText(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="Ask about node health or telemetry trends... (Enter to send, Shift+Enter for newline)"
                rows={2}
                disabled={isSending}
                className="neo-input composer-textarea"
              />
              <button
                type="submit"
                disabled={isSending || !inputText.trim()}
                className="neo-btn neo-btn-primary btn-send"
              >
                {isSending ? <RefreshCw size={13} className="spinning" /> : <><Send size={13} /><span>SEND</span></>}
              </button>
            </div>
          </form>
        </div>
      )}

      <style>{`
        .margin-top-xs { margin-top: 4px; }
        .margin-top-sm { margin-top: 8px; }
        .margin-top-md { margin-top: 16px; }

        .loading-box {
          padding: 20px;
          display: flex;
          align-items: center;
          gap: 10px;
          color: var(--text-tertiary);
          font-size: 11px;
        }

        .unconfigured-card {
          padding: 24px;
          border-left: 3px solid var(--status-warning);
        }

        .unconfigured-header {
          display: flex;
          align-items: center;
          gap: 10px;
        }

        .copilot-workspace {
          padding: 0;
          display: flex;
          flex-direction: column;
          height: calc(100vh - 220px);
          min-height: 500px;
          overflow: hidden;
        }

        .copilot-status-strip {
          display: flex;
          align-items: center;
          gap: 14px;
          padding: 10px 16px;
          background: var(--bg-surface);
          border-bottom: 1px solid var(--border-subtle);
        }

        .status-item {
          display: flex;
          align-items: center;
          gap: 5px;
          font-size: 10px;
          color: var(--text-secondary);
        }

        .copilot-messages-log {
          flex: 1;
          padding: 20px;
          overflow-y: auto;
          display: flex;
          flex-direction: column;
          gap: 16px;
          border-radius: 0;
        }

        .empty-copilot-hero {
          margin: auto;
          max-width: 620px;
          text-align: center;
          padding: 16px 0;
        }

        .empty-icon-box {
          width: 42px;
          height: 42px;
          background: var(--bg-surface);
          border-radius: var(--radius-md);
          border: 1px solid var(--border-subtle);
          display: flex;
          align-items: center;
          justify-content: center;
          margin: 0 auto 10px;
        }

        .empty-hero-title {
          font-size: 15px;
          font-weight: 700;
          color: var(--text-primary);
        }

        .copilot-capabilities {
          display: flex;
          justify-content: center;
          gap: 10px;
          flex-wrap: wrap;
        }

        .cap-pill {
          display: flex;
          align-items: center;
          gap: 5px;
          padding: 4px 10px;
          background: var(--bg-surface);
          border: 1px solid var(--border-subtle);
          border-radius: var(--radius-pill);
          font-size: 10px;
          color: var(--text-secondary);
        }

        .suggestions-grid {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(240px, 1fr));
          gap: 8px;
        }

        .suggestion-btn {
          background: var(--bg-surface);
          border: 1px solid var(--border-subtle);
          border-radius: var(--radius-md);
          color: var(--text-secondary);
          padding: 8px 12px;
          font-size: 11px;
          text-align: left;
          cursor: pointer;
          transition: all 0.15s ease;
        }

        .suggestion-btn:hover {
          border-color: var(--accent);
          color: var(--accent);
        }

        .message-wrapper {
          display: flex;
          flex-direction: column;
          gap: 4px;
          max-width: 85%;
        }

        .msg-user {
          align-self: flex-end;
        }

        .msg-assistant {
          align-self: flex-start;
          width: 100%;
        }

        .msg-meta {
          display: flex;
          align-items: center;
          gap: 6px;
        }

        .msg-time {
          margin-left: 4px;
          font-size: 9px;
        }

        .msg-card {
          padding: 12px 16px;
          border-radius: var(--radius-md);
        }

        .msg-user .msg-card {
          background: var(--bg-surface);
          border: 1px solid var(--accent-border);
        }

        .msg-assistant .msg-card {
          background: var(--bg-surface);
          border-left: 3px solid var(--accent);
        }

        .user-msg-text {
          margin: 0;
          font-size: 12px;
          line-height: 1.5;
        }

        .copilot-response {
          font-family: var(--font-sans);
          font-size: 12px;
          line-height: 1.6;
          color: var(--text-primary);
        }

        .copilot-p { margin: 0 0 8px; }
        .copilot-p:last-child { margin-bottom: 0; }

        .copilot-heading {
          font-family: var(--font-mono);
          margin: 12px 0 6px;
          color: var(--text-primary);
        }

        .copilot-h1 { font-size: 14px; font-weight: 700; border-bottom: 1px solid var(--border-subtle); padding-bottom: 3px; }
        .copilot-h2 { font-size: 13px; font-weight: 700; }
        .copilot-h3 { font-size: 12px; font-weight: 600; color: var(--accent); }

        .copilot-list { margin: 6px 0 10px 18px; padding: 0; }
        .copilot-list li { margin-bottom: 3px; }

        .copilot-inline-code {
          background: var(--bg-inset);
          border: 1px solid var(--border-subtle);
          padding: 1px 5px;
          font-size: 11px;
          color: var(--accent);
          border-radius: var(--radius-sm);
        }

        .copilot-code-block {
          margin: 10px 0;
          background: var(--bg-inset-deep);
          border: 1px solid var(--border-subtle);
          border-radius: var(--radius-md);
          overflow: hidden;
        }

        .code-block-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          padding: 4px 10px;
          background: var(--bg-surface);
          border-bottom: 1px solid var(--border-subtle);
          font-size: 10px;
        }

        .code-copy-btn {
          height: 24px;
          padding: 0 6px;
          font-size: 9px;
        }

        .code-block-body {
          margin: 0;
          padding: 10px 12px;
          overflow-x: auto;
          font-family: var(--font-mono);
          font-size: 11px;
          line-height: 1.5;
        }

        .typing-indicator {
          display: flex;
          gap: 4px;
          color: var(--accent);
        }

        .typing-indicator .dot {
          animation: blink 1.4s infinite both;
          font-size: 12px;
        }
        .typing-indicator .dot:nth-child(2) { animation-delay: .2s; }
        .typing-indicator .dot:nth-child(3) { animation-delay: .4s; }

        @keyframes blink {
          0%, 80%, 100% { opacity: 0.2; }
          40% { opacity: 1; }
        }

        .copilot-composer {
          padding: 12px 16px;
          background: var(--bg-surface);
          border-top: 1px solid var(--border-subtle);
        }

        .composer-wrapper {
          display: flex;
          gap: 10px;
          align-items: flex-end;
        }

        .composer-textarea {
          flex: 1;
          min-height: 48px;
          max-height: 100px;
          resize: none;
          padding: 10px 12px;
          font-size: 12px;
        }

        .btn-send {
          height: 48px;
          padding: 0 18px;
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

export default AssistantPage;
