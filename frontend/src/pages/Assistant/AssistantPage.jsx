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
  User as UserIcon,
  Activity,
  Cpu,
  ShieldAlert,
  LineChart,
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
  return (
    <div className="assistant-code-block">
      <div className="code-block-header">
        <span>{language || 'CODE'}</span>
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
      } catch (err) {
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
          <span className="editorial-pill pill-healthy">
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
        <div className="assistant-loading-box">
          <RefreshCw
            size={16}
            className="spinning text-accent"
          />

          <span>
            CONNECTING TO LOCAL AI...
          </span>
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
                className="editorial-btn btn-configure-ai"
              >
                <Sliders size={13} />
                <span>
                  AI SETTINGS
                </span>
              </button>
            </div>
          )}
        </section>
      )}


      {/* ======================================================
          CHAT
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
              <span>
                {aiConfig.model}
              </span>
            </div>

            <div className="assistant-status-item">
              <Activity size={13} />
              <span>
                LIVE SERVER CONTEXT
              </span>
            </div>

            <div className="assistant-status-item">
              <ShieldAlert size={13} />
              <span>
                ANOMALY AWARE
              </span>
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
                  Ask about the current server state,
                  forecasts, anomalies, resource usage,
                  or operational issues.
                </p>


                <div className="assistant-capabilities">

                  <div>
                    <Activity size={15} />
                    <span>LIVE TELEMETRY</span>
                  </div>

                  <div>
                    <LineChart size={15} />
                    <span>FORECASTS</span>
                  </div>

                  <div>
                    <ShieldAlert size={15} />
                    <span>ANOMALIES</span>
                  </div>

                </div>


                <div className="prompt-suggestions">

                  <span className="suggestions-label">
                    TRY ASKING
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
                          'Are there any anomalies? Explain the most important one.'
                        )
                      }
                      className="suggestion-btn"
                    >
                      Are there any anomalies?
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
                        YOU
                        {' '}
                        (
                        {user?.username?.toUpperCase() ||
                          'USER'}
                        )
                      </span>
                    </>
                  ) : (
                    <>
                      <Bot
                        size={12}
                        className="text-accent"
                      />

                      <span>
                        SERVER INTELLIGENCE
                        {' '}
                        (
                        {message.model ||
                          aiConfig?.model ||
                          'LOCAL AI'}
                        )
                      </span>
                    </>
                  )}

                </div>


                <div className="bubble-content">

                  {message.role === 'assistant' ? (
                    <ResponseRenderer
                      content={message.content}
                    />
                  ) : (
                    <p className="user-message-text">
                      {message.content}
                    </p>
                  )}

                </div>

              </div>

            ))}


            {/* ==================================================
                GENERATING
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

                <div className="typing-indicator">
                  <span className="typing-dot">●</span>
                  <span className="typing-dot">●</span>
                  <span className="typing-dot">●</span>
                </div>

              </div>

            )}


            {/* ==================================================
                ERROR
                ================================================== */}

            {chatError && (

              <div className="editorial-notice-banner notice-error">

                <AlertCircle size={15} />

                <span>
                  {chatError}
                </span>

                <button
                  type="button"
                  onClick={() =>
                    setChatError(null)
                  }
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
              INPUT
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
                placeholder="Ask about your server..."
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
                className="editorial-btn btn-send-chat"
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
                LOCAL QWEN3 • LIVE TELEMETRY • FORECASTS • ANOMALY DETECTION
              </span>
            </div>

          </form>

        </div>
      )}


      {/* ======================================================
          PAGE-SPECIFIC STYLES
          ====================================================== */}

      <style>{`
        /* =========================================================
           SERVER INTELLIGENCE — LOCAL AI CHAT
           Clean layout / explicit sizing / no inherited UI leakage
           ========================================================= */

        .assistant-page {
          width: 100%;
          max-width: 100%;
          min-width: 0;
          box-sizing: border-box;
        }

        .assistant-page *,
        .assistant-page *::before,
        .assistant-page *::after {
          box-sizing: border-box;
        }

        /* ---------------------------------------------------------
           Loading / configuration
           --------------------------------------------------------- */

        .assistant-loading-box,
        .unconfigured-card {
          width: 100%;
          margin-top: 1.5rem;
        }

        /* ---------------------------------------------------------
           Main chat shell
           --------------------------------------------------------- */

        .assistant-page .chat-container {
          width: 100%;
          min-width: 0;
          margin-top: 1.5rem;
          border: 1px solid var(--border, #27272a);
          background: #101114;
          overflow: hidden;
        }

        /* ---------------------------------------------------------
           Status strip
           --------------------------------------------------------- */

        .assistant-page .assistant-status-strip {
          display: flex;
          align-items: center;
          flex-wrap: wrap;
          gap: 8px;
          width: 100%;
          min-height: 58px;
          padding: 12px 16px;
          border-bottom: 1px solid var(--border, #27272a);
          background: #13151a;
        }

        .assistant-page .assistant-status-item {
          display: inline-flex;
          align-items: center;
          gap: 7px;
          min-height: 30px;
          padding: 0 11px;
          border: 1px solid #2b2e35;
          border-radius: 999px;
          background: #111318;
          color: #9ca3af;
          font-size: 0.63rem;
          line-height: 1;
          letter-spacing: 0.06em;
          white-space: nowrap;
        }

        .assistant-page .assistant-status-item svg {
          flex: 0 0 auto;
          color: #9ca3af;
        }

        .assistant-page .assistant-status-dot {
          width: 7px;
          height: 7px;
          flex: 0 0 7px;
          border-radius: 50%;
          background: #10b981;
          box-shadow: 0 0 0 3px rgba(16, 185, 129, 0.08);
        }

        /* ---------------------------------------------------------
           Message area
           --------------------------------------------------------- */

        .assistant-page .chat-messages-area {
          width: 100%;
          min-width: 0;
          min-height: 420px;
          max-height: 58vh;
          padding: 28px 30px;
          overflow-y: auto;
          overflow-x: hidden;
          background: #101114;
        }

        /* ---------------------------------------------------------
           Empty state
           --------------------------------------------------------- */

        .assistant-page .empty-chat-hero {
          width: 100%;
          max-width: 980px;
          margin: 0 auto;
          padding: 42px 20px 34px;
          text-align: center;
        }

        .assistant-page .empty-hero-icon {
          display: flex;
          align-items: center;
          justify-content: center;
          width: 46px;
          height: 46px;
          margin: 0 auto 18px;
          border: 1px solid #343840;
          border-radius: 10px;
          background: #15171c;
        }

        .assistant-page .empty-hero-title {
          margin: 0;
          color: #f4f4f5;
          font-size: 1.05rem;
          line-height: 1.35;
          letter-spacing: -0.01em;
        }

        .assistant-page .empty-hero-sub {
          max-width: 680px;
          margin: 9px auto 0;
          color: #9ca3af;
          line-height: 1.6;
        }

        /* ---------------------------------------------------------
           Capabilities
           --------------------------------------------------------- */

        .assistant-page .assistant-capabilities {
          display: flex;
          align-items: center;
          justify-content: center;
          flex-wrap: wrap;
          gap: 8px;
          margin: 24px 0 28px;
        }

        .assistant-page .assistant-capabilities > div {
          display: inline-flex;
          align-items: center;
          gap: 7px;
          min-height: 34px;
          padding: 0 12px;
          border: 1px solid #2b2e35;
          border-radius: 7px;
          background: #13151a;
          color: #9ca3af;
          font-size: 0.70rem;
          letter-spacing: 0.055em;
          white-space: nowrap;
        }

        .assistant-page .assistant-capabilities svg {
          color: #f59e0b;
          flex: 0 0 auto;
        }

        /* ---------------------------------------------------------
           Suggested prompts
           --------------------------------------------------------- */

        .assistant-page .prompt-suggestions {
          width: 100%;
          max-width: 900px;
          margin: 0 auto;
          text-align: left;
        }

        .assistant-page .suggestions-label {
          display: block;
          margin-bottom: 9px;
          color: #717782;
          font-size: 0.63rem;
          letter-spacing: 0.09em;
        }

        .assistant-page .suggestions-grid {
          display: grid;
          grid-template-columns: repeat(2, minmax(0, 1fr));
          gap: 9px;
          width: 100%;
        }

        .assistant-page .suggestion-btn {
          appearance: none;
          display: block;
          width: 100%;
          min-width: 0;
          min-height: 52px;
          padding: 12px 14px;
          border: 1px solid #2b2e35;
          border-radius: 7px;
          outline: none;
          background: #14161b;
          color: #b8bdc7;
          font-family: var(--font-mono, monospace);
          font-size: 0.78rem;
          line-height: 1.5;
          text-align: left;
          white-space: normal;
          overflow-wrap: anywhere;
          cursor: pointer;
          transition:
            border-color 140ms ease,
            background 140ms ease,
            color 140ms ease;
        }

        .assistant-page .suggestion-btn:hover {
          border-color: #4a4f59;
          background: #191b21;
          color: #f4f4f5;
        }

        .assistant-page .suggestion-btn:focus-visible {
          border-color: #f59e0b;
          box-shadow: 0 0 0 2px rgba(245, 158, 11, 0.12);
        }

        /* ---------------------------------------------------------
           Chat messages
           --------------------------------------------------------- */

        .assistant-page .chat-bubble-wrapper {
          width: 100%;
          min-width: 0;
          margin-bottom: 26px;
        }

        .assistant-page .chat-bubble-wrapper:last-of-type {
          margin-bottom: 0;
        }

        .assistant-page .bubble-user {
          display: flex;
          flex-direction: column;
          align-items: flex-end;
        }

        .assistant-page .bubble-assistant {
          display: flex;
          flex-direction: column;
          align-items: flex-start;
        }

        .assistant-page .bubble-meta {
          display: flex;
          align-items: center;
          gap: 7px;
          margin-bottom: 8px;
          color: #737984;
          font-size: 0.70rem;
          line-height: 1;
          letter-spacing: 0.055em;
        }

        .assistant-page .bubble-meta svg {
          flex: 0 0 auto;
        }

        .assistant-page .bubble-content {
          width: fit-content;
          max-width: min(820px, 88%);
          min-width: 0;
          padding: 14px 17px;
          border: 1px solid #2b2e35;
          border-radius: 8px;
          background: #15171c;
          color: #d4d7dc;
          overflow-wrap: anywhere;
        }

        .assistant-page .bubble-user .bubble-content {
          border-color: rgba(245, 158, 11, 0.35);
          background: rgba(245, 158, 11, 0.08);
          color: #e5e7eb;
        }

        .assistant-page .user-message-text {
          margin: 0;
          white-space: pre-wrap;
          overflow-wrap: anywhere;
          font-size: 0.78rem;
          line-height: 1.6;
        }

        /* ---------------------------------------------------------
           AI response typography
           --------------------------------------------------------- */

        .assistant-page .assistant-response {
          width: 100%;
          max-width: 820px;
          color: #d4d7dc;
          font-family: var(--font-mono, monospace);
          font-size: 0.90rem;
          line-height: 1.75;
        }

        .assistant-page .assistant-paragraph {
          margin: 0 0 0.85rem;
          white-space: normal;
          overflow-wrap: anywhere;
        }

        .assistant-page .assistant-paragraph:last-child {
          margin-bottom: 0;
        }

        .assistant-page .assistant-heading {
          margin: 1.25rem 0 0.55rem;
          color: #f4f4f5;
          font-family: var(--font-sans, Inter, sans-serif);
          font-weight: 650;
          line-height: 1.3;
        }

        .assistant-page .assistant-heading:first-child {
          margin-top: 0;
        }

        .assistant-page .assistant-heading-1 {
          font-size: 1.05rem;
        }

        .assistant-page .assistant-heading-2 {
          font-size: 0.96rem;
        }

        .assistant-page .assistant-heading-3 {
          font-size: 0.9rem;
        }

        .assistant-page .assistant-response strong {
          color: #f4f4f5;
          font-family: var(--font-sans, Inter, sans-serif);
          font-weight: 700;
        }

        .assistant-page .assistant-response em {
          font-style: italic;
        }

        /* ---------------------------------------------------------
           Lists
           --------------------------------------------------------- */

        .assistant-page .assistant-list {
          margin: 0.45rem 0 1rem;
          padding-left: 1.35rem;
        }

        .assistant-page .assistant-list li {
          margin: 0.3rem 0;
          padding-left: 0.25rem;
          line-height: 1.6;
        }

        .assistant-page .assistant-list li::marker {
          color: #f59e0b;
        }

        .assistant-page .assistant-ordered-list li::marker {
          font-family: var(--font-mono, monospace);
          font-size: 0.78rem;
        }

        /* ---------------------------------------------------------
           Inline code
           --------------------------------------------------------- */

        .assistant-page .assistant-inline-code {
          display: inline-block;
          margin: 0 0.08rem;
          padding: 0.08rem 0.32rem;
          border: 1px solid #30333a;
          border-radius: 4px;
          background: #111318;
          color: #e5e7eb;
          font-family: var(--font-mono, monospace);
          font-size: 0.82em;
        }

        /* ---------------------------------------------------------
           Code blocks
           --------------------------------------------------------- */

        .assistant-page .assistant-code-block {
          width: 100%;
          margin: 0.85rem 0 1rem;
          overflow: hidden;
          border: 1px solid #2b2e35;
          border-radius: 7px;
          background: #0c0e11;
        }

        .assistant-page .code-block-header {
          display: flex;
          align-items: center;
          min-height: 30px;
          padding: 0 11px;
          border-bottom: 1px solid #2b2e35;
          background: #13151a;
          color: #737984;
          font-size: 0.61rem;
          letter-spacing: 0.08em;
        }

        .assistant-page .code-block-body {
          margin: 0;
          padding: 13px 14px;
          overflow-x: auto;
          color: #d4d7dc;
          font-size: 0.80rem;
          line-height: 1.65;
          white-space: pre;
        }

        .assistant-page .assistant-divider {
          margin: 1.1rem 0;
          border: 0;
          border-top: 1px solid #2b2e35;
        }

        /* ---------------------------------------------------------
           Composer
           --------------------------------------------------------- */

        .assistant-page .chat-input-form {
          width: 100%;
          min-width: 0;
          padding: 16px;
          border-top: 1px solid #2b2e35;
          background: #13151a;
        }

        .assistant-page .input-box-wrapper {
          display: flex;
          align-items: stretch;
          width: 100%;
          min-width: 0;
          gap: 9px;
        }

        .assistant-page .chat-textarea {
          display: block;
          flex: 1 1 auto;
          width: 100%;
          min-width: 0;
          min-height: 54px;
          max-height: 180px;
          resize: vertical;
          margin: 0;
          padding: 14px 15px;
          border: 1px solid #30343b;
          border-radius: 7px;
          outline: none;
          background: #0f1115;
          color: #e5e7eb;
          font-family: var(--font-mono, monospace);
          font-size: 0.82rem;
          line-height: 1.55;
          box-shadow: none;
        }

        .assistant-page .chat-textarea::placeholder {
          color: #626873;
          opacity: 1;
        }

        .assistant-page .chat-textarea:focus {
          border-color: #4b505a;
          box-shadow: 0 0 0 2px rgba(245, 158, 11, 0.08);
        }

        .assistant-page .chat-textarea:disabled {
          opacity: 0.6;
          cursor: not-allowed;
        }

        .assistant-page .btn-send-chat {
          flex: 0 0 92px;
          align-self: stretch;
          min-height: 54px;
        }

        .assistant-page .input-footer-note {
          margin-top: 8px;
          color: #626873;
          font-size: 0.67rem;
          letter-spacing: 0.055em;
        }

        /* ---------------------------------------------------------
           Typing indicator
           --------------------------------------------------------- */

        .assistant-page .typing-indicator {
          display: flex;
          align-items: center;
          gap: 5px;
          min-height: 42px;
          padding: 0 14px;
          border: 1px solid #2b2e35;
          border-radius: 7px;
          background: #15171c;
        }

        .assistant-page .typing-dot {
          color: #f59e0b;
          font-size: 0.55rem;
          animation: assistantTyping 1.2s infinite ease-in-out;
        }

        .assistant-page .typing-dot:nth-child(2) {
          animation-delay: 0.15s;
        }

        .assistant-page .typing-dot:nth-child(3) {
          animation-delay: 0.3s;
        }

        @keyframes assistantTyping {
          0%, 60%, 100% {
            opacity: 0.25;
            transform: translateY(0);
          }

          30% {
            opacity: 1;
            transform: translateY(-2px);
          }
        }

        /* ---------------------------------------------------------
           Error
           --------------------------------------------------------- */

        .assistant-page .editorial-notice-banner {
          width: 100%;
          margin-top: 12px;
        }

        /* ---------------------------------------------------------
           Safety against inherited/global styles
           --------------------------------------------------------- */

        .assistant-page button {
          font-family: var(--font-mono, monospace);
        }

        .assistant-page textarea {
          appearance: none;
          -webkit-appearance: none;
        }

        .assistant-page .bubble-content,
        .assistant-page .chat-bubble-wrapper {
          min-width: 0;
          overflow-wrap: anywhere;
        }

        /* ---------------------------------------------------------
           Responsive
           --------------------------------------------------------- */

        @media (max-width: 800px) {
          .assistant-page .chat-messages-area {
            min-height: 360px;
            padding: 20px 16px;
          }

          .assistant-page .suggestions-grid {
            grid-template-columns: 1fr;
          }

          .assistant-page .bubble-content {
            max-width: 94%;
          }

          .assistant-page .input-box-wrapper {
            flex-direction: column;
          }

          .assistant-page .btn-send-chat {
            flex: 0 0 auto;
            width: 100%;
            min-height: 44px;
          }
        }

        @media (max-width: 520px) {
          .assistant-page .assistant-status-strip {
            padding: 10px;
          }

          .assistant-page .assistant-status-item {
            font-size: 0.57rem;
          }

          .assistant-page .chat-input-form {
            padding: 10px;
          }

          .assistant-page .empty-chat-hero {
            padding: 28px 8px;
          }
        }

      `}</style>

    </div>
  );
}

export default AssistantPage;
