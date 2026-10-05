export interface UserEntity {
  id: string;
  name: string;
  email?: string;
  role: 'admin' | 'researcher' | 'viewer';
  affiliation?: string;
  avatar_url?: string;
}

export interface UserPreferences {
  theme: 'dark' | 'light';
  defaultTab: string;
  language: 'vi' | 'en';
  enableNotifications: boolean;
}

export interface AuthSession {
  user: UserEntity;
  token: string;
  expires_at: string;
}
