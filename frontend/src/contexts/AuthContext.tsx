import React, { createContext, useContext, useState, useEffect } from 'react';
import { setAuthCredentials } from '../services/api';

interface User {
  username: string;
}

interface AuthContextType {
  isAuthenticated: boolean;
  user: User | null;
  login: (username: string, password: string) => Promise<boolean>;
  logout: () => void;
  isLoading: boolean;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    // Check for stored auth on app start
    const checkStoredAuth = async () => {
      try {
        const stored = localStorage.getItem('luxury-lodging-auth');
        if (stored) {
          const parsed = JSON.parse(stored);
          if (parsed.username && parsed.password) {
            // Verify credentials are still valid
            const response = await fetch('/api/auth/verify', {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
              },
              body: JSON.stringify({
                username: parsed.username,
                password: parsed.password,
              }),
            });
            
            if (response.ok) {
              setAuthCredentials(parsed.username, parsed.password);
              setUser({ username: parsed.username });
              setIsAuthenticated(true);
            } else {
              localStorage.removeItem('luxury-lodging-auth');
            }
          }
        }
      } catch (error) {
        console.warn('Failed to verify stored credentials');
        localStorage.removeItem('luxury-lodging-auth');
      } finally {
        setIsLoading(false);
      }
    };

    checkStoredAuth();
  }, []);

  const login = async (username: string, password: string): Promise<boolean> => {
    try {
      const response = await fetch('/api/auth/login', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ username, password }),
      });

      if (response.ok) {
        const data = await response.json();
        setUser(data.user);
        setIsAuthenticated(true);
        setAuthCredentials(username, password);
        
        // Store credentials
        localStorage.setItem('luxury-lodging-auth', JSON.stringify({ username, password }));
        
        return true;
      } else {
        return false;
      }
    } catch (error) {
      console.error('Login error:', error);
      return false;
    }
  };

  const logout = () => {
    setUser(null);
    setIsAuthenticated(false);
    localStorage.removeItem('luxury-lodging-auth');
    setAuthCredentials('', '');
  };

  return (
    <AuthContext.Provider value={{ isAuthenticated, user, login, logout, isLoading }}>
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
