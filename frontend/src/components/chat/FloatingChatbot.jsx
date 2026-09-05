import React, { useState, useEffect, useRef } from 'react';
import { useServer } from '../../context/ServerContext';
import { sendChatMessageApi, getAiSettingsApi } from '../../services/ai';
import {
  Bot,
  Send,
  RefreshCw,
  Sparkles,
  X,
  Copy,
  Check,
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
                const Heading = block.level === 1 ? 'h4' : block.level === 2 ? 'h5' : 'h6';
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
   GLOBAL FLOATING CHATBOT COMPONENT
   ============================================================ */

export function FloatingChatbot() {
  const { selectedHost, activeServer } = useServer();
  const [isOpen, setIsOpen] = useState(false);
  const [aiConfig, setAiConfig] = useState(null);
  const [messages, setMessages] = useState([]);
  const [inputText, setInputText] = useState('');
  const [isSending, setIsSending] = useState(false);
  const [chatError, setChatError] = useState(null);

  const messagesEndRef = useRef(null);
  const inputRef = useRef(null);

  useEffect(() => {
    if (isOpen) {
      messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
      inputRef.current?.focus();
    }
  }, [messages, isSending, isOpen]);

  useEffect(() => {
    let isCancelled = false;

    async function loadConfig() {
      try {
        const config = await getAiSettingsApi();
        if (!isCancelled) {
          setAiConfig(config?.configured ? config : { configured: true, enabled: true, provider: 'ollama (mac-local)', model: config?.model || 'qwen3:1.7b' });
        }
      } catch {
        if (!isCancelled) {
          setAiConfig({ configured: true, enabled: true, provider: 'ollama (mac-local)', model: 'qwen3:1.7b' });
        }
      }
    }

    loadConfig();

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
      const res = await sendChatMessageApi(updated, {
        host: selectedHost || activeServer?.host || 'ubuntu',
        model: aiConfig?.model || 'qwen3:1.7b',
      });

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
      const msg = typeof errData?.detail === 'string'
        ? errData.detail
        : errData?.detail?.message || err?.message || 'Failed to generate AI response.';
      setChatError(msg);
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
    inputRef.current?.focus();
  };

  const currentHostLabel = (selectedHost || activeServer?.host || 'ubuntu').toUpperCase();

  return (
    <div className="floating-chatbot-container font-sans">
      {/* Floating Toggle Button */}
      <button
        type="button"
        onClick={() => setIsOpen((prev) => !prev)}
        className={`floating-chatbot-trigger neo-btn ${isOpen ? 'trigger-active' : ''}`}
        title={isOpen ? 'Close AI Copilot' : 'Open AI Engineering Copilot'}
      >
        <Sparkles size={16} className="text-accent" />
        <span className="font-mono font-bold text-xs">AI COPILOT</span>
        <span className="live-dot-small" />
      </button>

      {/* Popover Chat Window */}
      {isOpen && (
        <div className="floating-chat-window neo-card font-mono">
          {/* Header */}
          <div className="chat-window-header border-bottom">
            <div className="header-title-group">
              <Bot size={16} className="text-accent" />
              <div className="title-text-box">
                <span className="header-title font-bold">AI COPILOT</span>
                <span className="header-subtitle text-xs text-tertiary">MAC OLLAMA / QWEN3:1.7B</span>
              </div>
            </div>

            <div className="header-actions">
              <span className="editorial-pill pill-healthy font-mono text-xs">
                {currentHostLabel}
              </span>
              <button
                type="button"
                onClick={() => setIsOpen(false)}
                className="neo-btn close-btn"
                title="Close chat window"
              >
                <X size={14} />
              </button>
            </div>
          </div>

          {/* Messages Body */}
          <div className="chat-window-body">
            {messages.length === 0 ? (
              <div className="empty-chat-welcome">
                <div className="welcome-tag font-mono text-tertiary text-xs">
                  00 / CONTEXT-AWARE COPILOT READY FOR [{currentHostLabel}]
                </div>
                <p className="welcome-desc text-secondary text-xs margin-top-xs">
                  Ask infrastructure questions, analyze telemetry anomalies, or query forecast predictions. Grounded directly in live {currentHostLabel} platform context.
                </p>

                <div className="prompts-grid margin-top-sm">
                  <button
                    type="button"
                    onClick={() => handlePromptSelect(`What is the current health status of the ${currentHostLabel} server?`)}
                    className="prompt-pill text-xs font-mono"
                  >
                    Health status of {currentHostLabel}?
                  </button>
                  <button
                    type="button"
                    onClick={() => handlePromptSelect(`Explain recent anomaly signal deviations for ${currentHostLabel}.`)}
                    className="prompt-pill text-xs font-mono"
                  >
                    Explain anomaly signals
                  </button>
                  <button
                    type="button"
                    onClick={() => handlePromptSelect(`What does the ML forecast predict for CPU over the 3-hour horizon?`)}
                    className="prompt-pill text-xs font-mono"
                  >
                    3-hour CPU forecast
                  </button>
                  <button
                    type="button"
                    onClick={() => handlePromptSelect(`What command in Linux checks open network ports?`)}
                    className="prompt-pill text-xs font-mono"
                  >
                    Check Linux open ports
                  </button>
                </div>
              </div>
            ) : (
              <div className="messages-list">
                {messages.map((msg, idx) => {
                  const isUser = msg.role === 'user';
                  return (
                    <div
                      key={idx}
                      className={`chat-bubble-row ${isUser ? 'row-user' : 'row-assistant'}`}
                    >
                      <div className={`chat-bubble ${isUser ? 'bubble-user' : 'bubble-assistant'}`}>
                        <div className="bubble-header text-tertiary text-xs font-mono">
                          <span className="font-bold">{isUser ? 'YOU' : 'AI COPILOT'}</span>
                          <span className="bubble-time">{msg.timestamp}</span>
                        </div>
                        <div className="bubble-body">
                          {isUser ? (
                            <p className="user-text-content">{msg.content}</p>
                          ) : (
                            <ResponseRenderer content={msg.content} />
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            {isSending && (
              <div className="chat-bubble-row row-assistant">
                <div className="chat-bubble bubble-assistant loading-bubble font-mono text-xs">
                  <RefreshCw size={14} className="spinning text-accent margin-right-xs" />
                  <span>ANALYZING {currentHostLabel} CONTEXT & GENERATING RESPONSE...</span>
                </div>
              </div>
            )}

            {chatError && (
              <div className="neo-card font-mono text-critical text-xs margin-top-xs" style={{ padding: '10px' }}>
                <span className="editorial-pill pill-critical margin-right-xs">ERROR</span>
                <span>{chatError}</span>
              </div>
            )}

            <div ref={messagesEndRef} />
          </div>

          {/* Footer Input Bar */}
          <form onSubmit={handleSend} className="chat-window-footer border-top">
            <textarea
              ref={inputRef}
              value={inputText}
              onChange={(e) => setInputText(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder={`Ask Copilot about ${currentHostLabel}...`}
              rows={1}
              className="chat-textarea font-mono"
              disabled={isSending}
            />
            <button
              type="submit"
              disabled={!inputText.trim() || isSending}
              className="neo-btn send-btn"
              title="Send message"
            >
              <Send size={14} />
            </button>
          </form>
        </div>
      )}

      {/* Component Styles */}
      <style>{`
        .floating-chatbot-container {
          position: fixed;
          bottom: 20px;
          right: 20px;
          z-index: 1000;
        }

        .floating-chatbot-trigger {
          display: flex;
          align-items: center;
          gap: 8px;
          padding: 10px 16px;
          border-radius: 20px;
          background: var(--bg-surface);
          border: 1px solid var(--border-subtle);
          box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
          cursor: pointer;
          transition: transform 0.15s ease, box-shadow 0.15s ease;
        }

        .floating-chatbot-trigger:hover {
          transform: translateY(-2px);
          box-shadow: 0 6px 16px rgba(0, 0, 0, 0.2);
        }

        .floating-chat-window {
          position: fixed;
          bottom: 74px;
          right: 20px;
          width: 420px;
          height: 560px;
          max-height: calc(100vh - 100px);
          display: flex;
          flex-direction: column;
          background: var(--bg-surface);
          border: 1px solid var(--border-subtle);
          border-radius: 8px;
          box-shadow: 0 12px 32px rgba(0, 0, 0, 0.25);
          z-index: 1001;
          overflow: hidden;
        }

        @media (max-width: 640px) {
          .floating-chat-window {
            width: calc(100vw - 32px);
            height: calc(100vh - 48px);
            bottom: 16px;
            right: 16px;
          }
        }

        .chat-window-header {
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: 12px 16px;
          background: var(--bg-surface-elevated, var(--bg-surface));
        }

        .header-title-group {
          display: flex;
          align-items: center;
          gap: 10px;
        }

        .title-text-box {
          display: flex;
          flex-direction: column;
        }

        .header-title {
          font-size: 13px;
          letter-spacing: 0.05em;
        }

        .header-subtitle {
          font-size: 9px;
        }

        .header-actions {
          display: flex;
          align-items: center;
          gap: 8px;
        }

        .close-btn {
          padding: 4px;
          display: flex;
          align-items: center;
          justify-content: center;
        }

        .chat-window-body {
          flex: 1;
          overflow-y: auto;
          padding: 14px;
          display: flex;
          flex-direction: column;
          gap: 12px;
        }

        .empty-chat-welcome {
          padding: 12px 4px;
        }

        .prompts-grid {
          display: flex;
          flex-direction: column;
          gap: 6px;
        }

        .copilot-response {
          display: flex;
          flex-direction: column;
          gap: 8px;
          color: var(--text-primary);
        }

        .copilot-p {
          margin: 0;
          line-height: 1.5;
          color: var(--text-primary);
        }

        .copilot-heading {
          margin: 8px 0 4px 0;
          font-weight: 700;
          color: var(--text-primary);
        }

        .copilot-h4 { font-size: 13px; }
        .copilot-h5 { font-size: 12px; }
        .copilot-h6 { font-size: 11px; }

        .copilot-list {
          margin: 4px 0 4px 16px;
          padding: 0;
          color: var(--text-primary);
        }

        .copilot-inline-code {
          background: var(--bg-inset-deep, #e2e8f0);
          color: var(--text-primary);
          padding: 2px 5px;
          border-radius: 3px;
          font-size: 11px;
        }

        .copilot-code-block {
          background: var(--bg-inset-deep, #1e293b);
          border: 1px solid var(--border-subtle);
          border-radius: 4px;
          margin: 8px 0;
          overflow: hidden;
        }

        .code-block-header {
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: 6px 10px;
          background: rgba(0, 0, 0, 0.1);
          border-bottom: 1px solid var(--border-subtle);
          font-size: 10px;
        }

        .code-block-body {
          margin: 0;
          padding: 10px;
          overflow-x: auto;
          font-size: 11px;
          color: var(--text-primary);
        }

        .prompt-pill {
          text-align: left;
          padding: 8px 12px;
          background: var(--bg-inset, #f1f5f9);
          border: 1px dashed var(--border-subtle);
          border-radius: 4px;
          color: var(--text-secondary);
          cursor: pointer;
          transition: background 0.15s ease;
        }


        .prompt-pill:hover {
          background: var(--bg-surface-hover, #e2e8f0);
          color: var(--text-primary);
        }

        .messages-list {
          display: flex;
          flex-direction: column;
          gap: 12px;
        }

        .chat-bubble-row {
          display: flex;
          width: 100%;
        }

        .row-user {
          justify-content: flex-end;
        }

        .row-assistant {
          justify-content: flex-start;
        }

        .chat-bubble {
          max-width: 88%;
          padding: 10px 12px;
          border-radius: 6px;
          font-size: 12px;
          line-height: 1.45;
        }

        .bubble-user {
          background: var(--bg-inset-deep, #e2e8f0);
          color: var(--text-primary, #0f172a);
          border: 1px solid var(--border-subtle);
        }

        .bubble-assistant {
          background: var(--bg-surface-raised, var(--bg-surface, #ffffff));
          color: var(--text-primary, #0f172a);
          border: 1px solid var(--border-subtle);
        }

        .bubble-header {
          display: flex;
          justify-content: space-between;
          margin-bottom: 6px;
          font-size: 10px;
        }

        .user-text-content {
          margin: 0;
          white-space: pre-wrap;
          word-break: break-word;
          color: var(--text-primary);
        }

        .loading-bubble {
          display: flex;
          align-items: center;
          background: var(--bg-inset, #f1f5f9);
          color: var(--text-primary);
        }

        .chat-window-footer {
          display: flex;
          align-items: center;
          gap: 8px;
          padding: 10px;
          background: var(--bg-surface);
        }

        .chat-textarea {
          flex: 1;
          resize: none;
          background: var(--bg-inset, #f1f5f9);
          border: 1px solid var(--border-subtle);
          border-radius: 4px;
          padding: 8px 10px;
          font-size: 11px;
          color: var(--text-primary);
          outline: none;
        }


        .chat-textarea:focus {
          border-color: var(--accent);
        }

        .send-btn {
          padding: 8px 12px;
          display: flex;
          align-items: center;
          justify-content: center;
        }
      `}</style>
    </div>
  );
}
