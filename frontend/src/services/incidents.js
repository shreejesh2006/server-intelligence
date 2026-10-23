import apiClient from './api';

/**
 * Fetch list of incidents with optional filters
 * @param {Object|string} [paramsOrHost] - { server, status, severity } or server string
 */
export async function getIncidentsApi(paramsOrHost = {}) {
  const queryParams = {};

  if (typeof paramsOrHost === 'string') {
    queryParams.server = paramsOrHost;
  } else if (paramsOrHost && typeof paramsOrHost === 'object') {
    if (paramsOrHost.server) queryParams.server = paramsOrHost.server;
    if (paramsOrHost.host) queryParams.server = paramsOrHost.host;
    if (paramsOrHost.status) queryParams.status = paramsOrHost.status;
    if (paramsOrHost.severity) queryParams.severity = paramsOrHost.severity;
  }

  const response = await apiClient.get('/api/incidents', { params: queryParams });
  return Array.isArray(response.data) ? response.data : [];
}

/**
 * Fetch a single incident by ID
 * @param {number|string} incidentId
 */
export async function getIncidentApi(incidentId) {
  const response = await apiClient.get(`/api/incidents/${incidentId}`);
  return response.data;
}

/**
 * Create a new incident (Operator/Admin only)
 * @param {Object} data - { title, description, severity, server, alert_id }
 */
export async function createIncidentApi(data) {
  const response = await apiClient.post('/api/incidents', data);
  return response.data;
}

/**
 * Update an existing incident (Operator/Admin only)
 * @param {number|string} incidentId
 * @param {Object} data - { title, description, severity, status, server }
 */
export async function updateIncidentApi(incidentId, data) {
  const response = await apiClient.patch(`/api/incidents/${incidentId}`, data);
  return response.data;
}

/**
 * Delete an incident (Operator/Admin only)
 * @param {number|string} incidentId
 */
export async function deleteIncidentApi(incidentId) {
  const response = await apiClient.delete(`/api/incidents/${incidentId}`);
  return response.data;
}

/**
 * Acknowledge an incident (Operator/Admin only)
 * @param {number|string} incidentId
 */
export async function acknowledgeIncidentApi(incidentId) {
  const response = await apiClient.post(`/api/incidents/${incidentId}/acknowledge`);
  return response.data;
}

/**
 * Resolve an incident (Operator/Admin only)
 * @param {number|string} incidentId
 */
export async function resolveIncidentApi(incidentId) {
  const response = await apiClient.post(`/api/incidents/${incidentId}/resolve`);
  return response.data;
}
