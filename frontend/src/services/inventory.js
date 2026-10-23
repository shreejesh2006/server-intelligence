import apiClient from './api';

/**
 * Fetch all infrastructure inventory devices discovered via NetBox.
 */
export async function getInventoryDevices(refresh = false) {
  const response = await apiClient.get('/api/inventory/devices', {
    params: { refresh },
  });
  return response.data;
}

/**
 * Fetch inventory details for a specific host or device.
 */
export async function getDeviceByHost(host) {
  const response = await apiClient.get(`/api/inventory/devices/${encodeURIComponent(host)}`);
  return response.data;
}

/**
 * Fetch canonical host-to-inventory mapping.
 */
export async function getInventoryMapping() {
  const response = await apiClient.get('/api/inventory/mapping');
  return response.data;
}

/**
 * Check NetBox service and synchronization status.
 */
export async function getInventoryStatus() {
  const response = await apiClient.get('/api/inventory/status');
  return response.data;
}
