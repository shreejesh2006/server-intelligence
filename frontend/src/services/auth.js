import apiClient from './api';

/**
 * Authenticate user credentials against FastAPI /api/auth/login
 * @param {string} username
 * @param {string} password
 * @returns {Promise<{ access_token: string, token_type: string, expires_in: number }>}
 */
export async function loginApi(username, password) {
  const response = await apiClient.post('/api/auth/login', {
    username,
    password,
  });
  return response.data;
}

/**
 * Fetch authenticated user details from /api/auth/me
 * @returns {Promise<{ id: number, username: string, role: string, is_active: boolean }>}
 */
export async function getMeApi() {
  const response = await apiClient.get('/api/auth/me');
  return response.data;
}
