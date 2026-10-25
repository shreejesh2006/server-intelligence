import React, { useState, useEffect, useRef } from 'react';
import { useServer } from '../../context/ServerContext';
import { sendChatMessageApi, getAiSettingsApi } from '../../services/ai';
import {
  Sparkles,
  Send,
  RefreshCw,
  X,
  Copy,
  Check
} from 'lucide-react';

function InlineText({ children }) {
  const text = String(children ?? '');
  const parts = text.split(/(`[^`]+`|\*\*[^*]+\*\*|\*[^*]+\*)/g);

  return (
    <>
      {parts.map((part, index) => {
        if (part.startsWith('`') && part.endsWith('`')) {
          return (
            <code key={index} className="chat-inline-code font-mono">
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
    <div className="chat-code-block font-mono">
      <div className="code-block-header">
        <span className="code-lang">{language || 'code'}</span>
        <button
          type="button"
          onClick={handleCopy}
          className="code-copy-btn"
          title="Copy code"
        >
          {copied ? <Check size={12} className="text-healthy" /> : <Copy size={12} />}
          <span>{copied ? 'Copied' : 'Copy'}</span>
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
    <div className="chat-response">
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
              language={language.toLowerCase()}
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
                  <Heading key={block.key} className={`chat-heading chat-h${block.level}`}>
                    <InlineText>{block.content}</InlineText>
                  </Heading>
                );
              }
              if (block.type === 'ul') {
                return (
                  <ul key={block.key} className="chat-list">
                    {block.items.map((item, idx) => (
                      <li key={idx}><InlineText>{item}</InlineText></li>
                    ))}
                  </ul>
                );
              }
              if (block.type === 'ol') {
                return (
                  <ol key={block.key} className="chat-list chat-ol">
                    {block.items.map((item, idx) => (
                      <li key={idx}><InlineText>{item}</InlineText></li>
                    ))}
                  </ol>
                );
              }
              if (block.type === 'hr') {
                return <hr key={block.key} className="chat-hr" />;
              }
              return (
                <p key={block.key} className="chat-p">
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

export function FloatingChatbot({ isOpenOverride, onCloseOverride }) {
  const { selectedHost, activeServer } = useServer();
  const [isOpenInternal, setIsOpenInternal] = useState(false);
  const [aiConfig, setAiConfig] = useState(null);
  const [messages, setMessages] = useState([]);
  const [inputText, setInputText] = useState('');
  const [isSending, setIsSending] = useState(false);
  const [chatError, setChatError] = useState(null);

  const messagesEndRef = useRef(null);
  const inputRef = useRef(null);

  const isOpen = isOpenOverride !== undefined ? isOpenOverride : isOpenInternal;

  const toggleOpen = () => {
    if (onCloseOverride && isOpen) {
      onCloseOverride();
    } else {
      setIsOpenInternal((prev) => !prev);
    }
  };

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
          setAiConfig(config?.configured ? config : { configured: true, enabled: true, provider: 'ollama', model: config?.model || 'qwen3:1.7b' });
        }
      } catch {
        if (!isCancelled) {
          setAiConfig({ configured: true, enabled: true, provider: 'ollama', model: 'qwen3:1.7b' });
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
        content: res?.message || 'No response generated by assistant.',
        provider: res?.provider,
        model: res?.model,
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      };
      setMessages([...updated, assistantMsg]);
    } catch (err) {
      const errData = err?.response?.data;
      let msg = typeof errData?.detail === 'string'
        ? errData.detail
        : errData?.detail?.message || err?.message || 'Failed to generate AI response.';

      if (msg.includes('Could not connect to local Ollama') || msg.includes('Connection refused')) {
        msg = 'Could not connect to local Ollama service (port 11434). Ensure Ollama is running (`ollama serve`) or configure an alternative provider in Settings.';
      }
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

  const currentHostLabel = selectedHost || activeServer?.host || 'ubuntu';

  return (
    <div className="floating-chatbot-container font-sans">
      {/* Floating Toggle Button: Ask NOKIA */}
      {!isOpen && (
        <button
          type="button"
          onClick={toggleOpen}
          className="ask-nokia-trigger"
          title="Ask Netra Assistant"
        >
          <Sparkles size={15} />
          <span>Ask Netra</span>
        </button>
      )}

      {/* Popover / Drawer Panel */}
      {isOpen && (
        <div className="floating-chat-drawer">
          {/* Header */}
          <div className="chat-drawer-header">
            <div className="header-title-group">
              <Sparkles size={16} className="text-primary" />
              <div>
                <div className="header-title font-medium">Ask Netra</div>
                <div className="header-subtitle">{currentHostLabel} context</div>
              </div>
            </div>

            <div className="header-actions">
              {messages.length > 0 && (
                <button
                  type="button"
                  onClick={() => { setMessages([]); setChatError(null); }}
                  className="drawer-action-btn"
                  title="Clear conversation"
                >
                  <RefreshCw size={13} />
                </button>
              )}
              <button
                type="button"
                onClick={toggleOpen}
                className="drawer-close-btn"
                title="Close chat"
              >
                <X size={15} />
              </button>
            </div>
          </div>

          {/* Messages Body */}
          <div className="chat-drawer-body">
            {messages.length === 0 ? (
              <div className="chat-welcome">
                <p className="welcome-desc">
                  Ask anything about {currentHostLabel} server telemetry, anomalies, forecasts, logs, or infrastructure inventory.
                </p>

                <div className="prompts-list">
                  <button
                    type="button"
                    onClick={() => handlePromptSelect("What is the current status of the Ubuntu server?")}
                    className="prompt-pill"
                  >
                    What is the current status of the Ubuntu server?
                  </button>
                  <button
                    type="button"
                    onClick={() => handlePromptSelect("What does the latest CPU and memory telemetry show?")}
                    className="prompt-pill"
                  >
                    What does the latest CPU and memory telemetry show?
                  </button>
                  <button
                    type="button"
                    onClick={() => handlePromptSelect("What forecasts are available?")}
                    className="prompt-pill"
                  >
                    What forecasts are available?
                  </button>
                  <button
                    type="button"
                    onClick={() => handlePromptSelect("Are there any anomalies?")}
                    className="prompt-pill"
                  >
                    Are there any anomalies?
                  </button>
                  <button
                    type="button"
                    onClick={() => handlePromptSelect("Show relevant logs for the Ubuntu host.")}
                    className="prompt-pill"
                  >
                    Show relevant logs for the Ubuntu host.
                  </button>
                  <button
                    type="button"
                    onClick={() => handlePromptSelect("What inventory information is available?")}
                    className="prompt-pill"
                  >
                    What inventory information is available?
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
                      className={`chat-row ${isUser ? 'row-user' : 'row-assistant'}`}
                    >
                      <div className={`chat-bubble ${isUser ? 'bubble-user' : 'bubble-assistant'}`}>
                        {isUser ? (
                          <p className="user-text">{msg.content}</p>
                        ) : (
                          <ResponseRenderer content={msg.content} />
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            {isSending && (
              <div className="chat-row row-assistant">
                <div className="chat-bubble bubble-assistant loading-bubble">
                  <RefreshCw size={13} className="spinning" />
                  <span>Thinking...</span>
                </div>
              </div>
            )}

            {chatError && (
              <div className="chat-error-banner">
                <span>{chatError}</span>
              </div>
            )}

            <div ref={messagesEndRef} />
          </div>

          {/* Footer Input Bar */}
          <form onSubmit={handleSend} className="chat-drawer-footer">
            <input
              ref={inputRef}
              type="text"
              value={inputText}
              onChange={(e) => setInputText(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder={`Ask about ${currentHostLabel}...`}
              className="chat-input"
              disabled={isSending}
            />
            <button
              type="submit"
              disabled={!inputText.trim() || isSending}
              className="send-btn"
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
          bottom: 24px;
          right: 24px;
          z-index: 1000;
        }

        .ask-nokia-trigger {
          display: flex;
          align-items: center;
          gap: 8px;
          padding: 10px 16px;
          border-radius: var(--radius-lg);
          background-color: var(--bg-surface);
          color: var(--text-primary);
          border: 1px solid var(--border-subtle);
          box-shadow: 0 4px 16px rgba(0, 0, 0, 0.08);
          font-family: var(--font-sans);
          font-size: 13px;
          font-weight: 500;
          cursor: pointer;
          transition: all 0.15s ease;
        }

        .ask-nokia-trigger:hover {
          transform: translateY(-1px);
          box-shadow: 0 6px 20px rgba(0, 0, 0, 0.12);
          border-color: var(--border-strong);
        }

        .floating-chat-drawer {
          position: fixed;
          bottom: 24px;
          right: 24px;
          width: 380px;
          height: 520px;
          max-height: calc(100vh - 48px);
          display: flex;
          flex-direction: column;
          background-color: var(--bg-surface);
          border: 1px solid var(--border-subtle);
          border-radius: var(--radius-lg);
          box-shadow: 0 12px 32px rgba(0, 0, 0, 0.12);
          z-index: 1001;
          overflow: hidden;
        }

        @media (max-width: 640px) {
          .floating-chat-drawer {
            width: calc(100vw - 32px);
            height: calc(100vh - 48px);
            bottom: 16px;
            right: 16px;
          }
        }

        .chat-drawer-header {
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: 12px 16px;
          border-bottom: 1px solid var(--border-subtle);
          background-color: var(--bg-surface);
        }

        .header-title-group {
          display: flex;
          align-items: center;
          gap: 10px;
        }

        .header-title {
          font-size: 14px;
          color: var(--text-primary);
        }

        .header-subtitle {
          font-size: 11px;
          color: var(--text-muted);
        }

        .header-actions {
          display: flex;
          align-items: center;
          gap: 6px;
        }

        .drawer-action-btn {
          background: none;
          border: none;
          color: var(--text-muted);
          padding: 4px;
          border-radius: var(--radius-sm);
          cursor: pointer;
          display: flex;
          align-items: center;
          justify-content: center;
          transition: all 0.15s ease;
        }

        .drawer-action-btn:hover {
          color: var(--text-primary);
          background-color: var(--bg-subtle);
        }

        .drawer-close-btn {
          background: transparent;
          border: none;
          color: var(--text-muted);
          padding: 4px;
          border-radius: var(--radius-sm);
          cursor: pointer;
          display: flex;
          align-items: center;
          justify-content: center;
        }

        .drawer-close-btn:hover {
          color: var(--text-primary);
          background-color: var(--bg-subtle);
        }

        .chat-drawer-body {
          flex: 1;
          overflow-y: auto;
          padding: 16px;
          display: flex;
          flex-direction: column;
          gap: 12px;
        }

        .chat-welcome {
          display: flex;
          flex-direction: column;
          gap: 12px;
        }

        .welcome-desc {
          font-size: 13px;
          color: var(--text-secondary);
        }

        .prompts-list {
          display: flex;
          flex-direction: column;
          gap: 6px;
        }

        .prompt-pill {
          text-align: left;
          padding: 8px 12px;
          background-color: var(--bg-subtle);
          border: 1px solid var(--border-subtle);
          border-radius: var(--radius-sm);
          color: var(--text-primary);
          font-family: var(--font-sans);
          font-size: 12px;
          cursor: pointer;
          transition: all 0.15s ease;
        }

        .prompt-pill:hover {
          border-color: var(--border-strong);
          background-color: var(--bg-surface-hover);
        }

        .messages-list {
          display: flex;
          flex-direction: column;
          gap: 10px;
        }

        .chat-row {
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
          max-width: 85%;
          padding: 8px 12px;
          border-radius: var(--radius-md);
          font-size: 13px;
          line-height: 1.45;
        }

        .bubble-user {
          background-color: var(--accent-primary);
          color: var(--bg-canvas);
        }

        .bubble-assistant {
          background-color: var(--bg-subtle);
          color: var(--text-primary);
        }

        .user-text {
          margin: 0;
          white-space: pre-wrap;
        }

        .chat-response {
          display: flex;
          flex-direction: column;
          gap: 6px;
        }

        .chat-p {
          margin: 0;
        }

        .chat-heading {
          font-weight: 600;
          margin-top: 6px;
        }

        .chat-list {
          margin: 4px 0 4px 16px;
          padding: 0;
        }

        .chat-inline-code {
          background: rgba(0, 0, 0, 0.06);
          padding: 2px 4px;
          border-radius: 3px;
          font-size: 11px;
        }

        .chat-code-block {
          background: var(--bg-canvas);
          border: 1px solid var(--border-subtle);
          border-radius: var(--radius-sm);
          margin: 6px 0;
          overflow: hidden;
        }

        .code-block-header {
          display: flex;
          justify-content: space-between;
          padding: 4px 8px;
          background: var(--bg-subtle);
          font-size: 10px;
          color: var(--text-muted);
        }

        .code-copy-btn {
          background: transparent;
          border: none;
          cursor: pointer;
          display: flex;
          align-items: center;
          gap: 4px;
          font-size: 10px;
          color: var(--text-muted);
        }

        .code-block-body {
          padding: 8px;
          margin: 0;
          overflow-x: auto;
          font-size: 11px;
        }

        .loading-bubble {
          display: flex;
          align-items: center;
          gap: 8px;
          color: var(--text-muted);
        }

        .spinning {
          animation: spin 1s linear infinite;
        }

        @keyframes spin { 100% { transform: rotate(360deg); } }

        .chat-error-banner {
          padding: 8px;
          border-radius: var(--radius-sm);
          background-color: var(--status-critical-bg);
          color: var(--status-critical);
          font-size: 12px;
        }

        .chat-drawer-footer {
          display: flex;
          align-items: center;
          gap: 8px;
          padding: 10px;
          border-top: 1px solid var(--border-subtle);
          background-color: var(--bg-surface);
        }

        .chat-input {
          flex: 1;
          background-color: var(--bg-subtle);
          border: 1px solid var(--border-subtle);
          border-radius: var(--radius-sm);
          padding: 8px 12px;
          font-family: var(--font-sans);
          font-size: 13px;
          color: var(--text-primary);
          outline: none;
        }

        .chat-input:focus {
          border-color: var(--border-strong);
        }

        .send-btn {
          width: 32px;
          height: 32px;
          display: flex;
          align-items: center;
          justify-content: center;
          background-color: var(--accent-primary);
          color: var(--bg-canvas);
          border: none;
          border-radius: var(--radius-sm);
          cursor: pointer;
        }

        .send-btn:disabled {
          opacity: 0.4;
          cursor: not-allowed;
        }
      `}</style>
    </div>
  );
}

export default FloatingChatbot;
