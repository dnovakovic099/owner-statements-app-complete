import React, { createContext, useContext, useState, useEffect } from 'react';
import { setAuthToken } from '../services/api';

interface User {
  id?: number;
  username: string;
  email?: string;
  role?: 'system' | 'admin' | 'editor' | 'viewer';
  isSystemUser?: boolean;
}

interface AuthContextType {
  isAuthenticated: boolean;
  user: User | null;
  token: string | null;
  login: (username: string, password: string) => Promise<boolean>;
  logout: () => void;
  isLoading: boolean;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

const API_BASE_URL = process.env.NODE_ENV === 'production'
  ? '/api'
  : 'http://localhost:3003/api';

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [user, setUser] = useState<User | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    // Check for stored auth on app start
    const checkStoredAuth = async () => {
      try {
        const stored = localStorage.getItem('luxury-lodging-auth');
        if (stored) {
          const parsed = JSON.parse(stored);
          if (parsed.token) {
            // Verify token is still valid
            const response = await fetch(`${API_BASE_URL}/auth/verify`, {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${parsed.token}`,
              },
            });

            if (response.ok) {
              const data = await response.json();
              setAuthToken(parsed.token);
              setToken(parsed.token);
              setUser(data.user);
              setIsAuthenticated(true);
            } else {
              // Token invalid, clear storage
              localStorage.removeItem('luxury-lodging-auth');
              setAuthToken(null);
            }
          }
        }
      } catch (error) {
        console.warn('Failed to verify stored token');
        localStorage.removeItem('luxury-lodging-auth');
        setAuthToken(null);
      } finally {
        setIsLoading(false);
      }
    };

    checkStoredAuth();
  }, []);

  const login = async (username: string, password: string): Promise<boolean> => {
    try {
      const response = await fetch(`${API_BASE_URL}/auth/login`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ username, password }),
      });

      if (response.ok) {
        const data = await response.json();

        if (data.success && data.token) {
          // Set the JWT token
          setAuthToken(data.token);
          setToken(data.token);
          setUser(data.user);
          setIsAuthenticated(true);

          // Store token in localStorage
          localStorage.setItem('luxury-lodging-auth', JSON.stringify({
            token: data.token,
            user: data.user,
          }));

          return true;
        }
      }

      return false;
    } catch (error) {
      console.error('Login error:', error);
      return false;
    }
  };

  const logout = () => {
    setUser(null);
    setToken(null);
    setIsAuthenticated(false);
    localStorage.removeItem('luxury-lodging-auth');
    setAuthToken(null);
  };

  return (
    <AuthContext.Provider value={{ isAuthenticated, user, token, login, logout, isLoading }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};
