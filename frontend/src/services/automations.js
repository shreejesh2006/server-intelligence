import apiClient from './api';

/**
 * Fetch all configured automation rules
 */
export async function getAutomationsApi() {
  const response = await apiClient.get('/api/automations');
  return Array.isArray(response.data) ? response.data : [];
}

/**
 * Create a new automation rule (Operator/Admin only)
 * @param {Object} data - { name, trigger_type, action_type }
 */
export async function createAutomationApi(data) {
  const response = await apiClient.post('/api/automations', data);
  return response.data;
}

/**
 * Update an existing automation rule (Operator/Admin only)
 * @param {number|string} id
 * @param {Object} data - { name, status, trigger_type, action_type }
 */
export async function updateAutomationApi(id, data) {
  const response = await apiClient.patch(`/api/automations/${id}`, data);
  return response.data;
}

/**
 * Delete an automation rule (Operator/Admin only)
 * @param {number|string} id
 */
export async function deleteAutomationApi(id) {
  const response = await apiClient.delete(`/api/automations/${id}`);
  return response.data;
}

/**
 * Manually trigger an automation run (Operator/Admin only)
 * @param {number|string} id
 * @param {Object} [payload] - { host, alert_id }
 */
export async function executeAutomationApi(id, payload = {}) {
  const response = await apiClient.post(`/api/automations/${id}/execute`, payload);
  return response.data;
}

/**
 * Fetch recent automation execution runs across all rules
 * @param {number} [limit=50]
 */
export async function getAutomationRunsApi(limit = 50) {
  const response = await apiClient.get('/api/automations/runs', {
    params: { limit },
  });
  return Array.isArray(response.data) ? response.data : [];
}

/**
 * Fetch execution runs for a specific automation rule
 * @param {number|string} id
 * @param {number} [limit=20]
 */
export async function getAutomationRunsForRuleApi(id, limit = 20) {
  const response = await apiClient.get(`/api/automations/${id}/runs`, {
    params: { limit },
  });
  return Array.isArray(response.data) ? response.data : [];
}
