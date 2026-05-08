import { useState, useEffect } from 'react';
import type { User } from '@/types';

export function useUser() {
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const fetchUser = async () => {
      try {
        // TODO: Integrate with auth service
        const token = localStorage.getItem('access_token');
        if (!token) {
          setUser(null);
          return;
        }
        // Fetch user from API
        setUser(null); // placeholder
      } catch {
        setUser(null);
      } finally {
        setIsLoading(false);
      }
    };

    fetchUser();
  }, []);

  const logout = () => {
    localStorage.removeItem('access_token');
    localStorage.removeItem('refresh_token');
    setUser(null);
    window.location.href = '/auth/login';
  };

  return { user, isLoading, logout, setUser };
}
