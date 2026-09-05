import apiClient from './api';
import { getCurrentMetrics } from './metrics';
import { getAnomaly, getForecast } from './intelligence';

/**
 * Get Mac-local Ollama base URL from environment or default to localhost
 */
export function getOllamaBaseUrl() {
  return import.meta.env.VITE_OLLAMA_URL || 'http://localhost:11434';
}

/**
 * Fetch AI provider configuration settings (Admin Only)
 */
export async function getAiSettingsApi() {
  const response = await apiClient.get('/api/settings/ai');
  return response.data;
}

/**
 * Update AI provider configuration settings (Admin Only)
 * @param {Object} payload { provider, model, api_key, enabled }
 */
export async function updateAiSettingsApi(payload) {
  const response = await apiClient.put('/api/settings/ai', payload);
  return response.data;
}

/**
 * Delete / clear saved AI API key (Admin Only)
 */
export async function deleteAiKeyApi() {
  const response = await apiClient.delete('/api/settings/ai/key');
  return response.data;
}

/**
 * Retrieve live host-specific telemetry, anomaly intelligence, and forecasts from Ubuntu APIs
 * @param {string} [host]
 */
export async function buildHostContextPayload(host = 'ubuntu') {
  const targetHost = host || 'ubuntu';

  try {
    const [metricsRes, anomalyRes, forecastRes] = await Promise.allSettled([
      getCurrentMetrics(targetHost),
      getAnomaly(targetHost),
      getForecast(targetHost),
    ]);

    const metrics = metricsRes.status === 'fulfilled' ? metricsRes.value?.metrics || {} : {};
    const anomaly = anomalyRes.status === 'fulfilled' ? anomalyRes.value || {} : {};
    const forecast = forecastRes.status === 'fulfilled' ? forecastRes.value || {} : {};

    return {
      host: targetHost,
      metrics,
      anomaly,
      forecast,
    };
  } catch (err) {
    if (import.meta.env.DEV) {
      console.warn('[AI Service] Failed retrieving host context:', err);
    }
    return { host: targetHost, metrics: {}, anomaly: {}, forecast: {} };
  }
}

/**
 * Format system prompt containing facts from platform context
 * @param {Object} context
 */
export function formatSystemContextPrompt(context) {
  const hostName = (context.host || 'ubuntu').toUpperCase();
  const m = context.metrics || {};
  const a = context.anomaly || {};
  const f = context.forecast || {};

  const cpuFc = f.cpu?.predictions || {};
  const memFc = f.memory?.predictions || {};
  const loadFc = f.load_1m?.predictions || {};

  const signals = (a.contributing_signals || [])
    .map((s) => `  - ${s.display_name}: current=${s.current_value}, baseline=${s.baseline_value}, status=${s.status}`)
    .join('\n');

  const recs = (a.recommendations || []).map((r) => `  - ${r}`).join('\n');

  return `You are an Operational Engineering Copilot for the Server Intelligence platform.
You analyze infrastructure telemetry, machine learning anomaly intelligence, and predictive forecasts.

CRITICAL RULES:
1. FACTS vs INTERPRETATION: Clearly separate ground-truth FACTS (exact numeric metric values, anomaly scores, and model predictions provided below) from your INTERPRETATION and reasoning.
2. NO HALLUCINATION: Do NOT fabricate metric values, anomaly statuses, or predictions not present in the platform context.
3. GROUNDING: Base all server health evaluations strictly on the host-specific system context below.

=== LIVE PLATFORM SYSTEM CONTEXT ===
Target Host: ${hostName}
Observation Timestamp: ${m.timestamp || a.telemetry_timestamp || new Date().toISOString()}

1. LIVE SYSTEM TELEMETRY (FACTS):
- CPU Utilization: ${m.cpu != null ? m.cpu + '%' : 'N/A'}
- Memory Usage: ${m.memory != null ? m.memory + '%' : 'N/A'}
- Disk Usage: ${m.disk != null ? m.disk + '%' : 'N/A'}
- Load Average (1m, 5m, 15m): ${m.load_1m ?? 'N/A'}, ${m.load_5m ?? 'N/A'}, ${m.load_15m ?? 'N/A'}
- Network (RX / TX): ${m.network_rx != null ? m.network_rx + ' B/s' : 'N/A'} / ${m.network_tx != null ? m.network_tx + ' B/s' : 'N/A'}
- Disk I/O (Read / Write): ${m.disk_read != null ? m.disk_read + ' B/s' : 'N/A'} / ${m.disk_write != null ? m.disk_write + ' B/s' : 'N/A'}
- Process Count: ${m.processes ?? 'N/A'}
- CPU I/O Wait: ${m.iowait != null ? m.iowait + '%' : 'N/A'}

2. ML ANOMALY INTELLIGENCE (ISOLATION FOREST MODEL):
- Model Status: ${a.model_status || 'N/A'} (Trained: ${a.model_trained_at || 'N/A'})
- Is Anomaly: ${a.is_anomaly !== undefined ? a.is_anomaly : 'N/A'}
- Severity Level: ${a.severity || 'NORMAL'}
- Anomaly Score: ${a.anomaly_score ?? 'N/A'}
- Primary Reason: ${a.primary_reason || 'Operating within normal bounds.'}
- Contributing Signals:
${signals || '  - None (operating within nominal baseline)'}
- Recommended Platform Actions:
${recs || '  - Telemetry is operating within nominal bounds.'}

3. ML TELEMETRY FORECAST (RIDGE/PERSISTENCE MODEL):
- CPU (%): Current=${f.cpu?.current ?? 'N/A'}, 5m=${cpuFc['5m'] ?? 'N/A'}, 15m=${cpuFc['15m'] ?? 'N/A'}, 30m=${cpuFc['30m'] ?? 'N/A'}, 1h=${cpuFc['1h'] ?? 'N/A'}, 3h=${cpuFc['3h'] ?? 'N/A'}
- Memory (%): Current=${f.memory?.current ?? 'N/A'}, 5m=${memFc['5m'] ?? 'N/A'}, 15m=${memFc['15m'] ?? 'N/A'}, 30m=${memFc['30m'] ?? 'N/A'}, 1h=${memFc['1h'] ?? 'N/A'}, 3h=${memFc['3h'] ?? 'N/A'}
- System Load (1m): Current=${f.load_1m?.current ?? 'N/A'}, 5m=${loadFc['5m'] ?? 'N/A'}, 15m=${loadFc['15m'] ?? 'N/A'}, 30m=${loadFc['30m'] ?? 'N/A'}, 1h=${loadFc['1h'] ?? 'N/A'}, 3h=${loadFc['3h'] ?? 'N/A'}
=== END PLATFORM CONTEXT ===`;
}

