import React, { createContext, useContext, useState, useEffect } from 'react';
import { getAdminToken, setAdminToken, clearAdminToken, api } from '../api/client';

interface AuthContextType {
  isAuthenticated: boolean;
  isLoading: boolean;
  token: string | null;
  login: (key: string) => Promise<boolean>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType>({
  isAuthenticated: false,
  isLoading: true,
  token: null,
  login: async () => false,
  logout: async () => {},
});

export const useAuth = () => useContext(AuthContext);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [token, setTokenState] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);

  useEffect(() => {
    async function loadToken() {
      try {
        const savedToken = await getAdminToken();
        if (savedToken) {
          setTokenState(savedToken);
        }
      } catch (err) {
        console.warn('Failed to load admin token:', err);
      } finally {
        setIsLoading(false);
      }
    }
    loadToken();
  }, []);

  const login = async (key: string): Promise<boolean> => {
    try {
      const res = await api.login(key);
      if (res && res.success && res.token) {
        await setAdminToken(res.token);
        setTokenState(res.token);
        return true;
      }
      const errorMsg = (res as any)?.error || 'Kunci otentikasi admin atau PIN tidak cocok.';
      throw new Error(errorMsg);
    } catch (err) {
      console.warn('Admin login failed:', err);
      throw err;
    }
  };

  const logout = async () => {
    await clearAdminToken();
    setTokenState(null);
  };

  return (
    <AuthContext.Provider
      value={{
        isAuthenticated: Boolean(token),
        isLoading,
        token,
        login,
        logout,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};
