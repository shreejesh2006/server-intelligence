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
   MARKDOWN-LIKE RESPONSE RENDERER
   Lightweight renderer for operational AI responses.
   No external markdown dependency required.
   ============================================================ */

function InlineText({ children }) {
  const text = String(children ?? '');

  const parts = text.split(
    /(`[^`]+`|\*\*[^*]+\*\*|\*[^*]+\*)/g
  );

  return (
    <>
      {parts.map((part, index) => {
        if (part.startsWith('`') && part.endsWith('`')) {
          return (
            <code key={index} className="assistant-inline-code">
              {part.slice(1, -1)}
            </code>
          );
        }

        if (part.startsWith('**') && part.endsWith('**')) {
          return (
            <strong key={index}>
              {part.slice(2, -2)}
            </strong>
          );
        }

        if (part.startsWith('*') && part.endsWith('*')) {
          return (
            <em key={index}>
              {part.slice(1, -1)}
            </em>
          );
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
    <div className="assistant-code-block font-mono">
      <div className="code-block-header">
        <span className="code-block-lang">{language || 'CODE'}</span>
        <button
          type="button"
          onClick={handleCopy}
          className="code-copy-btn"
          title="Copy code to clipboard"
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

  /*
   * Split fenced code blocks first so normal Markdown parsing
   * cannot accidentally modify their contents.
   */
  const segments = normalized.split(/(```[\s\S]*?```)/g);

  return (
    <div className="assistant-response">
      {segments.map((segment, segmentIndex) => {
        if (!segment) return null;

        // -------------------------------
        // Fenced code block
        // -------------------------------
        if (
          segment.startsWith('```') &&
          segment.endsWith('```')
        ) {
          const raw = segment.slice(3, -3);

          const firstNewline = raw.indexOf('\n');

          let language = 'code';
          let code = raw;

          if (firstNewline !== -1) {
            const possibleLanguage = raw
              .slice(0, firstNewline)
              .trim();

            if (
              possibleLanguage &&
              /^[a-zA-Z0-9+#.-]+$/.test(possibleLanguage)
            ) {
              language = possibleLanguage;
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

        // -------------------------------
        // Normal text
        // -------------------------------

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

          // Blank line
          if (!line) {
            flushList();
            return;
          }

          // H1 / H2 / H3
          const headingMatch = line.match(/^(#{1,3})\s+(.+)$/);

          if (headingMatch) {
            flushList();

            const level = headingMatch[1].length;

            blocks.push({
              type: 'heading',
              level,
              content: headingMatch[2],
              key: `${segmentIndex}-heading-${lineIndex}`,
            });

            return;
          }

          // Bullet list
          const bulletMatch = line.match(/^[-*•]\s+(.+)$/);

          if (bulletMatch) {
            if (!currentList || currentList.type !== 'ul') {
              flushList();

              currentList = {
                type: 'ul',
                items: [],
                key: `${segmentIndex}-ul-${lineIndex}`,
              };
            }

            currentList.items.push(bulletMatch[1]);
            return;
          }

          // Numbered list
          const numberedMatch = line.match(/^\d+[.)]\s+(.+)$/);

          if (numberedMatch) {
            if (!currentList || currentList.type !== 'ol') {
              flushList();

              currentList = {
                type: 'ol',
                items: [],
                key: `${segmentIndex}-ol-${lineIndex}`,
              };
            }

            currentList.items.push(numberedMatch[1]);
            return;
          }

          flushList();

          // Horizontal separator
          if (/^(-{3,}|\*{3,}|_{3,})$/.test(line)) {
            blocks.push({
              type: 'hr',
              key: `${segmentIndex}-hr-${lineIndex}`,
            });

            return;
          }

          // Normal paragraph
          blocks.push({
            type: 'paragraph',
            content: line,
            key: `${segmentIndex}-paragraph-${lineIndex}`,
          });
        });

        flushList();

        return (
          <React.Fragment key={`segment-${segmentIndex}`}>
            {blocks.map((block) => {
              if (block.type === 'heading') {
                const Heading =
                  block.level === 1
                    ? 'h3'
                    : block.level === 2
                      ? 'h4'
                      : 'h5';

                return (
                  <Heading
                    key={block.key}
                    className={`assistant-heading assistant-heading-${block.level}`}
                  >
                    <InlineText>
                      {block.content}
                    </InlineText>
                  </Heading>
                );
              }

              if (block.type === 'ul') {
                return (
                  <ul
                    key={block.key}
                    className="assistant-list"
                  >
                    {block.items.map((item, index) => (
                      <li key={index}>
                        <InlineText>{item}</InlineText>
                      </li>
                    ))}
                  </ul>
                );
              }

              if (block.type === 'ol') {
                return (
                  <ol
                    key={block.key}
                    className="assistant-list assistant-ordered-list"
                  >
                    {block.items.map((item, index) => (
                      <li key={index}>
                        <InlineText>{item}</InlineText>
                      </li>
                    ))}
                  </ol>
                );
              }

              if (block.type === 'hr') {
                return (
                  <hr
                    key={block.key}
                    className="assistant-divider"
                  />
                );
              }

              return (
                <p
                  key={block.key}
                  className="assistant-paragraph"
                >
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
    messagesEndRef.current?.scrollIntoView({
      behavior: 'smooth',
    });
  }, [messages, isSending]);


  /* ----------------------------------------------------------
     Load AI configuration
     ---------------------------------------------------------- */

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
          setAiConfig({
            configured: false,
            enabled: false,
          });
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


  /* ----------------------------------------------------------
     Send message
     ---------------------------------------------------------- */

  const handleSend = async (event) => {
    if (event) {
      event.preventDefault();
    }

    const text = inputText.trim();

    if (!text || isSending) {
      return;
    }

    setChatError(null);

    const userMessage = {
      role: 'user',
      content: text,
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
    };

    const updatedMessages = [
      ...messages,
      userMessage,
    ];

    setMessages(updatedMessages);
    setInputText('');
    setIsSending(true);

    try {
      const response = await sendChatMessageApi(
        updatedMessages
      );

      const assistantMessage = {
        role: 'assistant',
        content: response.message,
        provider: response.provider,
        model: response.model,
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      };

      setMessages([
        ...updatedMessages,
        assistantMessage,
      ]);
    } catch (err) {
      const errorData = err?.response?.data;

      if (
        errorData?.detail?.code ===
        'AI_NOT_CONFIGURED'
      ) {
        setAiConfig({
          configured: false,
          enabled: false,
        });
      } else {
        const errorMessage =
          typeof errorData?.detail === 'string'
            ? errorData.detail
            : errorData?.detail?.message ||
              err.message ||
              'Failed to generate AI response.';

        setChatError(errorMessage);
      }
    } finally {
      setIsSending(false);
    }
  };


  const handleKeyDown = (event) => {
    if (
      event.key === 'Enter' &&
      !event.shiftKey
    ) {
      event.preventDefault();
      handleSend();
    }
  };


  const handlePromptSelect = (promptText) => {
    setInputText(promptText);
    textareaRef.current?.focus();
  };


  const isConfigured =
    aiConfig?.configured &&
    aiConfig?.enabled;


  return (
    <div className="assistant-page font-mono">

      <PageHeader
        index="08"
        title="AI ASSISTANT"
        subtitle="Local operational intelligence powered by the Ubuntu server."
        tag="LOCAL AI"
      >
        {isConfigured && (
          <span className="editorial-pill pill-healthy font-mono">
            <Sparkles size={11} />
            {aiConfig.provider?.toUpperCase()}
            {' / '}
            {aiConfig.model?.toUpperCase()}
          </span>
        )}
      </PageHeader>


      {/* ======================================================
          LOADING
          ====================================================== */}

      {checkingConfig && (
        <div className="assistant-loading-box font-mono">
          <RefreshCw
            size={16}
            className="spinning text-accent"
          />
          <span>CONNECTING TO LOCAL AI...</span>
        </div>
      )}


      {/* ======================================================
          NOT CONFIGURED
          ====================================================== */}

      {!checkingConfig && !isConfigured && (
        <section className="unconfigured-card">
          <div className="unconfigured-header">
            <Bot
              size={24}
              className="text-secondary"
            />
            <h3 className="unconfigured-title font-sans">
              LOCAL AI UNAVAILABLE
            </h3>
          </div>

          <p className="unconfigured-desc font-sans text-xs text-secondary">
            {isAdmin
              ? 'The local Ollama assistant is currently disabled or unavailable.'
              : 'The local AI assistant is currently unavailable. Contact the platform administrator.'}
          </p>

          {isAdmin && (
            <div className="unconfigured-action">
              <button
                type="button"
                onClick={() =>
                  navigate('/settings#ai-assistant')
                }
                className="editorial-btn btn-configure-ai font-mono"
              >
                <Sliders size={13} />
                <span>AI SETTINGS</span>
              </button>
            </div>
          )}
        </section>
      )}


      {/* ======================================================
          CHAT CONTAINER
          ====================================================== */}

      {!checkingConfig && isConfigured && (
        <div className="chat-container">

          {/* Status strip */}
          <div className="assistant-status-strip">
            <div className="assistant-status-item">
              <span className="assistant-status-dot" />
              <span>LOCAL MODEL ONLINE</span>
            </div>

            <div className="assistant-status-item">
              <Cpu size={13} />
              <span>{aiConfig.model}</span>
            </div>

            <div className="assistant-status-item">
              <Server size={13} />
              <span>UI CONTEXT: {activeServer.name.toUpperCase()} ({activeServer.ip})</span>
            </div>

            <div className="assistant-status-item">
              <Activity size={13} />
              <span>TELEMETRY CONTEXT</span>
            </div>

            <div className="assistant-status-item">
              <ShieldAlert size={13} />
              <span>ANOMALY AWARE</span>
            </div>
          </div>


          {/* ==================================================
              MESSAGE AREA
              ================================================== */}

          <div className="chat-messages-area">

            {messages.length === 0 && (
              <div className="empty-chat-hero">

                <div className="empty-hero-icon">
                  <Terminal
                    size={22}
                    className="text-accent"
                  />
                </div>

                <h4 className="empty-hero-title font-sans">
                  SERVER INTELLIGENCE COPILOT
                </h4>

                <p className="empty-hero-sub font-sans text-xs text-secondary">
                  Ask about overall system state, resource utilization trends,
                  forecasts, anomalies, or operational issues.
                </p>

                <div className="assistant-capabilities font-mono">
                  <div>
                    <Activity size={14} />
                    <span>LIVE TELEMETRY</span>
                  </div>

                  <div>
                    <LineChart size={14} />
                    <span>FORECASTS</span>
                  </div>

                  <div>
                    <ShieldAlert size={14} />
                    <span>ANOMALIES</span>
                  </div>
                </div>

                <div className="prompt-suggestions font-mono">
                  <span className="suggestions-label">
                    SUGGESTED PROMPTS
                  </span>

                  <div className="suggestions-grid">
                    <button
                      type="button"
                      onClick={() =>
                        handlePromptSelect(
                          'Is the server healthy right now?'
                        )
                      }
                      className="suggestion-btn"
                    >
                      Is the server healthy right now?
                    </button>

                    <button
                      type="button"
                      onClick={() =>
                        handlePromptSelect(
                          'What is the current CPU and memory usage?'
                        )
                      }
                      className="suggestion-btn"
                    >
                      What is the current CPU and memory usage?
                    </button>

                    <button
                      type="button"
                      onClick={() =>
                        handlePromptSelect(
                          'What does the CPU forecast look like for the next 3 hours?'
                        )
                      }
                      className="suggestion-btn"
                    >
                      What does the CPU forecast look like for the next 3 hours?
                    </button>

                    <button
                      type="button"
                      onClick={() =>
                        handlePromptSelect(
                          'Are there any anomalies detected across telemetry metrics?'
                        )
                      }
                      className="suggestion-btn"
                    >
                      Are there any anomalies detected?
                    </button>
                  </div>
                </div>

              </div>
            )}


            {/* ==================================================
                MESSAGE LIST
                ================================================== */}

            {messages.map((message, index) => (
              <div
                key={index}
                className={`chat-bubble-wrapper ${
                  message.role === 'user'
                    ? 'bubble-user'
                    : 'bubble-assistant'
                }`}
              >
                <div className="bubble-meta font-mono text-xs">
                  {message.role === 'user' ? (
                    <>
                      <UserIcon size={12} />
                      <span>
                        YOU ({user?.username?.toUpperCase() || 'USER'})
                      </span>
                    </>
                  ) : (
                    <>
                      <Bot
                        size={12}
                        className="text-accent"
                      />
                      <span>
                        SERVER INTELLIGENCE ({message.model || aiConfig?.model || 'LOCAL AI'})
                      </span>
                    </>
                  )}
                  {message.timestamp && (
                    <span className="message-time text-tertiary">{message.timestamp}</span>
                  )}
                </div>

                <div className="bubble-content">
                  {message.role === 'assistant' ? (
                    <ResponseRenderer
                      content={message.content}
                    />
                  ) : (
                    <p className="user-message-text font-mono">
                      {message.content}
                    </p>
                  )}
                </div>
              </div>
            ))}


            {/* ==================================================
                GENERATING / THINKING STATE
                ================================================== */}

            {isSending && (
              <div className="chat-bubble-wrapper bubble-assistant">
                <div className="bubble-meta font-mono text-xs">
                  <Bot
                    size={12}
                    className="text-accent spinning"
                  />
                  <span>
                    SERVER INTELLIGENCE IS THINKING...
                  </span>
                </div>

                <div className="typing-indicator font-mono">
                  <span className="typing-dot">●</span>
                  <span className="typing-dot">●</span>
                  <span className="typing-dot">●</span>
                </div>
              </div>
            )}


            {/* ==================================================
                ERROR BANNER
                ================================================== */}

            {chatError && (
              <div className="editorial-notice-banner notice-error font-mono">
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


          {/* ==================================================
              INPUT COMPOSER
              ================================================== */}

          <form
            onSubmit={handleSend}
            className="chat-input-form"
          >
            <div className="input-box-wrapper">
              <textarea
                ref={textareaRef}
                value={inputText}
                onChange={(event) =>
                  setInputText(event.target.value)
                }
                onKeyDown={handleKeyDown}
                placeholder="Ask about system metrics, telemetry trends, or anomalies... (Press Enter to send, Shift+Enter for new line)"
                rows={2}
                disabled={isSending}
                className="chat-textarea font-mono"
              />

              <button
                type="submit"
                disabled={
                  isSending ||
                  !inputText.trim()
                }
                aria-label="Send message"
                className="editorial-btn btn-send-chat font-mono"
              >
                {isSending ? (
                  <RefreshCw
                    size={13}
                    className="spinning"
                  />
                ) : (
                  <>
                    <Send size={13} />
                    <span>SEND</span>
                  </>
                )}
              </button>
            </div>

            <div className="input-footer-note font-mono text-xs text-tertiary">
              <span>
                LOCAL OLLAMA • LIVE TELEMETRY CONTEXT • FORECAST & ANOMALY AWARE
              </span>
            </div>
          </form>

        </div>
      )}


      {/* ======================================================
          PAGE-SPECIFIC STYLES
          ====================================================== */}

      <style>{`
        .assistant-page {
          width: 100%;
          max-width: 100%;
          min-width: 0;
          box-sizing: border-box;
        }

        .assistant-loading-box,
        .unconfigured-card {
          width: 100%;
          margin-top: 1.5rem;
        }

        .assistant-loading-box {
          display: flex;
          align-items: center;
          gap: 12px;
          padding: 24px;
          background: var(--bg-surface);
          border: 1px solid var(--border-strong);
          color: var(--text-secondary);
          font-size: 11px;
          letter-spacing: 0.06em;
        }

        .unconfigured-card {
          padding: 28px;
          background: var(--bg-surface);
          border: 1px solid var(--border-strong);
          border-left: 4px solid var(--status-warning);
        }

        .unconfigured-header {
          display: flex;
          align-items: center;
          gap: 12px;
          margin-bottom: 12px;
        }

        .unconfigured-title {
          margin: 0;
          font-size: 14px;
          font-weight: 700;
          color: var(--text-primary);
        }

        .unconfigured-action {
          margin-top: 16px;
        }

        .btn-configure-ai {
          display: inline-flex;
          align-items: center;
          gap: 8px;
          padding: 8px 16px;
          font-size: 11px;
        }

        /* Main Chat Shell */
        .assistant-page .chat-container {
          width: 100%;
          margin-top: 1.5rem;
          border: 1px solid var(--border-strong);
          background: var(--bg-surface);
          display: flex;
          flex-direction: column;
          height: calc(100vh - 200px);
          min-height: 520px;
          overflow: hidden;
        }

        /* Status strip */
        .assistant-page .assistant-status-strip {
          display: flex;
          align-items: center;
          flex-wrap: wrap;
          gap: 8px;
          padding: 10px 16px;
          border-bottom: 1px solid var(--border-subtle);
          background: var(--bg-main);
          flex-shrink: 0;
        }

        .assistant-page .assistant-status-item {
          display: inline-flex;
          align-items: center;
          gap: 6px;
          padding: 4px 10px;
          border: 1px solid var(--border-subtle);
          border-radius: 4px;
          background: var(--bg-surface);
          color: var(--text-secondary);
          font-size: 10px;
          letter-spacing: 0.05em;
        }

        .assistant-page .assistant-status-dot {
          width: 6px;
          height: 6px;
          border-radius: 50%;
          background: var(--status-healthy);
          box-shadow: 0 0 6px var(--status-healthy);
        }

        /* Messages Scroll Container */
        .assistant-page .chat-messages-area {
          flex: 1;
          padding: 24px;
          overflow-y: auto;
          background: var(--bg-main);
          display: flex;
          flex-direction: column;
          gap: 20px;
        }

        /* Empty state */
        .assistant-page .empty-chat-hero {
          margin: auto;
          max-width: 720px;
          text-align: center;
          padding: 32px 16px;
        }

        .assistant-page .empty-hero-icon {
          display: flex;
          align-items: center;
          justify-content: center;
          width: 48px;
          height: 48px;
          margin: 0 auto 16px;
          border: 1px solid var(--border-strong);
          background: var(--bg-surface);
        }

        .assistant-page .empty-hero-title {
          margin: 0 0 8px;
          color: var(--text-primary);
          font-size: 15px;
          letter-spacing: 0.05em;
        }

        .assistant-page .empty-hero-sub {
          margin: 0 0 24px;
          line-height: 1.5;
        }

        .assistant-page .assistant-capabilities {
          display: flex;
          justify-content: center;
          gap: 16px;
          margin-bottom: 24px;
          flex-wrap: wrap;
        }

        .assistant-page .assistant-capabilities div {
          display: flex;
          align-items: center;
          gap: 6px;
          padding: 6px 12px;
          background: var(--bg-surface);
          border: 1px solid var(--border-subtle);
          font-size: 10px;
          color: var(--text-secondary);
        }

        .assistant-page .prompt-suggestions {
          text-align: left;
        }

        .assistant-page .suggestions-label {
          display: block;
          font-size: 10px;
          color: var(--text-tertiary);
          letter-spacing: 0.08em;
          margin-bottom: 10px;
        }

        .assistant-page .suggestions-grid {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
          gap: 10px;
        }

        .assistant-page .suggestion-btn {
          background: var(--bg-surface);
          border: 1px solid var(--border-subtle);
          color: var(--text-secondary);
          padding: 10px 14px;
          font-family: var(--font-mono);
          font-size: 11px;
          text-align: left;
          cursor: pointer;
          transition: all 0.15s ease;
        }

        .assistant-page .suggestion-btn:hover {
          border-color: var(--accent);
          color: var(--accent);
          background: var(--bg-surface-hover);
        }

        /* Chat Bubbles */
        .assistant-page .chat-bubble-wrapper {
          display: flex;
          flex-direction: column;
          gap: 6px;
          max-width: 90%;
        }

        .assistant-page .bubble-user {
          align-self: flex-end;

        }

        .assistant-page .bubble-assistant {
          align-self: flex-start;
          width: 100%;
        }

        .assistant-page .bubble-meta {
          display: flex;
          align-items: center;
          gap: 8px;
          color: var(--text-tertiary);
          font-size: 10px;
          letter-spacing: 0.05em;
        }

        .assistant-page .message-time {
          margin-left: 4px;
          font-size: 9px;
        }

        .assistant-page .bubble-user .bubble-content {
          background: var(--bg-surface);
          border: 1px solid var(--accent);
          padding: 12px 16px;
          color: var(--text-primary);
        }

        .assistant-page .bubble-assistant .bubble-content {
          background: var(--bg-surface);
          border: 1px solid var(--border-strong);
          border-left: 3px solid var(--accent);
          padding: 16px 20px;
          color: var(--text-primary);
        }

        .assistant-page .user-message-text {
          margin: 0;
          font-size: 12px;
          line-height: 1.5;
          white-space: pre-wrap;
        }

        /* Response Renderer Markdown Elements */
        .assistant-page .assistant-response {
          font-family: var(--font-sans);
          font-size: 13px;
          line-height: 1.6;
          color: var(--text-primary);
        }

        .assistant-page .assistant-paragraph {
          margin: 0 0 10px;
        }

        .assistant-page .assistant-paragraph:last-child {
          margin-bottom: 0;
        }

        .assistant-page .assistant-heading {
          font-family: var(--font-mono);
          margin: 16px 0 8px;
          color: var(--text-primary);
          letter-spacing: 0.05em;
        }

        .assistant-page .assistant-heading-1 { font-size: 15px; font-weight: 700; border-bottom: 1px solid var(--border-subtle); padding-bottom: 4px; }
        .assistant-page .assistant-heading-2 { font-size: 14px; font-weight: 700; }
        .assistant-page .assistant-heading-3 { font-size: 13px; font-weight: 600; color: var(--accent); }

        .assistant-page .assistant-list {
          margin: 8px 0 12px 20px;
          padding: 0;
        }

        .assistant-page .assistant-list li {
          margin-bottom: 4px;
        }

        .assistant-page .assistant-inline-code {
          font-family: var(--font-mono);
          background: var(--bg-main);
          border: 1px solid var(--border-subtle);
          padding: 2px 6px;
          font-size: 11px;
          color: var(--accent);
        }

        .assistant-page .assistant-divider {
          border: none;
          height: 1px;
          background: var(--border-subtle);
          margin: 16px 0;
        }

        /* Code Block */
        .assistant-page .assistant-code-block {
          margin: 12px 0;
          background: var(--bg-main);
          border: 1px solid var(--border-strong);
        }

        .assistant-page .code-block-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          padding: 6px 12px;
          background: var(--bg-surface);
          border-bottom: 1px solid var(--border-subtle);
          font-size: 10px;
        }

        .assistant-page .code-block-lang {
          color: var(--accent);
          font-weight: 600;
          letter-spacing: 0.08em;
        }

        .assistant-page .code-copy-btn {
          background: transparent;
          border: 1px solid var(--border-subtle);
          color: var(--text-tertiary);
          padding: 3px 8px;
          font-size: 9px;
          cursor: pointer;
          display: flex;
          align-items: center;
          gap: 4px;
          transition: all 0.15s ease;
        }

        .assistant-page .code-copy-btn:hover {
          border-color: var(--accent);
          color: var(--text-primary);
        }

        .assistant-page .code-block-body {
          margin: 0;
          padding: 14px;
          overflow-x: auto;
          font-family: var(--font-mono);
          font-size: 11px;
          line-height: 1.5;
          color: var(--text-primary);
        }

        /* Typing indicator */
        .assistant-page .typing-indicator {
          display: flex;
          gap: 6px;
          padding: 8px 0;
          color: var(--accent);
        }

        .assistant-page .typing-dot {
          animation: blink 1.4s infinite both;
          font-size: 14px;
        }

        .assistant-page .typing-dot:nth-child(2) { animation-delay: .2s; }
        .assistant-page .typing-dot:nth-child(3) { animation-delay: .4s; }

        @keyframes blink {
          0%, 80%, 100% { opacity: 0.2; }
          40% { opacity: 1; }
        }

        /* Input Form */
        .assistant-page .chat-input-form {
          border-top: 1px solid var(--border-strong);
          background: var(--bg-surface);
          padding: 16px 20px;
          flex-shrink: 0;
        }

        .assistant-page .input-box-wrapper {
          display: flex;
          gap: 12px;
          align-items: flex-end;
        }

        .assistant-page .chat-textarea {
          flex: 1;
          background: var(--bg-main);
          border: 1px solid var(--border-strong);
          color: var(--text-primary);
          padding: 10px 14px;
          font-size: 12px;
          resize: none;
          outline: none;
          min-height: 52px;
          max-height: 120px;
          transition: border-color 0.15s ease;
        }

        .assistant-page .chat-textarea:focus {
          border-color: var(--accent);
        }

        .assistant-page .btn-send-chat {
          height: 52px;
          padding: 0 20px;
          display: flex;
          align-items: center;
          gap: 8px;
          background: var(--accent);
          color: #000000;
          font-weight: 700;
          border: none;
          cursor: pointer;
          transition: opacity 0.15s ease;
        }

        .assistant-page .btn-send-chat:disabled {
          opacity: 0.4;
          cursor: not-allowed;
        }

        .assistant-page .input-footer-note {
          margin-top: 8px;
          font-size: 9px;
          letter-spacing: 0.05em;
        }

        .text-healthy { color: var(--status-healthy); }
        .spinning { animation: spin 1s linear infinite; }
        @keyframes spin { 100% { transform: rotate(360deg); } }

        @media (max-width: 768px) {
          .assistant-page .chat-container {
            height: calc(100vh - 160px);
          }
          .assistant-page .chat-bubble-wrapper {
            max-width: 100%;
          }
        }
      `}</style>
    </div>
  );
}

export default AssistantPage;
