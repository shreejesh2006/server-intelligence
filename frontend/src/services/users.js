import apiClient from './api';

/**
 * List all users (ADMIN ONLY)
 */
export async function getUsersApi() {
  const response = await apiClient.get('/api/users');
  return response.data;
}

/**
 * Create a new user (ADMIN ONLY)
 */
export async function createUserApi({ username, password, role }) {
  const response = await apiClient.post('/api/users', {
    username,
    password,
    role,
  });
  return response.data;
}

/**
 * Update user role (ADMIN ONLY)
 */
export async function updateUserRoleApi(userId, role) {
  const response = await apiClient.patch(`/api/users/${userId}/role`, {
    role,
  });
  return response.data;
}

/**
 * Update user active/disabled status (ADMIN ONLY)
 */
export async function updateUserStatusApi(userId, isActive) {
  const response = await apiClient.patch(`/api/users/${userId}/status`, {
    is_active: isActive,
  });
  return response.data;
}
