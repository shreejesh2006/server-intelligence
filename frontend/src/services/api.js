import axios from 'axios';

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://192.168.64.22:8000';

export const apiClient = axios.create({
  baseURL: API_BASE_URL,
  timeout: 10000,
  headers: {
    'Content-Type': 'application/json',
  },
});

// Request Interceptor: Attach Authorization Bearer token from sessionStorage
apiClient.interceptors.request.use(
  (config) => {
    const token = sessionStorage.getItem('server_intel_token');
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  },
  (error) => Promise.reject(error)
);

// Response Interceptor: Handle 401 and 403 errors centrally
apiClient.interceptors.response.use(
  (response) => response,
  (error) => {
    const status = error.response ? error.response.status : null;
    const url = error.config ? error.config.url : '';

    // Handle 401 Unauthorized
    if (status === 401) {
      // Do not clear session if the error is from the login request itself
      if (!url.includes('/api/auth/login')) {
        sessionStorage.removeItem('server_intel_token');
        // Dispatch event for AuthContext to clear session without infinite loops
        window.dispatchEvent(new Event('server_intel_auth_unauthorized'));
      }
    }

    // 403 Forbidden should NOT log out the user automatically.
    // It passes through so components can show access denied alerts.

    return Promise.reject(error);
  }
);

export default apiClient;