/**
 * Directly query Mac-local Ollama /api/chat endpoint with context injection
 * @param {Array<{role: string, content: string}>} messages
 * @param {Object} [options]
 */
export async function sendOllamaDirectChatApi(messages, options = {}) {
  const baseUrl = getOllamaBaseUrl();
  const endpoint = `${baseUrl.replace(/\/+$/, '')}/api/chat`;
  const model = options.model || 'qwen3:1.7b';


  const userMessages = messages
    .filter((m) => m && m.content)
    .map((m) => ({
      role: m.role === 'user' ? 'user' : 'assistant',
      content: m.content.trim(),
    }));

  let systemMessage = null;
  if (options.hostContext) {
    systemMessage = {
      role: 'system',
      content: formatSystemContextPrompt(options.hostContext),
    };
  }

  const payloadMessages = systemMessage ? [systemMessage, ...userMessages] : userMessages;

  const body = {
    model,
    messages: payloadMessages,
    stream: false,
    options: {
      num_predict: options.numPredict || 1024,
    },
  };

  const res = await fetch(endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`Mac-local Ollama request failed (${res.status}): ${text || res.statusText}`);
  }

  const json = await res.json();
  const rawMsg = json?.message || {};
  const content = (rawMsg.content && rawMsg.content.trim())
    ? rawMsg.content.trim()
    : (rawMsg.thinking && rawMsg.thinking.trim())
    ? rawMsg.thinking.trim()
    : null;

  if (!content) {

    throw new Error('Received empty response from Mac-local Ollama.');
  }

  return {
    message: content,
    provider: 'ollama (mac-local)',
    model: json?.model || model,
  };
}

/**
 * Send message history to AI Assistant (Fetch context for host, query Ollama)
 * @param {Array<{role: string, content: string}>} messages
 * @param {Object} [options]
 */
export async function sendChatMessageApi(messages, options = {}) {
  const targetHost = options.host || 'ubuntu';
  const hostContext = await buildHostContextPayload(targetHost);

  try {
    return await sendOllamaDirectChatApi(messages, { ...options, hostContext });
  } catch (localErr) {
    if (import.meta.env.DEV) {
      console.warn('[AI Service] Direct Mac-local Ollama unavailable, trying backend fallback:', localErr.message);
    }
    const response = await apiClient.post('/api/assistant/chat', { messages, host: targetHost }, { timeout: 60000 });
    return response.data;
  }
}
