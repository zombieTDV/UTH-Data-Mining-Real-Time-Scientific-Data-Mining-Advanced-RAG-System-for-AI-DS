import { useState, useCallback } from 'react';
import type { UserEntity } from '../types';

export function useAuthStore() {
  const [user, setUser] = useState<UserEntity | null>(null);

  const login = useCallback((next: UserEntity) => setUser(next), []);
  const logout = useCallback(() => setUser(null), []);

  return { user, login, logout };
}
