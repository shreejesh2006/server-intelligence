import apiClient from './api';

/**
 * Fetch list of incident alerts with optional filters
 * @param {Object|string} paramsOrHost - { status, severity, server, host } or host string
 */
export async function getAlertsApi(paramsOrHost = {}) {
  const queryParams = {};

  if (typeof paramsOrHost === 'string') {
    queryParams.server = paramsOrHost;
  } else if (paramsOrHost && typeof paramsOrHost === 'object') {
    if (paramsOrHost.status) queryParams.status = paramsOrHost.status;
    if (paramsOrHost.severity) queryParams.severity = paramsOrHost.severity;
    if (paramsOrHost.server) queryParams.server = paramsOrHost.server;
    if (paramsOrHost.host) queryParams.server = paramsOrHost.host;
  }

  const response = await apiClient.get('/api/alerts', { params: queryParams });
  return Array.isArray(response.data) ? response.data : [];
}

/**
 * Fetch single alert details by ID
 * @param {number|string} alertId
 */
export async function getAlertApi(alertId) {
  const response = await apiClient.get(`/api/alerts/${alertId}`);
  return response.data;
}

/**
 * Create a new alert (Operator/Admin only)
 * @param {Object} alertData
 */
export async function createAlertApi(alertData) {
  const response = await apiClient.post('/api/alerts', alertData);
  return response.data;
}

/**
 * Acknowledge an existing alert (Operator/Admin only)
 * @param {number|string} alertId
 */
export async function acknowledgeAlertApi(alertId) {
  const response = await apiClient.post(`/api/alerts/${alertId}/acknowledge`);
  return response.data;
}

/**
 * Resolve an existing alert (Operator/Admin only)
 * @param {number|string} alertId
 */
export async function resolveAlertApi(alertId) {
  const response = await apiClient.post(`/api/alerts/${alertId}/resolve`);
  return response.data;
}

/**
 * Trigger rule & ML anomaly evaluation for a server host
 * @param {string} host - Host name (e.g. 'ubuntu')
 */
export async function evaluateAlertsApi(host) {
  const response = await apiClient.post('/api/alerts/evaluate', null, {
    params: { host },
  });
  return response.data;
}

/**
 * Trigger forecast-driven predictive alert evaluation
 * @param {string} [host] - Optional host filter ('ubuntu')
 */
export async function evaluatePredictiveAlertsApi(host) {
  const params = host && host !== 'all' ? { host } : {};
  const response = await apiClient.post('/api/alerts/evaluate-predictive', null, {
    params,
  });
  return response.data;
}

