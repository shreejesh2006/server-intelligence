import apiClient from './api';

/**
 * Fetch list of incident alerts with optional filters
 * @param {Object} params - { status, severity, server }
 */
export async function getAlertsApi(params = {}) {
  const response = await apiClient.get('/api/alerts', { params });
  return response.data;
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
 * @param {string} host - Host name (e.g. 'ubuntu', 'kali')
 */
export async function evaluateAlertsApi(host) {
  const response = await apiClient.post('/api/alerts/evaluate', null, {
    params: { host },
  });
  return response.data;
}
