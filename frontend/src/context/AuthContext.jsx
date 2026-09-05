import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { loginApi, getMeApi } from '../services/auth';

const AuthContext = createContext();

export function AuthProvider({ children }) {
  const [token, setToken] = useState(() => sessionStorage.getItem('server_intel_token') || null);
  const [user, setUser] = useState(null);
  const [isLoading, setIsLoading] = useState(true);

  // Initialize session on startup
  useEffect(() => {
    let isCancelled = false;

    async function initAuth() {
      const storedToken = sessionStorage.getItem('server_intel_token');
      if (!storedToken) {
        if (!isCancelled) {
          setUser(null);
          setToken(null);
          setIsLoading(false);
        }
        return;
      }

      try {
        const userData = await getMeApi();
        if (!isCancelled) {
          setUser(userData);
          setToken(storedToken);
        }
      } catch (err) {
        console.warn('Session restoration failed:', err?.response?.data?.detail || err.message);
        sessionStorage.removeItem('server_intel_token');
        if (!isCancelled) {
          setUser(null);
          setToken(null);
        }
      } finally {
        if (!isCancelled) {
          setIsLoading(false);
        }
      }
    }

    initAuth();

    return () => {
      isCancelled = true;
    };
  }, []);

  // Listen to 401 unauthorized events from Axios interceptor
  useEffect(() => {
    const handleUnauthorized = () => {
      sessionStorage.removeItem('server_intel_token');
      setUser(null);
      setToken(null);
    };

    window.addEventListener('server_intel_auth_unauthorized', handleUnauthorized);
    return () => {
      window.removeEventListener('server_intel_auth_unauthorized', handleUnauthorized);
    };
  }, []);

  // Login handler
  const login = useCallback(async (username, password) => {
    setIsLoading(true);
    try {
      const tokenRes = await loginApi(username, password);
      const accessToken = tokenRes.access_token;
      
      sessionStorage.setItem('server_intel_token', accessToken);
      setToken(accessToken);

      // Fetch authoritative user details from /api/auth/me
      const userData = await getMeApi();
      setUser(userData);
      return userData;
    } catch (err) {
      sessionStorage.removeItem('server_intel_token');
      setToken(null);
      setUser(null);
      throw err;
    } finally {
      setIsLoading(false);
    }
  }, []);

  // Role switch handler for demo/settings preview
  const switchRole = useCallback((newRole) => {
    setUser((prev) => (prev ? { ...prev, role: newRole } : { username: 'admin', role: newRole }));
  }, []);

  // Logout handler
  const logout = useCallback(() => {
    sessionStorage.removeItem('server_intel_token');
    setToken(null);
    setUser(null);
  }, []);

  const value = {
    user,
    token,
    isAuthenticated: !!user && !!token,
    isLoading,
    login,
    logout,
    switchRole,
  };

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}

export default AuthContext;
