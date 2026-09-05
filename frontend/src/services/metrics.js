import apiClient from './api';

/**
 * Check backend health status
 */
export async function getHealthStatus() {
  const response = await apiClient.get('/health');
  return response.data;
}

/**
 * List available metric names
 */
export async function getAvailableMetrics() {
  const response = await apiClient.get('/api/metrics/');
  return response.data;
}

/**
 * Fetch current system telemetry metrics for a specific host or default
 * @param {string} [host] - Host label (e.g. 'ubuntu' or 'kali')
 */
export async function getCurrentMetrics(host) {
  let queryHost = host;
  if (queryHost && queryHost.toLowerCase() === 'kali') {
    queryHost = 'Kali';
  }
  const params = queryHost ? { host: queryHost } : {};
  const response = await apiClient.get('/api/metrics/current', { params });
  if (import.meta.env.DEV || process.env.NODE_ENV !== 'production') {
    console.log('[getCurrentMetrics]', { requestedHost: host, queryHost, apiResponse: response.data });
  }
  return response.data;
}

/**
 * Fetch historical metrics for a specific metric name and host
 * @param {string} metricName
 * @param {string} [start]
 * @param {string} [end]
 * @param {string} [step]
 * @param {string} [host]
 */
export async function getMetricHistory(metricName, start = '-1h', end = 'now', step = '30s', host = null) {
  let queryHost = host;
  if (queryHost && queryHost.toLowerCase() === 'kali') {
    queryHost = 'Kali';
  }
  const params = { start, end, step };
  if (queryHost) {
    params.host = queryHost;
  }
  const response = await apiClient.get(`/api/metrics/${metricName}`, { params });
  const data = response.data;

  // Transform values array for Recharts compatibility
  const formattedValues = (data.values || []).map((item) => ({
    timestamp: item.timestamp,
    value: item.value,
  }));

  return {
    ...data,
    values: formattedValues,
  };
}

/**
 * Fetch multiple historical metrics in parallel for multi-series charts
 * @param {Array<string>} metricNames
 * @param {string} [start]
 * @param {string} [end]
 * @param {string} [step]
 * @param {string} [host]
 */
export async function getMultiMetricHistory(metricNames, start = '-1h', end = 'now', step = '30s', host = null) {
  const promises = metricNames.map((name) =>
    getMetricHistory(name, start, end, step, host).catch(() => ({
      metric: name,
      host,
      values: [],
    }))
  );

  const results = await Promise.all(promises);

  // Group by timestamp across all requested metrics
  const timestampMap = new Map();

  results.forEach((res) => {
    const mName = res.metric;
    (res.values || []).forEach((item) => {
      const ts = item.timestamp;
      if (!timestampMap.has(ts)) {
        timestampMap.set(ts, { timestamp: ts });
      }
      timestampMap.get(ts)[mName] = item.value;
    });
  });

  const mergedData = Array.from(timestampMap.values()).sort((a, b) => a.timestamp - b.timestamp);

  return {
    metrics: metricNames,
    host,
    data: mergedData,
    timeline: mergedData,
  };
}
